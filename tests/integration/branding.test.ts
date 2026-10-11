/**
 * An Organization's brand against a real database, as `ranza_app`
 * (RANZ-47, BR-S1-*).
 *
 * The pgTAP suite proves what each policy, grant and constraint admits one
 * statement at a time. This proves the paths they sit on: that what an Owner
 * saves is what a Resident's Stay reads back, that every refusal leaves the
 * brand as it was, that a Resident of two Organizations gets each Stay's own
 * brand, and that the audit trail holds exactly what happened and none of the
 * bytes.
 *
 * Each test brings its own Organizations, because an audit record is history
 * that is never deleted and a fixed id would find yesterday's.
 *
 * Breaks that were run, and what went red:
 *   the advisory lock removed from saveBrand and resetBrand        BR-S1-31 (both: with a brand, and with none yet)
 *   the permission check removed from resetBrand                   BR-S1-13 (a Manager's reset resolved; a Resident's recorded a reset that reset nothing)
 *   the user filter removed from the logo-of-a-Stay query          BR-S1-35 (a Staff Member with the permission read a Resident's Stay's logo)
 *   change detection removed from saveBrand                        BR-S1-27 (three records where one was written)
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { latestRecord } from "./audit-record";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  BrandingInputError,
  BrandingRefusedError,
  createBrandingModule,
} from "../../packages/ranza/branding/src";
import { jpeg, png, svg } from "../unit/branding-images";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const branding = createBrandingModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const SHIPPED = "00000000-0000-0000-0000-000000000000";
const TAG = randomUUID().slice(0, 8);

interface Fixture {
  organization: string;
  property: string;
  /** The Organization's Owner. */
  admin: string;
  /** A second person who may manage the brand, from a role the Organization wrote. */
  keeper: string;
  manager: string;
  frontDesk: string;
  /** Holds branding.manage at one Property only. */
  scoped: string;
  /** A Resident with a current Stay here. */
  resident: string;
  residentStay: string;
}

async function seed(label: string): Promise<Fixture> {
  const f: Fixture = {
    organization: randomUUID(),
    property: randomUUID(),
    admin: randomUUID(),
    keeper: randomUUID(),
    manager: randomUUID(),
    frontDesk: randomUUID(),
    scoped: randomUUID(),
    resident: randomUUID(),
    residentStay: randomUUID(),
  };
  const people: [string, string, string, string][] = [
    [f.admin, "owner", SHIPPED, "organization_wide"],
    [f.keeper, "brand_keeper", f.organization, "organization_wide"],
    [f.manager, "manager", SHIPPED, "organization_wide"],
    [f.frontDesk, "front_desk", SHIPPED, "organization_wide"],
    [f.scoped, "brand_keeper", f.organization, "assigned_properties"],
  ];
  for (const id of [...people.map(([person]) => person), f.resident]) {
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      id,
      `brand-${TAG}-${label}-${id.slice(0, 8)}@example.test`,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, $2, 'active')`,
    f.organization,
    `Brand Integration ${label} ${TAG}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1::uuid, $2::uuid, $3)`,
    f.property,
    f.organization,
    `Brand House ${label}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1::uuid, 'active')`,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1::uuid, 'platform_core', 'active')`,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1::uuid, $2::uuid, 'configuration', true)`,
    f.property,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1::uuid, 'brand_keeper', $1::uuid, 'Brand keeper', array['branding.manage'])`,
    f.organization,
  );
  for (const [id, role, scope, access] of people) {
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, role_scope_id, access_scope)
       values ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
      f.organization,
      id,
      role,
      scope,
      access,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid)`,
    f.property,
    f.organization,
    f.scoped,
  );
  f.residentStay = await staying(f.organization, f.property, f.resident);
  return f;
}

/** A current Stay for somebody, in a Unit of their own. */
async function staying(
  organization: string,
  property: string,
  person: string,
): Promise<string> {
  const unit = randomUUID();
  const stay = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2)`,
    unit,
    property,
    organization,
    `Room ${unit.slice(0, 6)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, user_id,
        stay_type, status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
             'resident', 'in_house', date '2026-09-01', null)`,
    stay,
    organization,
    property,
    unit,
    person,
  );
  return stay;
}

async function count(sql: string, ...values: unknown[]): Promise<number> {
  const [row] = await owner.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values);
  return Number(row?.n ?? 0);
}

async function records(organization: string, action: string): Promise<number> {
  return count(
    `select count(*) as n from audit.records
      where organization_id = $1::uuid and action = $2`,
    organization,
    action,
  );
}

