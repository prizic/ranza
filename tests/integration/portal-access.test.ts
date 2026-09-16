/**
 * What the Guest/Resident Portal shows, decided by the database.
 *
 * The Portal's whole security story is that a Resident is not a Staff Member:
 * they authenticate through the same Better Auth instance and map to the same
 * kind of Ranza user, and then reach a completely different set of rows
 * (ADR 0009). That claim is only worth something if the wrong rows are asked
 * for out loud, so this asks for them.
 *
 * It exercises @ranza/stays rather than raw SQL, because the module's query is
 * what the page actually runs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createStaysModule,
  PORTAL_STAY_CAPABILITY,
} from "../../packages/ranza/stays/src";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";

const ORG = "d2d2d2d2-0000-4000-8000-000000000001";
const OTHER_ORG = "d2d2d2d2-0000-4000-8000-000000000002";
const PROPERTY = "d2d2d2d2-0000-4000-8000-000000000011";
const OTHER_PROPERTY = "d2d2d2d2-0000-4000-8000-000000000012";
const UNIT = "d2d2d2d2-0000-4000-8000-000000000021";
const NEIGHBOUR_UNIT = "d2d2d2d2-0000-4000-8000-000000000022";
const OTHER_UNIT = "d2d2d2d2-0000-4000-8000-000000000023";
const RESIDENT = "d2d2d2d2-0000-4000-8000-000000000031";
const NEIGHBOUR = "d2d2d2d2-0000-4000-8000-000000000032";
const FOREIGN_GUEST = "d2d2d2d2-0000-4000-8000-000000000033";
const DEPARTED = "d2d2d2d2-0000-4000-8000-000000000034";
const STAFF = "d2d2d2d2-0000-4000-8000-000000000035";
const OWN_STAY = "d2d2d2d2-0000-4000-8000-000000000041";
const NEIGHBOUR_STAY = "d2d2d2d2-0000-4000-8000-000000000042";
const FOREIGN_STAY = "d2d2d2d2-0000-4000-8000-000000000043";
const DEPARTED_STAY = "d2d2d2d2-0000-4000-8000-000000000044";

// The tenant query path, exactly as the Portal composes it: ranza_app, which is
// not an owner and has no BYPASSRLS. Pointing this at DIRECT_URL would make
// every assertion below pass for the wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const stays = createStaysModule({ db: prisma });

// ranza_app holds SELECT only, so fixtures go in as the owner.
const owner = createPrismaClient(process.env.DIRECT_URL!);

/** Whatever the acting user can see in a table, asked for out loud. */
const rowsVisibleTo = (userId: string, table: string) =>
  withOrganizationContext(prisma, { userId }, (tx) =>
    tx.$queryRawUnsafe<unknown[]>(`select * from public.${table}`),
  );

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'portal-resident@example.test'),
       ($2,'portal-neighbour@example.test'),
       ($3,'portal-foreign@example.test'),
       ($4,'portal-departed@example.test'),
       ($5,'portal-staff@example.test')
     on conflict (id) do nothing`,
    RESIDENT,
    NEIGHBOUR,
    FOREIGN_GUEST,
    DEPARTED,
    STAFF,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Portal Organization','active'),
       ($2,'Other Portal Organization','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1,$2,'Residence Hall'), ($3,$4,'Other Residence')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
    OTHER_PROPERTY,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1,$2,$3,'Room 101','room',2),
       ($4,$2,$3,'Room 102','room',2),
       ($5,$6,$7,'Suite 900','suite',4)
     on conflict (id) do nothing`,
    UNIT,
    PROPERTY,
    ORG,
    NEIGHBOUR_UNIT,
    OTHER_UNIT,
    OTHER_PROPERTY,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'active')
     on conflict (organization_id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1,$3,'active'), ($2,$3,'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    OTHER_ORG,
    PORTAL_STAY_CAPABILITY.moduleKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$2,$5,true), ($3,$4,$5,true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
    OTHER_PROPERTY,
    OTHER_ORG,
    PORTAL_STAY_CAPABILITY.capabilityKey,
  );
  // A Staff Member of the same Organization, reaching the same Property. The
  // Portal must still show them nothing: a membership is not a Stay.
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'manager','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    STAFF,
  );
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, user_id,
        stay_type, status, starts_on, ends_on) values
       ($1,$9,$10,$11,$2,'resident','in_house',date '2026-09-01',null),
       ($3,$9,$10,$12,$4,'resident','in_house',date '2026-09-02',null),
       ($5,$13,$14,$15,$6,'guest','reserved',date '2026-10-01',date '2026-10-04'),
       ($7,$9,$10,$11,$8,'guest','departed',date '2026-08-01',date '2026-08-04')
     on conflict (id) do nothing`,
    OWN_STAY,
    RESIDENT,
    NEIGHBOUR_STAY,
    NEIGHBOUR,
    FOREIGN_STAY,
    FOREIGN_GUEST,
    DEPARTED_STAY,
    DEPARTED,
    ORG,
    PROPERTY,
    UNIT,
    NEIGHBOUR_UNIT,
    OTHER_ORG,
    OTHER_PROPERTY,
    OTHER_UNIT,
  );
});

afterAll(async () => {
  const organizations = [ORG, OTHER_ORG];
  const users = [RESIDENT, NEIGHBOUR, FOREIGN_GUEST, DEPARTED, STAFF];

  // Children first: every foreign key here is ON DELETE RESTRICT, because
  // operational history is never silently removed (AGENTS.md).
  for (const table of [
    "stays",
    "accommodation_units",
    "property_capabilities",
    "organization_memberships",
    "entitlements",
    "subscriptions",
    "properties",
  ]) {
    await owner.$executeRawUnsafe(
      `delete from public.${table} where organization_id in ($1,$2)`,
      ...organizations,
    );
  }
  await owner.$executeRawUnsafe(
    "delete from public.organizations where id in ($1,$2)",
    ...organizations,
  );
  await owner.$executeRawUnsafe(
    "delete from public.users where id in ($1,$2,$3,$4,$5)",
    ...users,
  );

  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("the Portal shows a Guest or Resident their own Stay", () => {
  it("shows the Stay with its Property and Accommodation Unit", async () => {
    const [stay, ...rest] = await stays.listOwnStays(RESIDENT);
    expect(rest).toEqual([]);
    expect(stay).toMatchObject({
      stayType: "resident",
      status: "in_house",
      startsOn: "2026-09-01",
      endsOn: null,
      propertyName: "Residence Hall",
      unitName: "Room 101",
      unitType: "room",
      unitCapacity: 2,
    });
  });

  it("shows nothing belonging to another Resident in the same Property", async () => {
    const seen = await stays.listOwnStays(RESIDENT);
    expect(seen.map((stay) => stay.unitName)).not.toContain("Room 102");
    expect(seen.map((stay) => stay.stayId)).not.toContain(NEIGHBOUR_STAY);
  });

  it("does not reach another Resident's Stay even when it is addressed directly", async () => {
    const rows = await withOrganizationContext(
      prisma,
      { userId: RESIDENT },
      (tx) =>
        tx.$queryRawUnsafe<unknown[]>(
          "select id from public.stays where id = $1",
          NEIGHBOUR_STAY,
        ),
    );
    expect(rows).toEqual([]);
  });

  it("does not reach a Stay in another Organization", async () => {
    // The foreign Stay is real and its own Guest can see it, so an empty result
    // for this Resident is isolation rather than a missing fixture.
    await expect(stays.listOwnStays(FOREIGN_GUEST)).resolves.toHaveLength(1);
    const seen = await stays.listOwnStays(RESIDENT);
    expect(seen.map((stay) => stay.propertyName)).not.toContain(
      "Other Residence",
    );
    const rows = await withOrganizationContext(
      prisma,
      { userId: RESIDENT },
      (tx) =>
        tx.$queryRawUnsafe<unknown[]>(
          "select id from public.stays where id = $1",
          FOREIGN_STAY,
        ),
    );
    expect(rows).toEqual([]);
  });

  it("returns an empty list, not an error, when no Stay is current", async () => {
    await expect(stays.listOwnStays(DEPARTED)).resolves.toEqual([]);
  });
});

describe("the Portal exposes no staff surface", () => {
  it("shows a Staff Member of the same Organization nothing", async () => {
    await expect(stays.listOwnStays(STAFF)).resolves.toEqual([]);
  });

  it.each([
    "organization_memberships",
    "property_assignments",
    "entitlements",
    "subscriptions",
    "property_capabilities",
    "organizations",
  ])("returns no rows from %s to a Resident session", async (table) => {
    await expect(rowsVisibleTo(RESIDENT, table)).resolves.toEqual([]);
  });

  it("reaches only the Property and Unit of the Resident's own Stay", async () => {
    await expect(rowsVisibleTo(RESIDENT, "properties")).resolves.toHaveLength(
      1,
    );
    await expect(
      rowsVisibleTo(RESIDENT, "accommodation_units"),
    ).resolves.toHaveLength(1);
  });

  it("stops reaching the Property once the Stay has departed", async () => {
    await expect(rowsVisibleTo(DEPARTED, "properties")).resolves.toEqual([]);
    await expect(
      rowsVisibleTo(DEPARTED, "accommodation_units"),
    ).resolves.toEqual([]);
  });
});

describe("Portal capabilities follow Entitlements and Property configuration", () => {
  it("gate 1 — a suspended Subscription empties the Portal", async () => {
    await owner.$executeRawUnsafe(
      "update public.subscriptions set status='suspended' where organization_id=$1",
      ORG,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.subscriptions set status='active' where organization_id=$1",
      ORG,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toHaveLength(1);
  });

  it("gate 2 — a revoked Entitlement empties the Portal", async () => {
    await owner.$executeRawUnsafe(
      "update public.entitlements set status='revoked' where organization_id=$1 and module_key=$2",
      ORG,
      PORTAL_STAY_CAPABILITY.moduleKey,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.entitlements set status='active' where organization_id=$1 and module_key=$2",
      ORG,
      PORTAL_STAY_CAPABILITY.moduleKey,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toHaveLength(1);
  });

  it("gate 3 — a capability the Property never enabled empties the Portal", async () => {
    await owner.$executeRawUnsafe(
      "update public.property_capabilities set enabled=false where property_id=$1 and capability_key=$2",
      PROPERTY,
      PORTAL_STAY_CAPABILITY.capabilityKey,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.property_capabilities set enabled=true where property_id=$1 and capability_key=$2",
      PROPERTY,
      PORTAL_STAY_CAPABILITY.capabilityKey,
    );
    await expect(stays.listOwnStays(RESIDENT)).resolves.toHaveLength(1);
  });
});
