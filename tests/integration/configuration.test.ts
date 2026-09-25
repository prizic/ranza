/**
 * Configuration against a real database (ADR 0036).
 *
 * The pgTAP suite proves the policies, grants and triggers one statement at a
 * time. This proves the module on top of them: a save that names a stale
 * version, a save that changes nothing, what the audit record says, and the
 * race between a first Folio and a currency change, run on two connections.
 *
 * Breaks that were run, and what went red:
 *   the version left out of the update's WHERE        CF-S1-16, CF-S2-05
 *   "something differs" left out of the WHERE         CF-S1-17 (unchanged)
 *   the Folio guard dropped                           CF-S1-20 (currency first)
 *   the currency lock dropped                         CF-S1-20 (Folio first)
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  withOrganizationContext,
  createPrismaClient,
} from "../../packages/db/src";
import {
  CONFIGURATION_CAPABILITY,
  ConfigurationCurrencyFixedError,
  ConfigurationInputError,
  ConfigurationRefusedError,
  ConfigurationStaleError,
  createCoreModule,
} from "../../packages/ranza/core/src";
import { openFolioWithin } from "../../packages/ranza/folios/src";
import { latestRecord } from "./audit-record";

const ORG = "cf000002-0000-4000-8000-000000000001";
const PROPERTY = "cf000003-0000-4000-8000-000000000001";
const UNCONFIGURED = "cf000003-0000-4000-8000-000000000002";
const MANAGER = "cf000001-0000-4000-8000-000000000001";
const DESK = "cf000001-0000-4000-8000-000000000002";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

const BASELINE = {
  name: "Configuration Property",
  timezone: "Europe/Istanbul",
  currency: "TRY",
  businessDateCutoff: "04:00",
};

/** Fixtures go in as the owner: ranza_app may not create Properties. */
async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'configuration-manager@example.test'),
       ($2, 'configuration-desk@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Configuration Integration', 'active')
     on conflict (id) do update set name = excluded.name`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1, $3, 'Configuration Property'),
       ($2, $3, 'Unconfigured Property')
     on conflict (id) do nothing`,
    PROPERTY,
    UNCONFIGURED,
    ORG,
  );
  // A re-run starts from the same settings, whatever the last one saved.
  await owner.$executeRawUnsafe(
    `update public.properties
        set name = $2, timezone = $3, currency = $4,
            business_date_cutoff = $5::time
      where id = $1`,
    PROPERTY,
    BASELINE.name,
    BASELINE.timezone,
    BASELINE.currency,
    BASELINE.businessDateCutoff,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $2, 'manager', 'organization_wide'),
       ($1, $3, 'front_desk', 'organization_wide')
     on conflict do nothing`,
    ORG,
    MANAGER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key) values
       ($1, 'platform_core'), ($1, 'billing_folios')
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $3, 'configuration', true),
       ($1, $3, 'finance', true),
       ($2, $3, 'finance', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    UNCONFIGURED,
    ORG,
  );
}

/**
 * A Property of its own with a Guest in house and no Folio yet. Fresh per
 * run: a Folio is never deleted, so a Property that raced once keeps its lock.
 */
async function freshTradingProperty(): Promise<{
  propertyId: string;
  stayId: string;
}> {
  const propertyId = randomUUID();
  const unitId = randomUUID();
  const stayId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1, $2, 'Race Property')`,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1, $2, 'configuration', true), ($1, $2, 'finance', true)`,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1, $2, $3, 'R-101', 'room', 2)`,
    unitId,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on)
     select $1, $2, $3, $4, 'guest', 'in_house',
            app.property_today($3), app.property_today($3) + 2`,
    stayId,
    ORG,
    propertyId,
    unitId,
  );
  return { propertyId, stayId };
}

async function settings(propertyId = PROPERTY) {
  const read = await core.propertySettings(MANAGER, propertyId);
  if (!read) throw new Error("the manager should read these settings");
  return read;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("configuring a Property", () => {
  it(
    "a_property_is_renamed",
    async () => {
      const before = await settings();
      const saved = await core.configureProperty(MANAGER, PROPERTY, {
        ...BASELINE,
        name: "Kordon Otel",
        version: before.version,
      });
      expect(saved.status).toBe("saved");
      expect(saved.version).not.toBe(before.version);
      expect((await settings()).name).toBe("Kordon Otel");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_property_timezone_is_changed",
    async () => {
      const before = await settings();
      await core.configureProperty(MANAGER, PROPERTY, {
        ...BASELINE,
        name: before.name,
        timezone: "Asia/Dubai",
        version: before.version,
      });
      const [today] = await owner.$queryRawUnsafe<{ matches: boolean }[]>(
        `select app.property_today($1::uuid)
                = app.business_date(now(), 'Asia/Dubai', time '04:00') as matches`,
        PROPERTY,
      );
      expect(today?.matches).toBe(true);
      expect((await settings()).timezone).toBe("Asia/Dubai");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_business_day_cutoff_is_changed",
    async () => {
      const before = await settings();
      await core.configureProperty(MANAGER, PROPERTY, {
        name: before.name,
        timezone: before.timezone,
        currency: before.currency,
        businessDateCutoff: "06:30",
        version: before.version,
      });
      expect((await settings()).businessDateCutoff).toBe("06:30");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_second_save_of_a_stale_form_is_refused",
    async () => {
      const read = await settings();
      const form = {
        timezone: read.timezone,
        currency: read.currency,
        businessDateCutoff: read.businessDateCutoff,
        version: read.version,
      };
      // Two people, the same version, at the same moment.
      const results = await Promise.allSettled([
        core.configureProperty(MANAGER, PROPERTY, { ...form, name: "Desk A" }),
        core.configureProperty(MANAGER, PROPERTY, { ...form, name: "Desk B" }),
      ]);
      const saved = results.filter((r) => r.status === "fulfilled");
      const stale = results.filter(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof ConfigurationStaleError,
      );
      expect(saved).toHaveLength(1);
      expect(stale).toHaveLength(1);
      const rejected = stale[0] as PromiseRejectedResult;
      const current = (rejected.reason as ConfigurationStaleError).current;
      // The loser is shown what the winner saved, not left with its own copy.
      expect(["Desk A", "Desk B"]).toContain(current.name);
      expect(current.name).toBe((await settings()).name);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "every_property_change_is_audited_from_and_to",
    async () => {
      const before = await settings();
      await core.configureProperty(MANAGER, PROPERTY, {
        name: "Audited Otel",
        timezone: before.timezone,
        currency: before.currency,
        businessDateCutoff: "05:00",
        version: before.version,
      });
      const record = await latestRecord(owner, "property.configured", PROPERTY);
      expect(record?.locationId).toBe(PROPERTY);
      expect(record?.context).toEqual({
        changed: ["name", "businessDateCutoff"],
        name: { from: before.name, to: "Audited Otel" },
        businessDateCutoff: { from: before.businessDateCutoff, to: "05:00" },
      });

      // A save that changes nothing records nothing and stamps nothing.
      const recordsFor = async () => {
        const [row] = await owner.$queryRawUnsafe<{ n: number }[]>(
          `select count(*)::int as n from audit.records
            where action = 'property.configured' and subject_id = $1::uuid`,
          PROPERTY,
        );
        return row?.n;
      };
      const after = await settings();
      const recorded = await recordsFor();
      const unchanged = await core.configureProperty(MANAGER, PROPERTY, {
        name: after.name,
        timezone: after.timezone,
        currency: after.currency,
        businessDateCutoff: after.businessDateCutoff,
        version: after.version,
      });
      expect(unchanged).toEqual({
        status: "unchanged",
        version: after.version,
      });
      expect(await recordsFor()).toBe(recorded);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a refusal names the field it is about",
    async () => {
      const read = await settings();
      await expect(
        core.configureProperty(MANAGER, PROPERTY, {
          name: "K",
          timezone: read.timezone,
          currency: read.currency,
          businessDateCutoff: read.businessDateCutoff,
          version: read.version,
        }),
      ).rejects.toMatchObject({
        name: "ConfigurationInputError",
        field: "name",
      });
      await expect(
        core.configureProperty(MANAGER, PROPERTY, {
          name: read.name,
          timezone: read.timezone,
          currency: read.currency,
          businessDateCutoff: "02:00",
          version: read.version,
        }),
      ).rejects.toBeInstanceOf(ConfigurationInputError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a Staff Member without the permission is refused, even resubmitting what is saved",
    async () => {
      const read = await settings();
      await expect(
        core.configureProperty(DESK, PROPERTY, {
          name: read.name,
          timezone: read.timezone,
          currency: read.currency,
          businessDateCutoff: read.businessDateCutoff,
          version: read.version,
        }),
      ).rejects.toBeInstanceOf(ConfigurationRefusedError);
      const desk = await core.propertySettings(DESK, PROPERTY);
      expect(desk?.mayConfigure).toBe(false);
      expect(desk?.organization.mayRename).toBe(false);
    },
    DATABASE_BUDGET_MS,
  );
});

describe("renaming the Organization", () => {
  it(
    "an_organization_is_renamed",
    async () => {
      const before = await settings();
      const saved = await core.renameOrganization(MANAGER, PROPERTY, {
        name: "Kordon Hotels",
        version: before.organization.version,
      });
      expect(saved.status).toBe("saved");
      expect((await settings()).organization.name).toBe("Kordon Hotels");
      const record = await latestRecord(owner, "organization.configured", ORG);
      expect(record?.locationId).toBeNull();
      expect(record?.context).toEqual({
        changed: ["name"],
        name: { from: before.organization.name, to: "Kordon Hotels" },
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_stale_organization_rename_is_refused",
    async () => {
      const before = await settings();
      await core.renameOrganization(MANAGER, PROPERTY, {
        name: "First Rename",
        version: before.organization.version,
      });
      await expect(
        core.renameOrganization(MANAGER, PROPERTY, {
          name: "Second Rename",
          version: before.organization.version,
        }),
      ).rejects.toBeInstanceOf(ConfigurationStaleError);
    },
    DATABASE_BUDGET_MS,
  );
});

describe("the screen's reads", () => {
  it(
    "configuration_is_gated_like_every_screen",
    async () => {
      expect(await core.propertySettings(MANAGER, UNCONFIGURED)).toBeNull();
      const reachable = await core.listEntitledProperties(
        MANAGER,
        CONFIGURATION_CAPABILITY,
      );
      const ids = reachable.map((property) => property.propertyId);
      expect(ids).toContain(PROPERTY);
      expect(ids).not.toContain(UNCONFIGURED);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "configuration_lists_what_is_switched_on",
    async () => {
      const answers = await core.listEntitledPropertiesByCapability(MANAGER, [
        CONFIGURATION_CAPABILITY,
        { moduleKey: "billing_folios", capabilityKey: "finance" },
        { moduleKey: "housekeeping", capabilityKey: "housekeeping" },
      ]);
      const onHere = answers
        .filter((answer) =>
          answer.properties.some((p) => p.propertyId === PROPERTY),
        )
        .map((answer) => answer.capability.capabilityKey);
      // Housekeeping is not bought, so it is not listed at all (blueprint 4.6).
      expect(onHere).toEqual(["configuration", "finance"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_form_previews_the_business_date_a_change_makes (server half)",
    async () => {
      const preview = await core.businessDatePreview(
        MANAGER,
        PROPERTY,
        "Pacific/Kiritimati",
        "04:00",
      );
      const [expected] = await owner.$queryRawUnsafe<
        { current: string; proposed: string }[]
      >(
        `select app.property_today($1::uuid)::text as current,
                app.business_date(now(), 'Pacific/Kiritimati', time '04:00')::text
                  as proposed`,
        PROPERTY,
      );
      expect(preview).toEqual(expected);
      const unknown = await core.businessDatePreview(
        MANAGER,
        PROPERTY,
        "Mars/Olympus",
        "04:00",
      );
      expect(unknown?.proposed).toBeNull();
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "offers only zones both Postgres and the runtime know",
    async () => {
      const zones = await core.timezoneNames(MANAGER);
      expect(zones).toContain("Europe/Istanbul");
      expect(zones).toContain("UTC");
      expect(zones.some((zone) => zone.startsWith("Etc/"))).toBe(false);
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a first Folio and a currency change at once", () => {
  it(
    "a_first_folio_racing_a_currency_change_cannot_disagree (the Folio first)",
    async () => {
      const { propertyId, stayId } = await freshTradingProperty();
      const before = await settings(propertyId);
      let opened!: () => void;
      const folioOpened = new Promise<void>((resolve) => (opened = resolve));

      const checkIn = withOrganizationContext(
        prisma,
        { userId: MANAGER },
        async (tx) => {
          const folio = await openFolioWithin(tx, stayId);
          opened();
          await wait(1500);
          return folio;
        },
      );
      await folioOpened;
      const change = core.configureProperty(MANAGER, propertyId, {
        name: before.name,
        timezone: before.timezone,
        currency: "EUR",
        businessDateCutoff: before.businessDateCutoff,
        version: before.version,
      });

      expect(await checkIn).not.toBeNull();
      await expect(change).rejects.toBeInstanceOf(
        ConfigurationCurrencyFixedError,
      );
      expect((await settings(propertyId)).currency).toBe("TRY");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_first_folio_racing_a_currency_change_cannot_disagree (the currency first)",
    async () => {
      const { propertyId, stayId } = await freshTradingProperty();
      let changed!: () => void;
      const currencyChanged = new Promise<void>(
        (resolve) => (changed = resolve),
      );

      const change = withOrganizationContext(
        prisma,
        { userId: MANAGER },
        async (tx) => {
          await tx.$executeRawUnsafe(
            `update public.properties set currency = 'EUR' where id = $1::uuid`,
            propertyId,
          );
          changed();
          await wait(1500);
        },
      );
      await currencyChanged;
      const checkIn = withOrganizationContext(
        prisma,
        { userId: MANAGER },
        (tx) => openFolioWithin(tx, stayId),
      );

      await change;
      // It read TRY before the change committed, waited on the Property row,
      // and was refused rather than committing a TRY Folio at an EUR Property.
      await expect(checkIn).rejects.toThrow(/23514|currency/);
      const [folios] = await owner.$queryRawUnsafe<{ n: number }[]>(
        `select count(*)::int as n from public.folios where property_id = $1::uuid`,
        propertyId,
      );
      expect(folios?.n).toBe(0);
    },
    DATABASE_BUDGET_MS,
  );
});
