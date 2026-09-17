/**
 * The staff module against a real database, as `ranza_app`.
 *
 * The pgTAP suite proves which rows a policy admits. This proves the parts a
 * policy cannot express: that a whole invitation is one commit, that revoking
 * takes the assignments and the pending link with it, that the undo window is a
 * window, and that two administrators demoting each other at once leave one
 * standing — which needs two connections and is why it could not live in pgTAP.
 *
 * Every assertion below was checked by breaking what it asserts — removing the
 * `for update` from the trigger, widening the undo predicate, leaving the
 * invitation outside the transaction — and watching it go red.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  AlreadyAMemberError,
  createStaffModule,
  LastAdministratorError,
  RoleIsHeldError,
  StaffRefusedError,
} from "../../packages/ranza/staff/src";

// Each integration suite owns a uuid prefix, because they share one database
// and `on conflict do nothing` will happily adopt somebody else's fixture. d7
// is check-in reversal's; this suite started there by accident and spent a
// teardown failing on Accommodation Units it had never created.
const ORG = "d8000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d8000002-0000-4000-8000-000000000002";
const PROPERTY = "d8000003-0000-4000-8000-000000000001";
const SECOND_PROPERTY = "d8000003-0000-4000-8000-000000000002";
const OTHER_PROPERTY = "d8000003-0000-4000-8000-000000000003";
const OWNER = "d8000001-0000-4000-8000-000000000001";
const SECOND_OWNER = "d8000001-0000-4000-8000-000000000002";
const DESK = "d8000001-0000-4000-8000-000000000003";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const staff = createStaffModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

/** A unique address per test, so re-running the suite is not a second person. */
function anAddress(): string {
  return `invited-${randomUUID()}@example.test`;
}

async function roleOf(userId: string, organizationId = ORG): Promise<string> {
  const rows = await owner.$queryRawUnsafe<{ role: string; status: string }[]>(
    `select role, status from public.organization_memberships
      where organization_id = $1::uuid and user_id = $2::uuid`,
    organizationId,
    userId,
  );
  return rows[0] ? `${rows[0].role}/${rows[0].status}` : "absent";
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1::uuid,'staff-roster-owner@example.test'),
       ($2::uuid,'staff-roster-second@example.test'),
       ($3::uuid,'staff-roster-desk@example.test')
     on conflict (id) do nothing`,
    OWNER,
    SECOND_OWNER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1::uuid,'Staff Integration A','active'),
       ($2::uuid,'Staff Integration B','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1::uuid,$4::uuid,'Integration Property A1'),
       ($2::uuid,$4::uuid,'Integration Property A2'),
       ($3::uuid,$5::uuid,'Integration Property B1')
     on conflict (id) do nothing`,
    PROPERTY,
    SECOND_PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1::uuid,$2::uuid,'owner','organization_wide'),
       ($1::uuid,$3::uuid,'owner','organization_wide'),
       ($1::uuid,$4::uuid,'front_desk','organization_wide')
     on conflict (organization_id, user_id) do update
       set role = excluded.role, status = 'active', revoked_at = null`,
    ORG,
    OWNER,
    SECOND_OWNER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1::uuid,'active'),($2::uuid,'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1::uuid,'platform_core','active'),($2::uuid,'platform_core','active')
     on conflict do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1::uuid,$4::uuid,'staff_administration',true),
       ($2::uuid,$4::uuid,'staff_administration',true),
       ($3::uuid,$5::uuid,'staff_administration',true)
     on conflict do nothing`,
    PROPERTY,
    SECOND_PROPERTY,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
});

