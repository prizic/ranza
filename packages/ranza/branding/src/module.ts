import { withOrganizationContext } from "@ranza/db";
import { PORTAL_STAY_CAPABILITY } from "@ranza/stays";
import { recordWithin } from "@ranza/platform-audit";
import { assessBrandColor, requireBrandColor, type Foreground } from "./color";
import type {
  BrandLogo,
  BrandSettings,
  OrganizationBrand,
  SaveBrandInput,
  StayBrand,
  StoredLogo,
} from "./contracts";
import { BrandingRefusedError } from "./errors";
import { inspectLogo, type LogoContentType } from "./image";
import type { BrandingDeps, BrandingTransaction } from "./ports";

/** A policy or a grant said no. */
const INSUFFICIENT_PRIVILEGE = "42501";

interface BrandRow {
  primaryColor: string | null;
  contentType: LogoContentType | null;
  contentHash: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
}

/** The logo's facts, never its bytes: a brand is read on every Portal page. */
const BRAND_COLUMNS = `
  brand.primary_color as "primaryColor",
  logo.content_type as "contentType",
  logo.content_hash as "contentHash",
  logo.size_bytes as "sizeBytes",
  logo.width,
  logo.height`;

/** What the colour is drawn as; null for none, and for a stored value that is not one. */
function drawnAs(
  color: string | null,
): { foreground: Foreground; text: string } | null {
  if (color === null) return null;
  const assessment = assessBrandColor(color);
  return assessment.status === "ok"
    ? { foreground: assessment.foreground, text: assessment.textColor }
    : null;
}

function toLogo(row: BrandRow): BrandLogo | null {
  if (
    row.contentType === null ||
    row.contentHash === null ||
    row.sizeBytes === null ||
    row.width === null ||
    row.height === null
  ) {
    return null;
  }
  return {
    contentType: row.contentType,
    hash: row.contentHash,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
  };
}

function toBrand(row: BrandRow): OrganizationBrand {
  const drawn = drawnAs(row.primaryColor);
  return {
    primaryColor: row.primaryColor,
    primaryForeground: drawn?.foreground ?? null,
    primaryText: drawn?.text ?? null,
    logo: toLogo(row),
  };
}

const DEFAULT_BRAND: OrganizationBrand = {
  primaryColor: null,
  primaryForeground: null,
  primaryText: null,
  logo: null,
};

/** What the Portal asks of a Stay before it shows it, and so before it shows its brand. */
const PORTAL_MODULE = PORTAL_STAY_CAPABILITY.moduleKey;
const PORTAL_CAPABILITY = PORTAL_STAY_CAPABILITY.capabilityKey;

/** What the audit record says a logo was: a hash and a size, never the bytes. */
function logoFact(logo: BrandLogo | null) {
  return logo === null ? null : { hash: logo.hash, sizeBytes: logo.sizeBytes };
}

/**
 * Whether a failure carries a SQLSTATE. Read from the code and from the
 * message: Prisma wraps a driver error, and the code sits in a different place
 * for a model call and for a raw statement.
 */
function raised(error: unknown, sqlstate: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message, meta } = error as {
    code?: unknown;
    message?: unknown;
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
  };
  return (
    code === sqlstate ||
    meta?.driverAdapterError?.cause?.code === sqlstate ||
    (typeof message === "string" && message.includes(sqlstate))
  );
}