interface ColourLink {
  from: string | null;
  to: string;
}

/**
 * An Organization's colour changes in the order they happened, found by what
 * each replaced rather than by when it was stamped: a record is stamped with
 * the time its transaction began, and the one that waited on the other's lock
 * began first. Throws when the records do not form one unbroken chain.
 */
async function colourChain(organization: string): Promise<ColourLink[]> {
  const rows = await owner.$queryRawUnsafe<
    { context: { color: ColourLink } }[]
  >(
    `select context from audit.records
      where organization_id = $1::uuid and action = 'branding.changed'
        and context ? 'color'`,
    organization,
  );
  const links = rows.map((row) => row.context.color);
  const ordered: ColourLink[] = [];
  let current: string | null = null;
  while (ordered.length < links.length) {
    const next = links.find((link) => link.from === current);
    if (!next) {
      throw new Error(
        `the colour records do not chain: ${JSON.stringify(links)}`,
      );
    }
    ordered.push(next);
    current = next.to;
  }
  return ordered;
}

async function rejected(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error: unknown) {
    return error instanceof BrandingInputError ? error.rejection : error;
  }
  return null;
}

const GREEN = "#0f5132";

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("branding an Organization", () => {
  it("BR-S1-01: a saved colour and logo are what the Resident's Stay reads back", async () => {
    const f = await seed("main");
    const bytes = png(300, 200);

    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: "#0F5132",
      logo: bytes,
    });

    const settings = await branding.brandSettings(f.admin, f.organization);
    expect(settings.canManage).toBe(true);
    expect(settings.brand).toMatchObject({
      primaryColor: GREEN,
      primaryForeground: "#ffffff",
      logo: { contentType: "image/png", width: 300, height: 200 },
    });

    const seen = await branding.stayBrands(f.resident);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      stayId: f.residentStay,
      primaryColor: GREEN,
      primaryForeground: "#ffffff",
    });
    expect(seen[0]!.logo?.hash).toBe(settings.brand.logo?.hash);

    const logo = await branding.logoOfStay(f.resident, f.residentStay);
    expect(logo?.hash).toBe(settings.brand.logo?.hash);
    expect(Buffer.from(logo!.bytes).equals(bytes)).toBe(true);
  });

  it("BR-S1-04: an unreadable colour is refused and nothing is written", async () => {
    const f = await seed("unreadable");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
    });
    const before = await records(f.organization, "branding.changed");

    expect(
      await rejected(
        branding.saveBrand(f.admin, {
          organizationId: f.organization,
          primaryColor: "#ffeb3b",
        }),
      ),
    ).toMatchObject({ field: "color", reason: "unreadable" });
    expect(
      await rejected(
        branding.saveBrand(f.admin, {
          organizationId: f.organization,
          primaryColor: "not a colour",
        }),
      ),
    ).toEqual({ field: "color", reason: "invalid" });

    const settings = await branding.brandSettings(f.admin, f.organization);
    expect(settings.brand.primaryColor).toBe(GREEN);
    expect(await records(f.organization, "branding.changed")).toBe(before);
  });

  it("BR-S1-05: an uploaded logo is stored with the facts read from its bytes", async () => {
    const f = await seed("facts");
    const bytes = jpeg(640, 480);
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      logo: bytes,
    });

    const [row] = await owner.$queryRawUnsafe<
      {
        content_type: string;
        size_bytes: number;
        width: number;
        height: number;
        content_hash: string;
        stored: Uint8Array;
      }[]
    >(
      `select content_type, size_bytes, width, height, content_hash,
              content as stored
         from public.organization_brand_logos where organization_id = $1::uuid`,
      f.organization,
    );
    expect(row).toMatchObject({
      content_type: "image/jpeg",
      size_bytes: bytes.length,
      width: 640,
      height: 480,
    });
    expect(Buffer.from(row!.stored).equals(bytes)).toBe(true);
    expect(row!.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("BR-S1-06: an SVG logo is refused and nothing is stored", async () => {
    const f = await seed("svg");
    expect(
      await rejected(
        branding.saveBrand(f.admin, {
          organizationId: f.organization,
          logo: svg(),
        }),
      ),
    ).toEqual({ field: "logo", reason: "svg" });
    expect(
      await count(
        `select count(*) as n from public.organization_brand_logos
          where organization_id = $1::uuid`,
        f.organization,
      ),
    ).toBe(0);
    expect(await records(f.organization, "branding.changed")).toBe(0);
  });

  it("BR-S1-09: a file that is not an image is refused whatever it is called", async () => {
    const f = await seed("notimage");
    for (const bytes of [
      Buffer.from("logo.png, said the name; the contents said otherwise"),
      Buffer.from("%PDF-1.7"),
      Buffer.alloc(0),
    ]) {
      expect(
        await rejected(
          branding.saveBrand(f.admin, {
            organizationId: f.organization,
            logo: bytes,
          }),
        ),
      ).toMatchObject({ field: "logo" });
    }
    expect(
      await count(
        `select count(*) as n from public.organization_brands
          where organization_id = $1::uuid`,
        f.organization,
      ),
    ).toBe(0);
  });

  it("BR-S1-12: a reset empties the brand and keeps the rows", async () => {
    const f = await seed("reset");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: png(300, 200),
    });

    await branding.resetBrand(f.admin, f.organization);

    const settings = await branding.brandSettings(f.admin, f.organization);
    expect(settings.brand).toEqual({
      primaryColor: null,
      primaryForeground: null,
      logo: null,
    });
    expect(await branding.logoOfStay(f.resident, f.residentStay)).toBeNull();
    expect(await branding.stayBrands(f.resident)).toEqual([
      {
        stayId: f.residentStay,
        primaryColor: null,
        primaryForeground: null,
        logo: null,
      },
    ]);
    // Emptied in place: nothing was deleted, and the application role could not.
    expect(
      await count(
        `select count(*) as n from public.organization_brands
          where organization_id = $1::uuid`,
        f.organization,
      ),
    ).toBe(1);
    expect(
      await count(
        `select count(*) as n from public.organization_brand_logos
          where organization_id = $1::uuid and content is null`,
        f.organization,
      ),
    ).toBe(1);

    // And a new brand can be set over the emptied rows.
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: "#1a5d3a",
    });
    expect(
      (await branding.brandSettings(f.admin, f.organization)).brand
        .primaryColor,
    ).toBe("#1a5d3a");
  });

  it("BR-S1-13: a Manager is refused through the module", async () => {
    const f = await seed("refused");
    for (const person of [f.manager, f.frontDesk]) {
      await expect(
        branding.saveBrand(person, {
          organizationId: f.organization,
          primaryColor: GREEN,
        }),
      ).rejects.toBeInstanceOf(BrandingRefusedError);
      await expect(
        branding.resetBrand(person, f.organization),
      ).rejects.toBeInstanceOf(BrandingRefusedError);
    }
    // A role the Organization wrote, holding the permission alone, may.
    await branding.saveBrand(f.keeper, {
      organizationId: f.organization,
      primaryColor: GREEN,
    });
    expect(
      (await branding.brandSettings(f.admin, f.organization)).brand
        .primaryColor,
    ).toBe(GREEN);
  });

  it("BR-S1-13: a Resident who can read the brand cannot reset it, nor record that they did", async () => {
    const f = await seed("residentreset");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
    });
    // A Staff Member who is also staying here reads the brand as a Resident.
    const staff = f.manager;
    await staying(f.organization, f.property, staff);
    expect(await branding.stayBrands(staff)).toHaveLength(1);

    await expect(
      branding.resetBrand(staff, f.organization),
    ).rejects.toBeInstanceOf(BrandingRefusedError);
    expect(await records(f.organization, "branding.reset")).toBe(0);
    expect(
      (await branding.brandSettings(f.admin, f.organization)).brand
        .primaryColor,
    ).toBe(GREEN);
  });

  it("BR-S1-17: another Organization's brand is not read through the module", async () => {
    const mine = await seed("mine");
    const theirs = await seed("theirs");
    await branding.saveBrand(theirs.admin, {
      organizationId: theirs.organization,
      primaryColor: "#7a1e3c",
      logo: png(300, 200),
    });

    const looked = await branding.brandSettings(
      mine.admin,
      theirs.organization,
    );
    expect(looked.canManage).toBe(false);
    expect(looked.brand.primaryColor).toBeNull();
    expect(await branding.logoOf(mine.admin, theirs.organization)).toBeNull();
    await expect(
      branding.saveBrand(mine.admin, {
        organizationId: theirs.organization,
        primaryColor: GREEN,
      }),
    ).rejects.toBeInstanceOf(BrandingRefusedError);
    expect(
      (await branding.brandSettings(theirs.admin, theirs.organization)).brand
        .primaryColor,
    ).toBe("#7a1e3c");
  });

  it("BR-S1-20: a Resident of one Organization reads nothing of another's brand", async () => {
    const here = await seed("here");
    const there = await seed("there");
    await branding.saveBrand(there.admin, {
      organizationId: there.organization,
      primaryColor: "#7a1e3c",
      logo: png(300, 200),
    });

    // Their own Organization set nothing, and the other's colour and logo do
    // not stand in for it.
    expect(await branding.stayBrands(here.resident)).toEqual([]);
    // Asking for the other Organization's Stay is the same answer as for none.
    expect(
      await branding.logoOfStay(here.resident, there.residentStay),
    ).toBeNull();
    expect(await branding.logoOfStay(here.resident, randomUUID())).toBeNull();
  });

  it("BR-S1-21: each Stay of a Resident of two Organizations carries its own brand", async () => {
    const a = await seed("two-a");
    const b = await seed("two-b");
    await branding.saveBrand(a.admin, {
      organizationId: a.organization,
      primaryColor: GREEN,
      logo: png(300, 200),
    });
    await branding.saveBrand(b.admin, {
      organizationId: b.organization,
      primaryColor: "#7a1e3c",
    });
    const traveller = randomUUID();
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      traveller,
      `brand-${TAG}-traveller@example.test`,
    );
    const stayAtA = await staying(a.organization, a.property, traveller);
    const stayAtB = await staying(b.organization, b.property, traveller);

    const seen = await branding.stayBrands(traveller);
    expect(seen).toHaveLength(2);
    const byStay = new Map(seen.map((entry) => [entry.stayId, entry]));
    expect(byStay.get(stayAtA)).toMatchObject({
      primaryColor: GREEN,
      logo: { contentType: "image/png" },
    });
    expect(byStay.get(stayAtB)).toMatchObject({
      primaryColor: "#7a1e3c",
      logo: null,
    });
    // The logo of each Stay is that Stay's, and B has none.
    expect(await branding.logoOfStay(traveller, stayAtA)).not.toBeNull();
    expect(await branding.logoOfStay(traveller, stayAtB)).toBeNull();
  });

  it("BR-S1-22: a member without the permission is shown the default and told they may not change it", async () => {
    const f = await seed("default");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: png(300, 200),
    });

    for (const person of [f.manager, f.frontDesk]) {
      const settings = await branding.brandSettings(person, f.organization);
      expect(settings).toEqual({
        canManage: false,
        brand: { primaryColor: null, primaryForeground: null, logo: null },
      });
      expect(await branding.logoOf(person, f.organization)).toBeNull();
    }
  });

  it("BR-S1-30: a holder who reaches one Property is told they may not change the brand", async () => {
    const f = await seed("scoped");
    const settings = await branding.brandSettings(f.scoped, f.organization);
    expect(settings.canManage).toBe(false);
    await expect(
      branding.saveBrand(f.scoped, {
        organizationId: f.organization,
        primaryColor: GREEN,
      }),
    ).rejects.toBeInstanceOf(BrandingRefusedError);
  });

  it("BR-S1-34: an Organization that never branded reads as the default", async () => {
    const f = await seed("never");
    expect(await branding.stayBrands(f.resident)).toEqual([]);
    expect(await branding.brandSettings(f.admin, f.organization)).toEqual({
      canManage: true,
      brand: { primaryColor: null, primaryForeground: null, logo: null },
    });
    // Resetting nothing is not an error and records nothing.
    await branding.resetBrand(f.admin, f.organization);
    expect(await records(f.organization, "branding.reset")).toBe(0);
  });

  it("BR-S1-35: the logo of a Stay that is not the viewer's own current Stay is not found", async () => {
    const f = await seed("stolen");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      logo: png(300, 200),
    });
    const stranger = randomUUID();
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      stranger,
      `brand-${TAG}-stranger@example.test`,
    );

    // Somebody else's Stay, the Staff Member's own membership, and a Stay that
    // has ended: each is a bodiless nothing.
    expect(await branding.logoOfStay(stranger, f.residentStay)).toBeNull();
    expect(await branding.logoOfStay(f.admin, f.residentStay)).toBeNull();
    await owner.$executeRawUnsafe(
      `update public.stays set status = 'departed', ends_on = date '2026-09-05',
              departed_at = now() where id = $1::uuid`,
      f.residentStay,
    );
    expect(await branding.logoOfStay(f.resident, f.residentStay)).toBeNull();
    expect(await branding.stayBrands(f.resident)).toEqual([]);
  });
});