afterAll(async () => {
  // Never a delete of anything historical: these are this suite's own rows and
  // nothing else points at them.
  for (const table of [
    "public.staff_invitations",
    "public.property_assignments",
    "public.organization_memberships",
    "public.property_capabilities",
    "public.staff_roles",
  ]) {
    await owner.$executeRawUnsafe(
      `delete from ${table} where organization_id in ($1::uuid,$2::uuid)`,
      ORG,
      OTHER_ORG,
    );
  }
  await owner.$executeRawUnsafe(
    `delete from outbox.events where organization_id in ($1::uuid,$2::uuid)`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from public.properties where organization_id in ($1::uuid,$2::uuid)`,
    ORG,
    OTHER_ORG,
  );
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("inviting somebody", () => {
  it("writes an active membership and a pending invitation", async () => {
    const invited = await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email: anAddress(), roleKey: "front_desk" },
    );

    const rows = await owner.$queryRawUnsafe<
      { status: string; accepted_at: Date | null; invitation: string }[]
    >(
      `select membership.status, membership.accepted_at,
              invitation.status as invitation
         from public.organization_memberships as membership
         join public.staff_invitations as invitation
           on invitation.organization_id = membership.organization_id
          and invitation.user_id = membership.user_id
        where membership.id = $1::uuid`,
      invited.membershipId,
    );

    // Active immediately, and not yet accepted. The membership was never
    // waiting on the link: a person is a Staff Member because an administrator
    // said so (SP-S1-01, SP-S1-07).
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.accepted_at).toBeNull();
    expect(rows[0]?.invitation).toBe("pending");
    expect(invited.token).toHaveLength(43);
  });

  it("writes the role and both Properties or nothing at all", async () => {
    const invited = await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email: anAddress(),
        roleKey: "housekeeping",
        propertyIds: [PROPERTY, SECOND_PROPERTY],
      },
    );

    const [row] = await owner.$queryRawUnsafe<{ reach: bigint }[]>(
      `select count(*) as reach from public.property_assignments as assignment
         join public.organization_memberships as membership
           on membership.organization_id = assignment.organization_id
          and membership.user_id = assignment.user_id
        where membership.id = $1::uuid and assignment.status = 'active'`,
      invited.membershipId,
    );
    expect(Number(row?.reach)).toBe(2);
  });

  it("refuses a Property of another Organization, and writes nothing", async () => {
    const email = anAddress();
    await expect(
      staff.invite(
        { userId: OWNER },
        {
          organizationId: ORG,
          email,
          roleKey: "front_desk",
          propertyIds: [OTHER_PROPERTY],
        },
      ),
    ).rejects.toBeInstanceOf(Error);

    // The membership is the part that would have survived a half-applied
    // invitation, which is exactly what one transaction is for (SP-S1-02).
    const [row] = await owner.$queryRawUnsafe<{ left_behind: bigint }[]>(
      `select count(*) as left_behind
         from public.organization_memberships as membership
         join public.users as account on account.id = membership.user_id
        where account.email = $1`,
      email,
    );
    expect(Number(row?.left_behind)).toBe(0);
  });

  it("refuses a second membership for one person", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email, roleKey: "front_desk" },
    );
    await expect(
      staff.invite(
        { userId: OWNER },
        { organizationId: ORG, email, roleKey: "housekeeping" },
      ),
    ).rejects.toBeInstanceOf(AlreadyAMemberError);
  });

  it("refuses an Organization the actor does not reach", async () => {
    await expect(
      staff.invite(
        { userId: OWNER },
        {
          organizationId: OTHER_ORG,
          email: anAddress(),
          roleKey: "front_desk",
        },
      ),
    ).rejects.toBeInstanceOf(StaffRefusedError);
  });

  it("refuses somebody without staff authority", async () => {
    await expect(
      staff.invite(
        { userId: DESK },
        { organizationId: ORG, email: anAddress(), roleKey: "front_desk" },
      ),
    ).rejects.toBeInstanceOf(StaffRefusedError);
  });

  it("publishes exactly one reach change per command", async () => {
    const before = await countEvents();
    await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email: anAddress(), roleKey: "front_desk" },
    );
    expect((await countEvents()) - before).toBe(1);
  });
});

describe("accepting an invitation", () => {
  it("grants a password, not reach", async () => {
    const invited = await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email: anAddress(), roleKey: "front_desk" },
    );

    const accepted = await staff.accept(invited.token);
    expect(accepted.organizationId).toBe(ORG);

    const [row] = await owner.$queryRawUnsafe<
      { status: string; accepted_at: Date | null }[]
    >(
      `select status, accepted_at from public.organization_memberships
        where id = $1::uuid`,
      invited.membershipId,
    );
    // The membership is unchanged except for the fact that they turned up.
    expect(row?.status).toBe("active");
    expect(row?.accepted_at).not.toBeNull();
  });

  it("refuses a withdrawn invitation", async () => {
    const email = anAddress();
    const invited = await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email, roleKey: "front_desk" },
    );
    const userId = await userIdOf(email);
    await staff.revoke({ userId: OWNER }, { organizationId: ORG, userId });

    // A live link cannot outlive the job it was for (SP-S1-27).
    await expect(staff.accept(invited.token)).rejects.toBeInstanceOf(
      StaffRefusedError,
    );
  });

  it("refuses an invitation older than a week", async () => {
    const invited = await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email: anAddress(), roleKey: "front_desk" },
    );
    await owner.$executeRawUnsafe(
      `update public.staff_invitations set expires_at = now() - interval '1 hour'
        where id = $1::uuid`,
      invited.invitationId,
    );
    await expect(staff.accept(invited.token)).rejects.toBeInstanceOf(
      StaffRefusedError,
    );

    // And says so in the row, rather than leaving a pending invitation that is
    // pending forever because no sweeper exists yet.
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      "select status from public.staff_invitations where id = $1::uuid",
      invited.invitationId,
    );
    expect(row?.status).toBe("expired");
  });
});

describe("changing reach", () => {
  it("revokes the assignments and deletes nothing", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email,
        roleKey: "front_desk",
        propertyIds: [PROPERTY, SECOND_PROPERTY],
      },
    );
    const userId = await userIdOf(email);

    await staff.revoke({ userId: OWNER }, { organizationId: ORG, userId });

    const [row] = await owner.$queryRawUnsafe<
      { membership: string; live: bigint; kept: bigint }[]
    >(
      `select membership.status as membership,
              count(*) filter (where assignment.status = 'active') as live,
              count(*) as kept
         from public.organization_memberships as membership
         left join public.property_assignments as assignment
           on assignment.organization_id = membership.organization_id
          and assignment.user_id = membership.user_id
        where membership.organization_id = $1::uuid
          and membership.user_id = $2::uuid
        group by membership.status`,
      ORG,
      userId,
    );
    expect(row?.membership).toBe("revoked");
    expect(Number(row?.live)).toBe(0);
    // The rows are still there. They are the record that they used to reach it.
    expect(Number(row?.kept)).toBe(2);
  });

  it("returns the same membership when the revoke is undone", async () => {
    const email = anAddress();
    const invited = await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email,
        roleKey: "front_desk",
        propertyIds: [PROPERTY],
      },
    );
    const userId = await userIdOf(email);

    await staff.revoke({ userId: OWNER }, { organizationId: ORG, userId });
    await staff.undoRevoke({ userId: OWNER }, { organizationId: ORG, userId });

    const [row] = await owner.$queryRawUnsafe<
      { id: string; status: string; live: bigint }[]
    >(
      `select membership.id, membership.status,
              count(*) filter (where assignment.status = 'active') as live
         from public.organization_memberships as membership
         left join public.property_assignments as assignment
           on assignment.organization_id = membership.organization_id
          and assignment.user_id = membership.user_id
        where membership.organization_id = $1::uuid
          and membership.user_id = $2::uuid
        group by membership.id, membership.status`,
      ORG,
      userId,
    );
    // The same row, so the person is one thread before and after (SP-S1-14).
    expect(row?.id).toBe(invited.membershipId);
    expect(row?.status).toBe("active");
    expect(Number(row?.live)).toBe(1);
  });

  it("refuses an undo once the window has passed", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email, roleKey: "front_desk" },
    );
    const userId = await userIdOf(email);
    await staff.revoke({ userId: OWNER }, { organizationId: ORG, userId });

    await owner.$executeRawUnsafe(
      `update public.organization_memberships
          set revoked_at = now() - interval '25 hours'
        where organization_id = $1::uuid and user_id = $2::uuid`,
      ORG,
      userId,
    );

    await expect(
      staff.undoRevoke({ userId: OWNER }, { organizationId: ORG, userId }),
    ).rejects.toBeInstanceOf(StaffRefusedError);
    expect(await roleOf(userId)).toBe("front_desk/revoked");
  });

  it("reuses the assignment row when a Property is given back", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email,
        roleKey: "front_desk",
        propertyIds: [PROPERTY],
      },
    );
    const userId = await userIdOf(email);

    await staff.unassignProperty(
      { userId: OWNER },
      { organizationId: ORG, userId, propertyId: PROPERTY },
    );
    await staff.assignProperty(
      { userId: OWNER },
      { organizationId: ORG, userId, propertyId: PROPERTY },
    );

    const [row] = await owner.$queryRawUnsafe<
      { rows: bigint; status: string }[]
    >(
      `select count(*) as rows, min(status) as status
         from public.property_assignments
        where organization_id = $1::uuid and user_id = $2::uuid
          and property_id = $3::uuid`,
      ORG,
      userId,
      PROPERTY,
    );
    expect(Number(row?.rows)).toBe(1);
    expect(row?.status).toBe("active");
  });
});

describe("the last administrator", () => {
  it("cannot be demoted", async () => {
    // One Owner left: SECOND_OWNER steps down first, which is allowed.
    await staff.changeRole(
      { userId: OWNER },
      { organizationId: ORG, userId: SECOND_OWNER, roleKey: "front_desk" },
    );

    await expect(
      staff.changeRole(
        { userId: OWNER },
        { organizationId: ORG, userId: OWNER, roleKey: "front_desk" },
      ),
    ).rejects.toBeInstanceOf(LastAdministratorError);

    await staff.changeRole(
      { userId: OWNER },
      { organizationId: ORG, userId: SECOND_OWNER, roleKey: "owner" },
    );
  });

  it("survives two administrators demoting each other at once", async () => {
    // Two connections, two transactions, started together. Counting rather than
    // locking would let both find an administrator that the other is removing.
    const first = createPrismaClient(process.env.DATABASE_URL!);
    const second = createPrismaClient(process.env.DATABASE_URL!);
    const a = createStaffModule({ db: first });
    const b = createStaffModule({ db: second });

    const results = await Promise.allSettled([
      a.changeRole(
        { userId: OWNER },
        { organizationId: ORG, userId: SECOND_OWNER, roleKey: "front_desk" },
      ),
      b.changeRole(
        { userId: SECOND_OWNER },
        { organizationId: ORG, userId: OWNER, roleKey: "front_desk" },
      ),
    ]);

    const kept = results.filter((r) => r.status === "fulfilled").length;
    expect(kept).toBe(1);

    const [row] = await owner.$queryRawUnsafe<{ administrators: bigint }[]>(
      `select count(*) as administrators
         from public.organization_memberships as membership
         join public.staff_roles as role
           on role.scope_id = membership.role_scope_id and role.key = membership.role
        where membership.organization_id = $1::uuid
          and membership.status = 'active'
          and 'staff.administer' = any (role.permissions)`,
      ORG,
    );
    expect(Number(row?.administrators)).toBe(1);

    await first.$disconnect();
    await second.$disconnect();

    await owner.$executeRawUnsafe(
      `update public.organization_memberships set role = 'owner'
        where organization_id = $1::uuid and user_id in ($2::uuid,$3::uuid)`,
      ORG,
      OWNER,
      SECOND_OWNER,
    );
  });
});

describe("the roster", () => {
  it("is Organization-wide and no wider", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email,
        roleKey: "front_desk",
        propertyIds: [PROPERTY],
      },
    );

    const roster = await staff.readRoster({ userId: OWNER }, ORG);
    expect(roster.some((member) => member.email === email)).toBe(true);
    expect(roster.every((member) => member.roleName.length > 0)).toBe(true);

    // Asking for another Organization's roster answers with nothing rather than
    // raising, which is the same answer as the Organization not existing.
    expect(await staff.readRoster({ userId: OWNER }, OTHER_ORG)).toEqual([]);
  });

  it("shows reaching no Property as a state, not a gap", async () => {
    const email = anAddress();
    await staff.invite(
      { userId: OWNER },
      { organizationId: ORG, email, roleKey: "front_desk" },
    );

    const roster = await staff.readRoster({ userId: OWNER }, ORG);
    const member = roster.find((row) => row.email === email);
    expect(member?.properties).toEqual([]);
  });
});

describe("an Organization's own roles", () => {
  /** A name of this run's own, so two runs never collide on the unique index. */
  function aRoleName(): string {
    return `Night desk ${randomUUID().slice(0, 8)}`;
  }

  it("records the author when a role is defined", async () => {
    const name = aRoleName();
    const { key, roleId } = await staff.defineRole(
      { userId: OWNER },
      { organizationId: ORG, name, permissions: ["front_desk.check_in"] },
    );

    const [row] = await owner.$queryRawUnsafe<
      { actor_id: string; context: { key?: string } }[]
    >(
      `select actor_id, context from audit.records
        where organization_id = $1::uuid and action = 'staff.role_defined'
          and subject_id = $2::uuid
        order by occurred_at desc limit 1`,
      ORG,
      roleId,
    );
    expect(row?.actor_id).toBe(OWNER);
    expect(row?.context?.key).toBe(key);
  });

  it("refuses an author who may not define roles at all", async () => {
    // DESK holds the Front desk role, which carries no staff.define_roles, so
    // the policy refuses before the subset question is reached. The subset
    // itself is asserted in pgTAP, where a role can be composed to hold
    // exactly one half of the pair.
    await expect(
      staff.defineRole(
        { userId: DESK },
        {
          organizationId: ORG,
          name: aRoleName(),
          permissions: ["staff.administer"],
        },
      ),
    ).rejects.toBeInstanceOf(StaffRefusedError);
  });

  it("ends the sessions of everybody holding a role that changes", async () => {
    const { key } = await staff.defineRole(
      { userId: OWNER },
      {
        organizationId: ORG,
        name: aRoleName(),
        permissions: ["front_desk.check_in"],
      },
    );

    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email: anAddress(),
        roleKey: key,
        roleScopeId: ORG,
      },
    );
    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email: anAddress(),
        roleKey: key,
        roleScopeId: ORG,
      },
    );

    const before = await countEvents();
    await staff.editRole(
      { userId: OWNER },
      {
        organizationId: ORG,
        key,
        permissions: ["front_desk.check_in", "front_desk.check_out"],
      },
    );
    // One per holder. The handler wants a person to sign out, not a role to
    // expand later against a roster that has moved on.
    expect((await countEvents()) - before).toBe(2);
  });

  it("refuses to retire a role somebody holds, and keeps one nobody does", async () => {
    const held = await staff.defineRole(
      { userId: OWNER },
      { organizationId: ORG, name: aRoleName(), permissions: [] },
    );
    await staff.invite(
      { userId: OWNER },
      {
        organizationId: ORG,
        email: anAddress(),
        roleKey: held.key,
        roleScopeId: ORG,
      },
    );

    await expect(
      staff.retireRole(
        { userId: OWNER },
        { organizationId: ORG, key: held.key },
      ),
    ).rejects.toBeInstanceOf(RoleIsHeldError);

    const spare = await staff.defineRole(
      { userId: OWNER },
      { organizationId: ORG, name: aRoleName(), permissions: [] },
    );
    await staff.retireRole(
      { userId: OWNER },
      { organizationId: ORG, key: spare.key },
    );

    // Retired, and still there: it is the record of what somebody used to be
    // able to do.
    const roles = await staff.readRoles({ userId: OWNER }, ORG);
    expect(roles.find((role) => role.key === spare.key)?.status).toBe(
      "retired",
    );

    await staff.reinstateRole(
      { userId: OWNER },
      { organizationId: ORG, key: spare.key },
    );
    const after = await staff.readRoles({ userId: OWNER }, ORG);
    expect(after.find((role) => role.key === spare.key)?.status).toBe("active");
  });

  it("shows the shipped roles and this Organization's own, and no other's", async () => {
    const mine = await staff.defineRole(
      { userId: OWNER },
      { organizationId: ORG, name: aRoleName(), permissions: [] },
    );

    const roles = await staff.readRoles({ userId: OWNER }, ORG);
    expect(
      roles
        .filter((role) => role.organizationId === null)
        .map((role) => role.key)
        .sort(),
    ).toEqual(["finance", "front_desk", "housekeeping", "manager", "owner"]);
    expect(roles.some((role) => role.key === mine.key)).toBe(true);
    expect(
      roles.every(
        (role) => role.organizationId === null || role.organizationId === ORG,
      ),
    ).toBe(true);
  });
});

async function userIdOf(email: string): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    "select id from public.users where lower(email) = lower($1)",
    email,
  );
  if (!row) throw new Error(`no user for ${email}`);
  return row.id;
}

async function countEvents(): Promise<number> {
  const [row] = await owner.$queryRawUnsafe<{ total: bigint }[]>(
    `select count(*) as total from outbox.events
      where organization_id = $1::uuid and event_type = 'staff.reach_changed'`,
    ORG,
  );
  return Number(row?.total ?? 0);
}
