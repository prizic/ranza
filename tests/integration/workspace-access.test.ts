/**
 * What the Operator Workspace shows a Staff Member, decided by the database.
 *
 * Blueprint 3.5 lists five gates and requires each to deny on its own. That is
 * only believable if each one is switched off in turn while the others stay on,
 * so that is what this does: one fixture that grants access, then one gate
 * removed at a time.
 *
 * It exercises @ranza/core rather than raw SQL, because the module's query is
 * what the page actually runs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIT_CAPABILITY,
  createCoreModule,
  TODAY_CAPABILITY,
} from "../../packages/ranza/core/src";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";

const ORG = "d1d1d1d1-0000-4000-8000-000000000001";
const OTHER_ORG = "d1d1d1d1-0000-4000-8000-000000000002";
const ASSIGNED = "d1d1d1d1-0000-4000-8000-000000000011";
const UNASSIGNED = "d1d1d1d1-0000-4000-8000-000000000012";
const OTHER_PROPERTY = "d1d1d1d1-0000-4000-8000-000000000013";
const MEMBER = "d1d1d1d1-0000-4000-8000-000000000021";
const STRANGER = "d1d1d1d1-0000-4000-8000-000000000022";
const OTHER_MEMBER = "d1d1d1d1-0000-4000-8000-000000000023";
const STAFF_RESIDENT = "d1d1d1d1-0000-4000-8000-000000000024";
const RESIDENT_UNIT = "d1d1d1d1-0000-4000-8000-000000000031";
const RESIDENT_STAY = "d1d1d1d1-0000-4000-8000-000000000041";

// The tenant query path, exactly as the host composes it: ranza_app, which is
// not an owner and has no BYPASSRLS. Pointing this at DIRECT_URL would make
// every assertion below pass for the wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });

// ranza_app holds SELECT only, so fixtures go in as the owner.
const owner = createPrismaClient(process.env.DIRECT_URL!);

const names = async (userId: string) =>
  (await core.listEntitledProperties(userId, TODAY_CAPABILITY)).map(
    (property) => property.propertyName,
  );

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'workspace-member@example.test'),
       ($2,'workspace-stranger@example.test'),
       ($3,'workspace-other@example.test'),
       ($4,'workspace-staff-resident@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    STRANGER,
    OTHER_MEMBER,
    STAFF_RESIDENT,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Workspace Organization','active'),
       ($2,'Other Organization','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1,$3,'Assigned Property'),
       ($2,$3,'Unassigned Property'),
       ($4,$5,'Other Organization Property')
     on conflict (id) do nothing`,
    ASSIGNED,
    UNASSIGNED,
    ORG,
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
    TODAY_CAPABILITY.moduleKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$4,$5,true), ($2,$4,$5,true), ($3,$6,$5,true)
     on conflict (property_id, capability_key) do nothing`,
    ASSIGNED,
    UNASSIGNED,
    OTHER_PROPERTY,
    ORG,
    TODAY_CAPABILITY.capabilityKey,
    OTHER_ORG,
  );
  // A second capability whose answer differs from Today's: on the Property the
  // member is not assigned to, and nowhere else. A batched read that mixed up
  // which answer belongs to which question would be visible here.
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$2,$3,true)
     on conflict (property_id, capability_key) do nothing`,
    UNASSIGNED,
    ORG,
    AUDIT_CAPABILITY.capabilityKey,
  );
  // A Staff Member assigned to one Property who is also a Resident at the
  // other. Their Stay makes the unassigned Property visible to them
  // (properties_read_own_stay) and their membership makes its Organization
  // visible, so only the capability gate's own reach clause keeps that
  // Property out of their staff shell.
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1,$2,$3,'Resident Room','room',1)
     on conflict (id) do nothing`,
    RESIDENT_UNIT,
    UNASSIGNED,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, user_id,
        stay_type, status, starts_on, ends_on) values
       ($1,$2,$3,$4,$5,'resident','reserved',current_date,null)
     on conflict (id) do nothing`,
    RESIDENT_STAY,
    ORG,
    UNASSIGNED,
    RESIDENT_UNIT,
    STAFF_RESIDENT,
  );
  // Scoped to assigned Properties, and assigned to exactly one of the two.
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'front_desk','assigned_properties'),
       ($3,$4,'owner','organization_wide'),
       ($1,$5,'front_desk','assigned_properties')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    OTHER_ORG,
    OTHER_MEMBER,
    STAFF_RESIDENT,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id) values ($1,$2,$3), ($1,$2,$4)
     on conflict (property_id, user_id) do nothing`,
    ASSIGNED,
    ORG,
    MEMBER,
    STAFF_RESIDENT,
  );
});

afterAll(async () => {
  const users = [MEMBER, STRANGER, OTHER_MEMBER, STAFF_RESIDENT];
  const organizations = [ORG, OTHER_ORG];

  // Children first: every foreign key here is ON DELETE RESTRICT, because
  // operational history is never silently removed (AGENTS.md).
  for (const [statement, args] of [
    [
      "delete from public.property_assignments where user_id in ($1,$2,$3,$4)",
      users,
    ],
    [
      "delete from public.stays where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.accommodation_units where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.property_capabilities where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.organization_memberships where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.entitlements where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.subscriptions where organization_id in ($1,$2)",
      organizations,
    ],
    [
      "delete from public.properties where organization_id in ($1,$2)",
      organizations,
    ],
    ["delete from public.organizations where id in ($1,$2)", organizations],
    ["delete from public.users where id in ($1,$2,$3,$4)", users],
  ] as const) {
    await owner.$executeRawUnsafe(statement, ...args);
  }

  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("what a viewer may reach", () => {
  it("shows nothing to a user with no membership", async () => {
    await expect(names(STRANGER)).resolves.toEqual([]);
  });

  it("shows exactly the Properties of the viewer's own Organization", async () => {
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
    await expect(names(OTHER_MEMBER)).resolves.toEqual([
      "Other Organization Property",
    ]);
  });

  it("does not reach a Property in the Organization that was never assigned", async () => {
    const reachable = await core.listEntitledProperties(
      MEMBER,
      TODAY_CAPABILITY,
    );
    expect(reachable.map((property) => property.propertyId)).not.toContain(
      UNASSIGNED,
    );
  });

  it("reaches both once the membership is Organization-wide", async () => {
    await owner.$executeRawUnsafe(
      "update public.organization_memberships set access_scope='organization_wide' where organization_id=$1 and user_id=$2",
      ORG,
      MEMBER,
    );
    await expect(names(MEMBER)).resolves.toEqual([
      "Assigned Property",
      "Unassigned Property",
    ]);
    await owner.$executeRawUnsafe(
      "update public.organization_memberships set access_scope='assigned_properties' where organization_id=$1 and user_id=$2",
      ORG,
      MEMBER,
    );
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
  });
});

describe("each gate of blueprint 3.5 denies on its own", () => {
  it("gate 1 — a cancelled Subscription denies", async () => {
    await owner.$executeRawUnsafe(
      "update public.subscriptions set status='cancelled' where organization_id=$1",
      ORG,
    );
    await expect(names(MEMBER)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.subscriptions set status='active' where organization_id=$1",
      ORG,
    );
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
  });

  it("gate 2 — a revoked Entitlement denies", async () => {
    await owner.$executeRawUnsafe(
      "update public.entitlements set status='revoked' where organization_id=$1 and module_key=$2",
      ORG,
      TODAY_CAPABILITY.moduleKey,
    );
    await expect(names(MEMBER)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.entitlements set status='active' where organization_id=$1 and module_key=$2",
      ORG,
      TODAY_CAPABILITY.moduleKey,
    );
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
  });

  it("gate 3 — a capability disabled on the Property denies", async () => {
    await owner.$executeRawUnsafe(
      "update public.property_capabilities set enabled=false where property_id=$1 and capability_key=$2",
      ASSIGNED,
      TODAY_CAPABILITY.capabilityKey,
    );
    await expect(names(MEMBER)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.property_capabilities set enabled=true where property_id=$1 and capability_key=$2",
      ASSIGNED,
      TODAY_CAPABILITY.capabilityKey,
    );
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
  });

  it("gate 4 — a revoked membership denies", async () => {
    await owner.$executeRawUnsafe(
      // `revoked_at` travels with the status: the undo window is measured from
      // it, and the check constraint refuses one without the other.
      "update public.organization_memberships set status='revoked', revoked_at=now() where organization_id=$1 and user_id=$2",
      ORG,
      MEMBER,
    );
    await expect(names(MEMBER)).resolves.toEqual([]);
    await owner.$executeRawUnsafe(
      "update public.organization_memberships set status='active', revoked_at=null where organization_id=$1 and user_id=$2",
      ORG,
      MEMBER,
    );
    await expect(names(MEMBER)).resolves.toEqual(["Assigned Property"]);
  });

  it("gate 5 — an unknown acting user sees nothing, rather than everything", async () => {
    await expect(
      names("d1d1d1d1-0000-4000-8000-0000000000ff"),
    ).resolves.toEqual([]);
  });
});

describe("the shell's one read answers what each question alone would", () => {
  // Today's key under a module no Organization here is entitled to: the same
  // capability name, a different gate.
  const SAME_KEY_OTHER_MODULE = {
    moduleKey: "housekeeping",
    capabilityKey: TODAY_CAPABILITY.capabilityKey,
  };
  const ASKED = [AUDIT_CAPABILITY, TODAY_CAPABILITY, SAME_KEY_OTHER_MODULE];

  const oneByOne = (userId: string) =>
    Promise.all(
      ASKED.map((capability) =>
        core.listEntitledProperties(userId, capability),
      ),
    );
  const batched = async (userId: string) =>
    (await core.listEntitledPropertiesByCapability(userId, ASKED)).map(
      (answer) => answer.properties,
    );

  it("answers in the order asked, each capability separately", async () => {
    const answers = await core.listEntitledPropertiesByCapability(
      MEMBER,
      ASKED,
    );
    expect(answers.map((answer) => answer.capability)).toEqual(ASKED);
    expect(
      answers.map((answer) =>
        answer.properties.map((property) => property.propertyName),
      ),
    ).toEqual([[], ["Assigned Property"], []]);
  });

  it("matches the one-at-a-time answers for every viewer", async () => {
    for (const userId of [MEMBER, STRANGER, OTHER_MEMBER, STAFF_RESIDENT]) {
      await expect(batched(userId)).resolves.toEqual(await oneByOne(userId));
    }
  });

  it("keeps the answers apart when they differ", async () => {
    await owner.$executeRawUnsafe(
      "update public.organization_memberships set access_scope='organization_wide' where organization_id=$1 and user_id=$2",
      ORG,
      MEMBER,
    );
    try {
      const answers = await batched(MEMBER);
      expect(
        answers.map((properties) => properties.map((p) => p.propertyName)),
      ).toEqual([
        ["Unassigned Property"],
        ["Assigned Property", "Unassigned Property"],
        [],
      ]);
      expect(answers).toEqual(await oneByOne(MEMBER));
    } finally {
      await owner.$executeRawUnsafe(
        "update public.organization_memberships set access_scope='assigned_properties' where organization_id=$1 and user_id=$2",
        ORG,
        MEMBER,
      );
    }
  });

  it("answers nothing, for every capability, to a user with no membership", async () => {
    await expect(batched(STRANGER)).resolves.toEqual([[], [], []]);
  });

  // Reach is enforced three times: by the properties policy, by the
  // organizations policy the join passes through, and by the reach clause of
  // app.can_use_capability(). For most viewers they agree, so dropping the
  // reach clause fails nothing above. They part for a Staff Member who is also
  // a Resident at a Property they are not assigned to: the Stay shows them the
  // Property, the membership shows them its Organization, and only the reach
  // clause is left to keep it out of their staff shell.
  it("keeps out a Property the viewer only stays at", async () => {
    const visible = await withOrganizationContext(
      prisma,
      { userId: STAFF_RESIDENT },
      (tx) =>
        tx.$queryRaw<{ name: string }[]>`
          select property.name
          from public.properties as property
          join public.organizations as organization
            on organization.id = property.organization_id
          order by property.name`,
    );
    expect(visible.map((property) => property.name)).toEqual([
      "Assigned Property",
      "Unassigned Property",
    ]);

    const expected = [[], ["Assigned Property"], []];
    const nameLists = (answers: { propertyName: string }[][]) =>
      answers.map((properties) => properties.map((p) => p.propertyName));
    expect(nameLists(await batched(STAFF_RESIDENT))).toEqual(expected);
    expect(nameLists(await oneByOne(STAFF_RESIDENT))).toEqual(expected);
  });

  it("answers nothing when asked about nothing", async () => {
    await expect(
      core.listEntitledPropertiesByCapability(MEMBER, []),
    ).resolves.toEqual([]);
  });
});