/** A write's failure as this module's refusal, or as it was for the host to report. */
function refusal(error: unknown): Error {
  if (raised(error, INSUFFICIENT_PRIVILEGE)) {
    return new BrandingRefusedError({ cause: error });
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * An Organization's brand: one colour and one logo (blueprint 8, ADR 0046).
 *
 * Every command runs inside the acting user's request context (ADR 0007), so
 * the row-level policies decide who may change it and who may read it (ADR
 * 0012, ADR 0009): Staff with `branding.manage` across the whole Organization,
 * and a Resident of an Organization they have a current Stay with, at a
 * Property whose Portal is available to them: the Stay reads below ask the Portal's
 * own capability gate, as the Stay list does, and the policies ask it again.
 */
export function createBrandingModule(deps: BrandingDeps) {
  /**
   * Whether the acting user holds every gate a change to the brand needs, and
   * if not which kind kept them out: the permission and the commercial gates
   * of blueprint 3.5 are told apart from reach, because the screen says
   * different things to them.
   */
  async function mayManage(
    tx: BrandingTransaction,
    organizationId: string,
  ): Promise<{ may: boolean; reason: BrandSettings["reason"] }> {
    const [answer] = await tx.$queryRaw<
      { reach: boolean; permitted: boolean; available: boolean }[]
    >`
      select app.has_organization_wide_reach(${organizationId}::uuid) as "reach",
             app.has_organization_permission(
               ${organizationId}::uuid, 'branding.manage') as "permitted",
             app.can_use_capability_in_organization(
               ${organizationId}::uuid, 'platform_core', 'configuration')
               as "available"
    `;
    if (answer?.reach && answer.permitted && answer.available) {
      return { may: true, reason: null };
    }
    return {
      may: false,
      reason: answer?.permitted && answer.available ? "reach" : "unavailable",
    };
  }

  /** The brand as the policies let the acting user see it, or none. */
  async function readBrand(
    tx: BrandingTransaction,
    organizationId: string,
  ): Promise<BrandRow | undefined> {
    const [row] = await tx.$queryRawUnsafe<BrandRow[]>(
      `select ${BRAND_COLUMNS}
         from public.organization_brands as brand
         left join public.organization_brand_logos as logo
           on logo.organization_id = brand.organization_id
        where brand.organization_id = $1::uuid`,
      organizationId,
    );
    return row;
  }

  /**
   * Makes two changes to one Organization's brand happen one after the other,
   * so that each audit record's old value is what that change replaced. A row
   * lock cannot do it for an Organization that has no row yet.
   */
  async function serialise(
    tx: BrandingTransaction,
    organizationId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      select pg_advisory_xact_lock(
        hashtextextended(${`branding:${organizationId}`}, 0))
    `;
  }

  /**
   * The brand the Branding screen edits, and whether the viewer may change it.
   * A viewer who may not is told so and shown the default: the policies return
   * no row to them, which is the same answer as there being none.
   */
  async function brandSettings(
    userId: string,
    organizationId: string,
  ): Promise<BrandSettings> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const row = await readBrand(tx, organizationId);
      const { may, reason } = await mayManage(tx, organizationId);
      return {
        canManage: may,
        reason,
        brand: row ? toBrand(row) : DEFAULT_BRAND,
      };
    });
  }

  /**
   * The brand of each of the viewer's own current Stays, for the Portal.
   *
   * Keyed by the Stay and not by the Organization: a Resident is not a member
   * of one and must not learn its shape (ADR 0009). A Stay whose Organization
   * set no brand is absent, which is the default theme. Bounded by the
   * Resident's own policies as well as by the viewer's own Stay, so a Staff
   * Member's membership adds nothing here.
   */
  async function stayBrands(userId: string): Promise<readonly StayBrand[]> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.$queryRawUnsafe<(BrandRow & { stayId: string })[]>(
        `select stay.id as "stayId", ${BRAND_COLUMNS}
           from public.stays as stay
           join public.organization_brands as brand
             on brand.organization_id = stay.organization_id
           left join public.organization_brand_logos as logo
             on logo.organization_id = brand.organization_id
          where stay.user_id = app.current_user_id()
            and stay.status in ('reserved', 'in_house')
            and app.resident_can_use_capability(
                  stay.property_id, $1, $2)`,
        PORTAL_MODULE,
        PORTAL_CAPABILITY,
      );
      return rows.map((row) => ({ stayId: row.stayId, ...toBrand(row) }));
    });
  }

  async function readLogo(
    tx: BrandingTransaction,
    column: "organization_id" | "stay_id",
    id: string,
  ): Promise<StoredLogo | null> {
    const [row] = await tx.$queryRawUnsafe<
      {
        content: Uint8Array | null;
        contentType: LogoContentType | null;
        contentHash: string | null;
      }[]
    >(
      column === "organization_id"
        ? `select content, content_type as "contentType",
                  content_hash as "contentHash"
             from public.organization_brand_logos
            where organization_id = $1::uuid`
        : `select logo.content, logo.content_type as "contentType",
                  logo.content_hash as "contentHash"
             from public.stays as stay
             join public.organization_brand_logos as logo
               on logo.organization_id = stay.organization_id
            where stay.id = $1::uuid
              and stay.user_id = app.current_user_id()
              and stay.status in ('reserved', 'in_house')
              and app.resident_can_use_capability(
                    stay.property_id, $2, $3)`,
      id,
      ...(column === "organization_id"
        ? []
        : [PORTAL_MODULE, PORTAL_CAPABILITY]),
    );
    if (!row?.content || !row.contentType || !row.contentHash) return null;
    return {
      bytes: row.content,
      contentType: row.contentType,
      hash: row.contentHash,
    };
  }

  /**
   * An Organization's logo, for Staff who manage its brand. Null for anyone
   * else and for no logo, which are deliberately the same answer.
   */
  async function logoOf(
    userId: string,
    organizationId: string,
  ): Promise<StoredLogo | null> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      readLogo(tx, "organization_id", organizationId),
    );
  }

  /**
   * The logo of the Organization one of the viewer's own current Stays is with.
   * Null for a Stay that is not theirs, not current, or whose Organization set
   * no logo.
   */
  async function logoOfStay(
    userId: string,
    stayId: string,
  ): Promise<StoredLogo | null> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      readLogo(tx, "stay_id", stayId),
    );
  }

  /**
   * Sets the colour, the logo, or both. What the caller leaves out stays as it
   * is. Validation happens before any statement runs; the database then holds
   * the same rules in its own constraints, so a defect here cannot store a
   * logo the format check would have refused.
   *
   * Nothing is audited when nothing changed.
   */
  async function saveBrand(
    userId: string,
    input: SaveBrandInput,
  ): Promise<OrganizationBrand> {
    const color =
      typeof input.primaryColor === "string"
        ? requireBrandColor(input.primaryColor).color
        : input.primaryColor;
    const logo =
      input.logo === undefined || input.logo === null
        ? input.logo
        : { bytes: input.logo, facts: inspectLogo(input.logo) };

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      await serialise(tx, input.organizationId);
      const before = await readBrand(tx, input.organizationId);
      const previous = before ? toBrand(before) : null;
      const nextColor =
        color === undefined ? (previous?.primaryColor ?? null) : color;

      try {
        await tx.$executeRaw`
          insert into public.organization_brands
            (organization_id, primary_color, updated_by)
          values (${input.organizationId}::uuid, ${nextColor},
                  app.current_user_id())
          on conflict (organization_id) do update
            set primary_color = excluded.primary_color,
                updated_by = app.current_user_id(),
                updated_at = now()
        `;
        if (logo !== undefined && logo !== null) {
          await tx.$executeRaw`
            insert into public.organization_brand_logos
              (organization_id, content, content_type, content_hash,
               size_bytes, width, height, updated_by)
            values (${input.organizationId}::uuid,
                    ${Buffer.from(logo.bytes)}::bytea,
                    ${logo.facts.contentType}, ${logo.facts.hash},
                    ${logo.facts.sizeBytes}::int, ${logo.facts.width}::int,
                    ${logo.facts.height}::int, app.current_user_id())
            on conflict (organization_id) do update
              set content = excluded.content,
                  content_type = excluded.content_type,
                  content_hash = excluded.content_hash,
                  size_bytes = excluded.size_bytes,
                  width = excluded.width,
                  height = excluded.height,
                  updated_by = app.current_user_id(),
                  updated_at = now()
          `;
        } else if (logo === null) {
          await tx.$executeRaw`
            update public.organization_brand_logos
               set content = null, content_type = null, content_hash = null,
                   size_bytes = null, width = null, height = null,
                   updated_by = app.current_user_id(), updated_at = now()
             where organization_id = ${input.organizationId}::uuid
          `;
        }
      } catch (error: unknown) {
        throw refusal(error);
      }

      const after = await readBrand(tx, input.organizationId);
      if (!after) throw new BrandingRefusedError();
      const brand = toBrand(after);

      const colorChanged =
        (previous?.primaryColor ?? null) !== brand.primaryColor;
      const logoChanged =
        (previous?.logo?.hash ?? null) !== (brand.logo?.hash ?? null);
      if (colorChanged || logoChanged) {
        await recordWithin(tx, {
          organizationId: input.organizationId,
          actorId: userId,
          action: "branding.changed",
          subjectType: "organization_brand",
          subjectId: input.organizationId,
          context: {
            changed: [
              ...(colorChanged ? ["color"] : []),
              ...(logoChanged ? ["logo"] : []),
            ],
            ...(colorChanged
              ? {
                  color: {
                    from: previous?.primaryColor ?? null,
                    to: brand.primaryColor,
                  },
                }
              : {}),
            ...(logoChanged
              ? {
                  logo: {
                    from: logoFact(previous?.logo ?? null),
                    to: logoFact(brand.logo),
                  },
                }
              : {}),
          },
        });
      }
      return brand;
    });
  }

  /**
   * Returns the brand to Ranza's own theme: no colour, no logo. The row stays
   * and the audit record keeps what was there (nothing is deleted); one that
   * was already the default records nothing.
   */
  async function resetBrand(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      await serialise(tx, organizationId);
      // Asked first, and of everybody: an update that matches nothing raises
      // nothing, so a Resident who can read the brand but not change it would
      // otherwise reach the audit record below having reset nothing.
      if (!(await mayManage(tx, organizationId)).may) {
        throw new BrandingRefusedError();
      }
      const before = await readBrand(tx, organizationId);
      const previous = before ? toBrand(before) : DEFAULT_BRAND;
      if (previous.primaryColor === null && previous.logo === null) return;

      try {
        await tx.$executeRaw`
          update public.organization_brands
             set primary_color = null, updated_by = app.current_user_id(),
                 updated_at = now()
           where organization_id = ${organizationId}::uuid
        `;
        await tx.$executeRaw`
          update public.organization_brand_logos
             set content = null, content_type = null, content_hash = null,
                 size_bytes = null, width = null, height = null,
                 updated_by = app.current_user_id(), updated_at = now()
           where organization_id = ${organizationId}::uuid
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      await recordWithin(tx, {
        organizationId,
        actorId: userId,
        action: "branding.reset",
        subjectType: "organization_brand",
        subjectId: organizationId,
        context: {
          changed: [
            ...(previous.primaryColor === null ? [] : ["color"]),
            ...(previous.logo === null ? [] : ["logo"]),
          ],
          ...(previous.primaryColor === null
            ? {}
            : { color: { from: previous.primaryColor, to: null } }),
          ...(previous.logo === null
            ? {}
            : { logo: { from: logoFact(previous.logo), to: null } }),
        },
      });
    });
  }

  return {
    brandSettings,
    stayBrands,
    logoOf,
    logoOfStay,
    saveBrand,
    resetBrand,
  };
}

export type BrandingModule = ReturnType<typeof createBrandingModule>;