describe("what is recorded", () => {
  it("BR-S1-25: a change is audited with the colour and the logo's hash and size but never its bytes", async () => {
    const f = await seed("audit");
    const bytes = png(300, 200);

    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: bytes,
    });
    const settings = await branding.brandSettings(f.admin, f.organization);
    const first = await latestRecord(owner, "branding.changed", f.organization);
    expect(first?.locationId).toBeNull();
    expect(first?.context).toEqual({
      changed: ["color", "logo"],
      color: { from: null, to: GREEN },
      logo: {
        from: null,
        to: { hash: settings.brand.logo!.hash, sizeBytes: bytes.length },
      },
    });

    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: "#1a5d3a",
    });
    const second = await latestRecord(
      owner,
      "branding.changed",
      f.organization,
    );
    expect(second?.context).toEqual({
      changed: ["color"],
      color: { from: GREEN, to: "#1a5d3a" },
    });

    // Nothing in what was written could be the file: no bytes, no encoding of them.
    const written = JSON.stringify(first?.context);
    expect(written).not.toContain(bytes.toString("base64"));
    expect(written).not.toContain(bytes.toString("hex"));
    expect(Object.keys(first!.context)).not.toContain("content");
  });

  it("BR-S1-26: a reset is audited and a reset of the default is not", async () => {
    const f = await seed("reset-audit");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: png(300, 200),
    });
    const logo = (await branding.brandSettings(f.admin, f.organization)).brand
      .logo!;

    await branding.resetBrand(f.admin, f.organization);
    const reset = await latestRecord(owner, "branding.reset", f.organization);
    expect(reset?.context).toEqual({
      changed: ["color", "logo"],
      color: { from: GREEN, to: null },
      logo: { from: { hash: logo.hash, sizeBytes: logo.sizeBytes }, to: null },
    });

    await branding.resetBrand(f.admin, f.organization);
    expect(await records(f.organization, "branding.reset")).toBe(1);
  });

  it("BR-S1-27: a save that changes nothing records nothing", async () => {
    const f = await seed("noop");
    const bytes = png(300, 200);
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: bytes,
    });
    expect(await records(f.organization, "branding.changed")).toBe(1);

    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
      logo: bytes,
    });
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: "#0F5132",
    });
    expect(await records(f.organization, "branding.changed")).toBe(1);
  });

  it("BR-S1-31: two concurrent saves are serialised and their audit records chain", async () => {
    const f = await seed("race");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
    });
    const initial = await records(f.organization, "branding.changed");
    expect(initial).toBe(1);

    await Promise.all([
      branding.saveBrand(f.admin, {
        organizationId: f.organization,
        primaryColor: "#111111",
      }),
      branding.saveBrand(f.keeper, {
        organizationId: f.organization,
        primaryColor: "#222222",
      }),
    ]);

    // Each of the two replaced exactly what the one before it left.
    const [first, second, third] = await colourChain(f.organization);
    expect(first).toEqual({ from: null, to: GREEN });
    expect(new Set([second!.to, third!.to])).toEqual(
      new Set(["#111111", "#222222"]),
    );
    expect(
      (await branding.brandSettings(f.admin, f.organization)).brand
        .primaryColor,
    ).toBe(third!.to);
  });

  it("BR-S1-31: and so do two first saves of an Organization with no brand yet", async () => {
    const f = await seed("race-first");
    await Promise.all([
      branding.saveBrand(f.admin, {
        organizationId: f.organization,
        primaryColor: "#111111",
      }),
      branding.saveBrand(f.keeper, {
        organizationId: f.organization,
        primaryColor: "#222222",
      }),
    ]);
    const chain = await colourChain(f.organization);
    expect(chain).toHaveLength(2);
    expect(chain[0]!.from).toBeNull();
    expect(new Set(chain.map((link) => link.to))).toEqual(
      new Set(["#111111", "#222222"]),
    );
  });
});

describe("the tables, read as the application role", () => {
  it("BR-S1-18: the application role holds no DELETE on either table", async () => {
    const f = await seed("grants");
    await branding.saveBrand(f.admin, {
      organizationId: f.organization,
      primaryColor: GREEN,
    });
    await expect(
      withOrganizationContext(prisma, { userId: f.admin }, (tx) =>
        tx.$executeRawUnsafe(
          `delete from public.organization_brands where organization_id = $1::uuid`,
          f.organization,
        ),
      ),
    ).rejects.toThrow();
  });
});
