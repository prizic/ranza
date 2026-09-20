/**
 * The audit log read, against a real database: the platform module's scope
 * read through its `recentWithin` contract, and `@ranza/core`'s gated read in
 * front of it — the shape ADR 0028 fixes.
 *
 * Two things here are not what row-level security already proves. The read
 * names the Organization in its own predicate, because the policy is
 * membership-wide and a Staff Member in two Organizations would otherwise see
 * both; and the commercial gate is asked in the same transaction as the read,
 * so each of blueprint 3.5's gates is switched off in turn and shown to deny
 * on its own — the pattern workspace-access.test.ts already uses.
 *
 * Records cannot be deleted, so the fixture Organizations stay behind with
 * them, as audit.test.ts already accepts. Every insert is idempotent for that
 * reason, and the memberships are what make the rows unreachable again.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recentWithin, recordWithin } from "../../packages/platform/audit/src";
import {
  AUDIT_CAPABILITY,
  createCoreModule,
} from "../../packages/ranza/core/src";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";

const ORG = "d5000002-0000-4000-8000-000000000001";
const OTHER_ORG = "d5000002-0000-4000-8000-000000000002";
const PROPERTY = "d5000004-0000-4000-8000-000000000001";
const OTHER_PROPERTY = "d5000004-0000-4000-8000-000000000002";
const UNASSIGNED_PROPERTY = "d5000004-0000-4000-8000-000000000003";
const MEMBER = "d5000001-0000-4000-8000-000000000001";
const OUTSIDER = "d5000001-0000-4000-8000-000000000002";
const BOTH = "d5000001-0000-4000-8000-000000000003";
const FIRST_SUBJECT = "d5000003-0000-4000-8000-000000000001";
const SECOND_SUBJECT = "d5000003-0000-4000-8000-000000000002";
const OTHER_SUBJECT = "d5000003-0000-4000-8000-000000000003";
const REASON = "posted to the wrong Stay, moving it to the right one";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

/** The read as a host performs it: its own context, then the contract. */
const recent = (actorId: string, organizationId: string, limit?: number) =>
  withOrganizationContext(prisma, { userId: actorId }, (tx) =>
    recentWithin(tx, organizationId, limit),
  );

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'audit-log-member@example.test'),
       ($2,'audit-log-outsider@example.test'),
       ($3,'audit-log-both@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    OUTSIDER,
    BOTH,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Audit Log Organization','active'),
       ($2,'Audit Log Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1,$2,'Audit Log Property'),
       ($3,$4,'Audit Log Other Property'),
       ($5,$2,'Audit Log Unassigned Property')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
    OTHER_PROPERTY,
    OTHER_ORG,
    UNASSIGNED_PROPERTY,
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
    AUDIT_CAPABILITY.moduleKey,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$2,$5,true), ($3,$4,$5,true), ($6,$2,$5,true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
    OTHER_PROPERTY,
    OTHER_ORG,
    AUDIT_CAPABILITY.capabilityKey,
    UNASSIGNED_PROPERTY,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$3,'front_desk','assigned_properties'),
       ($2,$4,'owner','organization_wide'),
       ($1,$5,'owner','organization_wide'),
       ($2,$5,'owner','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    OTHER_ORG,
    MEMBER,
    OUTSIDER,
    BOTH,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id) values ($1,$2,$3)
     on conflict (property_id, user_id) do nothing`,
    PROPERTY,
    ORG,
    MEMBER,
  );

  // Three records in the Organization, written in a known order and about two
  // subjects; one in the other Organization. Written as the actors themselves,
  // through the contract, so the insert policy applies to the fixture too.
  //
  // One transaction each, as every real writer does: `occurred_at` defaults to
  // `now()`, which Postgres fixes for the whole transaction, so records written
  // together share a stamp and "newest first" has nothing to order them by.
  for (const entry of [
    {
      action: "folio.charge_posted",
      subjectType: "folio",
      subjectId: FIRST_SUBJECT,
      context: { amountMinor: 12000 },
    },
    {
      action: "stay.checked_out",
      subjectType: "stay",
      subjectId: SECOND_SUBJECT,
    },
    {
      action: "folio.line_reversed",
      subjectType: "folio",
      subjectId: FIRST_SUBJECT,
      reason: REASON,
    },
  ]) {
    await withOrganizationContext(prisma, { userId: MEMBER }, (tx) =>
      recordWithin(tx, { organizationId: ORG, actorId: MEMBER, ...entry }),
    );
  }
  await withOrganizationContext(prisma, { userId: OUTSIDER }, (tx) =>
    recordWithin(tx, {
      organizationId: OTHER_ORG,
      actorId: OUTSIDER,
      action: "folio.closed",
      subjectType: "folio",
      subjectId: OTHER_SUBJECT,
    }),
  );
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    "delete from public.property_assignments where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id in ($1,$2)",
    ORG,
    OTHER_ORG,
  );
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("the newest records in one scope", () => {
  it("recent_records_come_newest_first", async () => {
    const { records } = await recent(MEMBER, ORG);
    expect(records[0]?.action).toBe("folio.line_reversed");
    for (let i = 1; i < records.length; i += 1) {
      expect(records[i - 1]!.occurredAt >= records[i]!.occurredAt).toBe(true);
    }
  });

  it("recent_records_cover_every_subject_in_the_organization", async () => {
    const { records } = await recent(MEMBER, ORG);
    const subjects = new Set(records.map((record) => record.subjectId));
    expect(subjects).toContain(FIRST_SUBJECT);
    expect(subjects).toContain(SECOND_SUBJECT);
  });

  it("another_organization_sees_no_recent_records", async () => {
    await expect(recent(OUTSIDER, ORG)).resolves.toEqual({
      records: [],
      total: 0,
    });
  });

  it("recent_records_are_bounded_to_the_organization_asked_for", async () => {
    // BOTH reaches both Organizations, so the policy lets every row through.
    // Only the read's own predicate keeps the other Organization's record out.
    const { records } = await recent(BOTH, ORG);
    expect(records.length).toBeGreaterThan(0);
    expect(records.map((record) => record.organizationId)).toEqual(
      records.map(() => ORG),
    );
    expect(records.map((record) => record.subjectId)).not.toContain(
      OTHER_SUBJECT,
    );
  });

  it("the_total_is_reported_when_the_list_is_capped", async () => {
    const { records, total } = await recent(MEMBER, ORG, 1);
    expect(records).toHaveLength(1);
    expect(total).toBeGreaterThanOrEqual(3);
    // The limit is bounded on both sides: nothing below one row, nothing above
    // the module's ceiling, whatever a caller asks for.
    await expect(recent(MEMBER, ORG, 0)).resolves.toMatchObject({
      records: expect.arrayContaining([expect.anything()]),
    });
    const { records: capped } = await recent(MEMBER, ORG, 10_000);
    expect(capped.length).toBeLessThanOrEqual(500);
  });

  it("a_reversal_is_traceable_to_its_actor_and_reason", async () => {
    const { records } = await recent(MEMBER, ORG);
    const reversal = records.find(
      (record) => record.action === "folio.line_reversed",
    );
    expect(reversal?.actorId).toBe(MEMBER);
    expect(reversal?.reason).toBe(REASON);
  });
});

describe("the read through a Property, and each gate on its own", () => {
  const through = (userId: string, propertyId: string) =>
    core.recentActivity(userId, propertyId);

  it("reads the Organization's log through an entitled Property", async () => {
    const { records, total } = await through(MEMBER, PROPERTY);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(records.map((record) => record.organizationId)).toEqual(
      records.map(() => ORG),
    );
  });

  it("a_property_out_of_reach_reads_nothing", async () => {
    // Another Organization's Property, a Property of the viewer's own
    // Organization they are not assigned to, and a Property that does not
    // exist: the same empty answer, so none confirms another's existence.
    // The middle one is the case the ADR's title rests on — gated through the
    // Property, the same Organization's log is closed to a Staff Member who
    // cannot reach the Property they asked through.
    await expect(through(MEMBER, OTHER_PROPERTY)).resolves.toEqual({
      records: [],
      total: 0,
    });
    await expect(through(MEMBER, UNASSIGNED_PROPERTY)).resolves.toEqual({
      records: [],
      total: 0,
    });
    await expect(
      through(MEMBER, "d5000004-0000-4000-8000-0000000000ff"),
    ).resolves.toEqual({ records: [], total: 0 });
  });

  /**
   * Switches one gate off, asserts, and switches it back on whatever the
   * assertion did. Without the `finally`, a failing assertion leaves the row
   * toggled and every later run of every suite sharing this Organization
   * fails for a reason that is not in the code under test.
   */
  async function withGateOff(off: string, on: string, args: string[]) {
    await owner.$executeRawUnsafe(off, ...args);
    try {
      await expect(through(MEMBER, PROPERTY)).resolves.toEqual({
        records: [],
        total: 0,
      });
    } finally {
      await owner.$executeRawUnsafe(on, ...args);
    }
    await expect(through(MEMBER, PROPERTY)).resolves.not.toEqual({
      records: [],
      total: 0,
    });
  }

  it("an_unentitled_property_reads_nothing — gate 1, a cancelled Subscription", () =>
    withGateOff(
      "update public.subscriptions set status='cancelled' where organization_id=$1",
      "update public.subscriptions set status='active' where organization_id=$1",
      [ORG],
    ));

  it("an_unentitled_property_reads_nothing — gate 2, a revoked Entitlement", () =>
    withGateOff(
      "update public.entitlements set status='revoked' where organization_id=$1 and module_key=$2",
      "update public.entitlements set status='active' where organization_id=$1 and module_key=$2",
      [ORG, AUDIT_CAPABILITY.moduleKey],
    ));

  it("an_unentitled_property_reads_nothing — gate 3, the capability off", () =>
    withGateOff(
      "update public.property_capabilities set enabled=false where property_id=$1 and capability_key=$2",
      "update public.property_capabilities set enabled=true where property_id=$1 and capability_key=$2",
      [PROPERTY, AUDIT_CAPABILITY.capabilityKey],
    ));

  it("gate 4 — a revoked membership reads nothing", () =>
    withGateOff(
      // `revoked_at` travels with the status: a check constraint refuses one
      // without the other, as workspace-access.test.ts already notes.
      "update public.organization_memberships set status='revoked', revoked_at=now() where organization_id=$1 and user_id=$2",
      "update public.organization_memberships set status='active', revoked_at=null where organization_id=$1 and user_id=$2",
      [ORG, MEMBER],
    ));

  it("a_staff_member_assigned_to_one_property_reads_the_organization", async () => {
    // AL-DIFF-01, pinned: MEMBER's scope is assigned_properties with one
    // assignment, and the log is still the whole Organization's, because a
    // record carries no Property. A later narrowing changes this on purpose.
    const { records } = await through(MEMBER, PROPERTY);
    expect(records.map((record) => record.subjectId)).toContain(SECOND_SUBJECT);
  });
});
