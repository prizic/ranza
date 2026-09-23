/**
 * The audit log read, against a real database — what ADR 0031 decided.
 *
 * A record carries the Property it happened at, the read policy narrows to
 * the Properties a viewer reaches, reading the log is the `audit.read`
 * permission rather than a Property capability, and a page is filtered and
 * paged by the server over every record rather than by the screen over the
 * rows it happens to hold.
 *
 * Records cannot be deleted, so the fixture Organizations stay behind with
 * them, as audit.test.ts already accepts. Every insert is idempotent for that
 * reason, the memberships are what make the rows unreachable again, and every
 * count below is a lower bound or scoped to this run's own subjects.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  recentWithin,
  recordWithin,
  type AuditEntry,
} from "../../packages/platform/audit/src";
import {
  AUDIT_READ_PERMISSION,
  createCoreModule,
} from "../../packages/ranza/core/src";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";

const ORG = "d5100002-0000-4000-8000-000000000001";
const OTHER_ORG = "d5100002-0000-4000-8000-000000000002";
const PROPERTY_A = "d5100004-0000-4000-8000-000000000001";
const PROPERTY_B = "d5100004-0000-4000-8000-000000000002";
const ARCHIVED = "d5100004-0000-4000-8000-000000000003";
const OTHER_PROPERTY = "d5100004-0000-4000-8000-000000000004";
const OWNER = "d5100001-0000-4000-8000-000000000001";
const MANAGER = "d5100001-0000-4000-8000-000000000002";
const DESK = "d5100001-0000-4000-8000-000000000003";
const AUDITOR = "d5100001-0000-4000-8000-000000000004";
const OUTSIDER = "d5100001-0000-4000-8000-000000000005";
const BOTH = "d5100001-0000-4000-8000-000000000006";
const GUEST = "d5100005-0000-4000-8000-000000000001";
const UNIT = "d5100006-0000-4000-8000-000000000001";
const RESERVATION = "d5100007-0000-4000-8000-000000000001";
const NIGHT_AUDIT_ROLE = "night_audit_d51";
const REASON = "posted to the wrong Stay, moving it to the right one";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

/** This run's own subjects, so assertions never count an earlier run's rows. */
const run = {
  chargeAtA: randomUUID(),
  departureAtB: randomUUID(),
  roleDefined: randomUUID(),
  reversalAtA: randomUUID(),
  blockedAtArchived: randomUUID(),
  elsewhere: randomUUID(),
  lateNight: randomUUID(),
  oldRecord: randomUUID(),
  oddContext: randomUUID(),
  istanbul: randomUUID(),
};

async function write(actorId: string, entry: Omit<AuditEntry, "actorId">) {
  // One transaction each, as every real writer does: `occurred_at` is fixed
  // for a whole transaction, so records written together share a stamp.
  await withOrganizationContext(prisma, { userId: actorId }, (tx) =>
    recordWithin(tx, { ...entry, actorId }),
  );
}

const subjects = (page: { entries: { subjectId: string }[] }) =>
  page.entries.map((entry) => entry.subjectId);

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'audit-reach-owner@example.test'), ($2,'audit-reach-manager@example.test'),
       ($3,'audit-reach-desk@example.test'), ($4,'audit-reach-auditor@example.test'),
       ($5,'audit-reach-outsider@example.test'), ($6,'audit-reach-both@example.test')
     on conflict (id) do nothing`,
    OWNER,
    MANAGER,
    DESK,
    AUDITOR,
    OUTSIDER,
    BOTH,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Audit Reach Organization','active'), ($2,'Audit Reach Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1,$5,'Audit Reach A','Europe/Istanbul'),
       ($2,$5,'Audit Reach B','Asia/Tokyo'),
       ($3,$5,'Audit Reach Archived','Europe/Istanbul'),
       ($4,$6,'Audit Reach Elsewhere','Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY_A,
    PROPERTY_B,
    ARCHIVED,
    OTHER_PROPERTY,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     values ($1::uuid, $2, $1::uuid, 'Night audit D51', array[$3], 'active')
     on conflict (scope_id, key) do update
       set permissions = array[$3], status = 'active'`,
    ORG,
    NIGHT_AUDIT_ROLE,
    AUDIT_READ_PERMISSION,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1,$3,'owner','00000000-0000-0000-0000-000000000000','organization_wide'),
       ($1,$4,'manager','00000000-0000-0000-0000-000000000000','assigned_properties'),
       ($1,$5,'front_desk','00000000-0000-0000-0000-000000000000','assigned_properties'),
       ($1,$6,$9,$1,'assigned_properties'),
       ($2,$7,'owner','00000000-0000-0000-0000-000000000000','organization_wide'),
       ($1,$8,'owner','00000000-0000-0000-0000-000000000000','organization_wide'),
       ($2,$8,'owner','00000000-0000-0000-0000-000000000000','organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OTHER_ORG,
    OWNER,
    MANAGER,
    DESK,
    AUDITOR,
    OUTSIDER,
    BOTH,
    NIGHT_AUDIT_ROLE,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id) values
       ($1,$2,$3), ($1,$2,$4), ($1,$2,$5)
     on conflict (property_id, user_id) do update
       set status = 'active', revoked_at = null`,
    PROPERTY_A,
    ORG,
    MANAGER,
    DESK,
    AUDITOR,
  );

  // Something to name: a Guest in a room with a Reservation, at A.
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name)
     values ($1,$2,'Ayşe Denetim') on conflict (id) do nothing`,
    GUEST,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type)
     values ($1,$2,$3,'A-204','room') on conflict (id) do nothing`,
    UNIT,
    PROPERTY_A,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on)
     values ($1,$2,$3,$4,$5,'guest','confirmed', current_date + 400)
     on conflict (id) do nothing`,
    RESERVATION,
    ORG,
    PROPERTY_A,
    UNIT,
    GUEST,
  );

  await owner.$executeRawUnsafe(
    `update public.properties set status = 'active' where id = $1`,
    ARCHIVED,
  );

  await write(DESK, {
    organizationId: ORG,
    locationId: PROPERTY_A,
    action: "folio.charge_posted",
    subjectType: "folio",
    subjectId: run.chargeAtA,
    context: {
      amountMinor: 12000,
      currency: "TRY",
      description: "Minibar drinks",
      // This run's own, so a filter can isolate this record from the ones
      // earlier runs left behind.
      tag: run.chargeAtA,
    },
  });
  await write(OWNER, {
    organizationId: ORG,
    locationId: PROPERTY_B,
    action: "stay.checked_out",
    subjectType: "stay",
    subjectId: run.departureAtB,
  });
  await write(OWNER, {
    organizationId: ORG,
    action: "staff.role_defined",
    subjectType: "role",
    subjectId: run.roleDefined,
  });
  await write(MANAGER, {
    organizationId: ORG,
    locationId: PROPERTY_A,
    action: "folio.line_reversed",
    subjectType: "folio",
    subjectId: run.reversalAtA,
    reason: REASON,
  });
  await write(OWNER, {
    organizationId: ORG,
    locationId: ARCHIVED,
    action: "unit.blocked",
    subjectType: "accommodation_unit",
    subjectId: run.blockedAtArchived,
    reason: "a burst pipe in the ceiling",
  });
  await write(MANAGER, {
    organizationId: ORG,
    locationId: PROPERTY_A,
    action: "reservation.created",
    subjectType: "reservation",
    subjectId: RESERVATION,
    context: { guestId: GUEST, accommodationUnitId: UNIT },
  });
  await write(OUTSIDER, {
    organizationId: OTHER_ORG,
    locationId: OTHER_PROPERTY,
    action: "folio.closed",
    subjectType: "folio",
    subjectId: run.elsewhere,
  });

  // Records a page boundary is most likely to lose, written as the table
  // owner because the runtime role may not choose a record's time: four inside
  // one millisecond, a microsecond apart, and three sharing one instant
  // exactly. A cursor rounded to the millisecond steps past the first group;
  // one without the id tie-break repeats or drops the second.
  await owner.$executeRawUnsafe(
    `insert into audit.records
       (organization_id, actor_id, action, subject_type, subject_id, occurred_at)
     select $1::uuid, $2::uuid, 'reach.tick', 'thing', gen_random_uuid(),
            date_trunc('milliseconds', now()) - interval '1 day'
              + make_interval(secs => tick / 1000000.0)
       from generate_series(1, 4) as tick
     union all
     select $1::uuid, $2::uuid, 'reach.same_instant', 'thing', gen_random_uuid(),
            date_trunc('milliseconds', now()) - interval '2 days'
       from generate_series(1, 3)`,
    ORG,
    OWNER,
  );

  // Records only the table owner can write, each for one assertion below: one
  // at 22:30 UTC on 10 March, which is 01:30 on the 11th at the Property
  // (Istanbul, UTC+3), so a day filter read in the wrong clock puts it on the
  // wrong day; one from more than a year ago; and one whose context is not a
  // JSON object, which nothing in the schema forbids.
  await owner.$executeRawUnsafe(
    `insert into audit.records
       (organization_id, location_id, actor_id, action, subject_type,
        subject_id, occurred_at, context)
     values
       ($1::uuid, $2::uuid, $3::uuid, 'reach.late_night', 'thing', $4::uuid,
        '2026-03-10 22:30:00+00', jsonb_build_object('tag', $4::text)),
       ($1::uuid, $2::uuid, $3::uuid, 'reach.old', 'thing', $5::uuid,
        now() - interval '400 days', '{}'),
       ($1::uuid, $2::uuid, $3::uuid, 'reach.odd_context', 'thing', $6::uuid,
        now(), '"not an object"'::jsonb)`,
    ORG,
    PROPERTY_A,
    OWNER,
    run.lateNight,
    run.oldRecord,
    run.oddContext,
  );
  await write(MANAGER, {
    organizationId: ORG,
    locationId: PROPERTY_A,
    action: "reservation.check_in_reversed",
    subjectType: "reservation",
    subjectId: run.istanbul,
    reason: "İstanbul airport transfer booked instead",
  });

  // Archived after its record was written: history must outlive the hotel.
  await owner.$executeRawUnsafe(
    `update public.properties set status = 'archived' where id = $1`,
    ARCHIVED,
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

describe("who may open the log", () => {
  it("audit_read_is_what_opens_the_log", async () => {
    // Owner and Manager hold it through the shipped roles; Front desk does
    // not. The night auditor holds it through a role the Organization wrote.
    const where = async (userId: string) =>
      (await core.listPermittedProperties(userId, AUDIT_READ_PERMISSION))
        .map((property) => property.propertyId)
        .filter((id) => [PROPERTY_A, PROPERTY_B, ARCHIVED].includes(id));
    expect(await where(OWNER)).toEqual(
      expect.arrayContaining([PROPERTY_A, PROPERTY_B]),
    );
    expect(await where(MANAGER)).toEqual([PROPERTY_A]);
    expect(await where(AUDITOR)).toEqual([PROPERTY_A]);
    expect(await where(DESK)).toEqual([]);
  });

  it("a_staff_member_without_audit_read_reads_nothing", async () => {
    const page = await core.auditLog(DESK, PROPERTY_A);
    expect(page.entries).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("taking_audit_read_out_of_a_role_closes_the_log", async () => {
    await owner.$executeRawUnsafe(
      `update public.staff_roles set permissions = '{}'
        where scope_id = $1::uuid and key = $2`,
      ORG,
      NIGHT_AUDIT_ROLE,
    );
    try {
      expect((await core.auditLog(AUDITOR, PROPERTY_A)).entries).toEqual([]);
    } finally {
      await owner.$executeRawUnsafe(
        `update public.staff_roles set permissions = array[$3]
          where scope_id = $1::uuid and key = $2`,
        ORG,
        NIGHT_AUDIT_ROLE,
        AUDIT_READ_PERMISSION,
      );
    }
    expect(subjects(await core.auditLog(AUDITOR, PROPERTY_A))).toContain(
      run.chargeAtA,
    );
  });

  it("a_lapsed_subscription_does_not_close_the_log", async () => {
    // Audit is a baseline right (blueprint 3.6): an Organization whose
    // invoice is late can still find out who reversed a charge.
    await owner.$executeRawUnsafe(
      "update public.subscriptions set status='cancelled' where organization_id=$1",
      ORG,
    );
    try {
      expect(subjects(await core.auditLog(OWNER, PROPERTY_A))).toContain(
        run.chargeAtA,
      );
    } finally {
      await owner.$executeRawUnsafe(
        "update public.subscriptions set status='active' where organization_id=$1",
        ORG,
      );
    }
  });

  it("a_property_out_of_reach_reads_nothing", async () => {
    // Another Organization's, one of the viewer's own they are not assigned
    // to, and one that does not exist: the same empty answer each time.
    for (const propertyId of [
      OTHER_PROPERTY,
      PROPERTY_B,
      "d5100004-0000-4000-8000-0000000000ff",
    ]) {
      const page = await core.auditLog(MANAGER, propertyId);
      expect(page.entries).toEqual([]);
      expect(page.total).toBe(0);
    }
  });
});

describe("which records a reader reaches", () => {
  it("an_assigned_reader_reads_only_their_properties", async () => {
    // AL-DIFF-01, inverted: the Manager is assigned to A alone.
    const seen = subjects(await core.auditLog(MANAGER, PROPERTY_A));
    expect(seen).toContain(run.chargeAtA);
    expect(seen).toContain(run.reversalAtA);
    expect(seen).not.toContain(run.departureAtB);
    expect(seen).not.toContain(run.blockedAtArchived);
  });

  it("organization_wide_records_belong_to_organization_wide_readers", async () => {
    expect(subjects(await core.auditLog(MANAGER, PROPERTY_A))).not.toContain(
      run.roleDefined,
    );
    expect(subjects(await core.auditLog(OWNER, PROPERTY_A))).toContain(
      run.roleDefined,
    );
  });

  it("an_archived_propertys_history_stays_readable_and_named", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A);
    const blocked = page.entries.find(
      (entry) => entry.subjectId === run.blockedAtArchived,
    );
    expect(blocked?.propertyName).toBe("Audit Reach Archived");
  });

  it("recent_records_are_bounded_to_the_organization_asked_for", async () => {
    // BOTH reaches both Organizations; only the read's own predicate keeps
    // the other one's record out.
    const page = await core.auditLog(BOTH, PROPERTY_A);
    expect(page.entries.length).toBeGreaterThan(0);
    expect(new Set(page.entries.map((entry) => entry.organizationId))).toEqual(
      new Set([ORG]),
    );
    expect(subjects(page)).not.toContain(run.elsewhere);
  });

  it("recent_records_come_newest_first", async () => {
    const { entries } = await core.auditLog(OWNER, PROPERTY_A);
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i - 1]!.occurredAt >= entries[i]!.occurredAt).toBe(true);
    }
  });
});

describe("what a record is called", () => {
  it("the_actor_is_named_by_their_address", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A);
    expect(page.labels[MANAGER]).toBe("audit-reach-manager@example.test");
  });

  it("a_reservation_is_named_by_its_guest_and_room", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A);
    expect(page.labels[RESERVATION]).toBe("Ayşe Denetim · A-204");
    expect(page.labels[GUEST]).toBe("Ayşe Denetim");
    expect(page.labels[UNIT]).toBe("A-204");
  });

  it("times_are_each_propertys_own", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A);
    const at = (subject: string) =>
      page.entries.find((entry) => entry.subjectId === subject)?.timeZone;
    expect(at(run.departureAtB)).toBe("Asia/Tokyo");
    expect(at(run.chargeAtA)).toBe("Europe/Istanbul");
    // No location: the clock of the Property the log was opened from.
    expect(at(run.roleDefined)).toBe("Europe/Istanbul");
  });

  it("a_reversal_is_traceable_to_its_actor_and_reason", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A);
    const reversal = page.entries.find(
      (entry) => entry.subjectId === run.reversalAtA,
    );
    expect(reversal?.actorId).toBe(MANAGER);
    expect(reversal?.reason).toBe(REASON);
  });
});

describe("filters run on the server, over every record", () => {
  it("narrows_by_action", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A, {
      actions: ["folio.line_reversed"],
    });
    expect(page.entries.length).toBeGreaterThan(0);
    expect(new Set(page.entries.map((entry) => entry.action))).toEqual(
      new Set(["folio.line_reversed"]),
    );
  });

  it("narrows_to_one_property", async () => {
    const page = await core.auditLog(OWNER, PROPERTY_A, {
      propertyId: PROPERTY_B,
    });
    expect(subjects(page)).toContain(run.departureAtB);
    expect(new Set(page.entries.map((entry) => entry.locationId))).toEqual(
      new Set([PROPERTY_B]),
    );
  });

  it("narrows_by_day_in_the_propertys_clock", async () => {
    const [today] = await owner.$queryRawUnsafe<{ day: string }[]>(
      `select to_char((now() at time zone 'Europe/Istanbul')::date, 'YYYY-MM-DD') as day`,
    );
    // Each query is narrowed to this run's record by its tag, so records
    // earlier runs left on the same day never push it off the page.
    const inRange = await core.auditLog(OWNER, PROPERTY_A, {
      from: today!.day,
      to: today!.day,
      q: run.chargeAtA,
    });
    expect(subjects(inRange)).toContain(run.chargeAtA);
    const past = await core.auditLog(OWNER, PROPERTY_A, {
      from: "2020-01-01",
      to: "2020-01-02",
      q: run.chargeAtA,
    });
    expect(subjects(past)).not.toContain(run.chargeAtA);

    // The case where the clock decides: 22:30 UTC on the 10th is the 11th at
    // the Property. Read in UTC, both of these would be the other way round.
    const onThe11th = await core.auditLog(OWNER, PROPERTY_A, {
      from: "2026-03-11",
      to: "2026-03-11",
      q: run.lateNight,
    });
    expect(subjects(onThe11th)).toContain(run.lateNight);
    const onThe10th = await core.auditLog(OWNER, PROPERTY_A, {
      from: "2026-03-10",
      to: "2026-03-10",
      q: run.lateNight,
    });
    expect(subjects(onThe10th)).not.toContain(run.lateNight);
  });

  it("finds_a_guest_a_room_a_colleague_and_a_reason", async () => {
    const find = async (q: string) =>
      subjects(await core.auditLog(OWNER, PROPERTY_A, { q }));
    expect(await find("ayşe denetim")).toContain(RESERVATION);
    expect(await find("A-204")).toContain(RESERVATION);
    expect(await find("audit-reach-desk@")).toContain(run.chargeAtA);
    expect(await find("wrong stay")).toContain(run.reversalAtA);
    // A fact the record carries, not only its reason: the charge's own words.
    expect(await find("minibar")).toContain(run.chargeAtA);
    expect(await find("nothing-is-called-this")).toEqual([]);
    // A dotted capital folds to what somebody types without it.
    expect(await find("istanbul")).toContain(run.istanbul);
    expect(await find("İSTANBUL")).toContain(run.istanbul);
  });

  it("a_record_whose_context_is_not_an_object_does_not_break_search", async () => {
    // jsonb_each_text raises on anything but an object; one such record would
    // otherwise make every search in the Organization a server error.
    const found = subjects(
      await core.auditLog(OWNER, PROPERTY_A, { q: "minibar" }),
    );
    expect(found).toContain(run.chargeAtA);
    expect(found).not.toContain(run.oddContext);
  });

  it("a_search_cannot_reach_past_the_readers_reach", async () => {
    // The Manager may not read B, so searching for B's actor finds nothing
    // of B's — the policy bounds the search as it bounds the list.
    const found = subjects(
      await core.auditLog(MANAGER, PROPERTY_A, { q: "audit-reach-owner@" }),
    );
    expect(found).not.toContain(run.departureAtB);
    expect(found).not.toContain(run.roleDefined);
  });

  it("a_filter_from_an_edited_url_narrows_to_nothing_rather_than_failing", async () => {
    await expect(
      core.auditLog(OWNER, PROPERTY_A, { propertyId: "not-a-uuid" }),
    ).resolves.toMatchObject({ entries: [], total: 0 });
    // A day that does not exist is no filter at all, never a cast error.
    const loose = await core.auditLog(OWNER, PROPERTY_A, {
      from: "2026-02-30",
    });
    expect(loose.total).toBeGreaterThan(0);
    // Year 0 is a date JavaScript accepts and Postgres refuses.
    const yearZero = await core.auditLog(OWNER, PROPERTY_A, {
      from: "0000-01-01",
    });
    expect(yearZero.total).toBeGreaterThan(0);
    // A cursor that is not one starts at the top — including one whose
    // number is too large for the arithmetic behind it.
    const newest = (await core.auditLog(OWNER, PROPERTY_A)).entries[0]?.id;
    for (const cursor of [
      "garbage",
      `9999999999999999999.${ORG}`,
      `9223372036854775807.${ORG}`,
    ]) {
      const top = await core.auditLog(OWNER, PROPERTY_A, { cursor });
      expect(top.entries[0]?.id).toBe(newest);
    }
    // NUL is refused by Postgres in any text value; typed into a URL it is
    // no match rather than a server error.
    await expect(
      core.auditLog(OWNER, PROPERTY_A, { q: "mini\u0000bar" }),
    ).resolves.toMatchObject({ total: expect.any(Number) });
  });
});

describe("pages", () => {
  const page = (cursor?: string) =>
    withOrganizationContext(prisma, { userId: OWNER }, (tx) =>
      recentWithin(tx, ORG, { limit: 3, ...(cursor ? { cursor } : {}) }),
    );

  it("walks_every_record_once_with_the_same_total_on_every_page", async () => {
    // Pages of three over records that share milliseconds and instants, so
    // boundaries fall inside those groups on some run or other; the assertion
    // holds for every boundary, not only a lucky one.
    const first = await page();
    const seen: string[] = [];
    let current = first;
    // Bounded by the count, not by a constant: records accumulate with every
    // run, and a fixed ceiling would one day stop the walk early and read as
    // records lost.
    for (let pages = 0; pages <= Math.ceil(first.total / 3); pages += 1) {
      expect(current.total).toBe(first.total);
      seen.push(...current.records.map((record) => record.id));
      if (!current.nextCursor) break;
      current = await page(current.nextCursor);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(first.total);
  });

  it("opens_a_record_by_id_however_old", async () => {
    // A subject id is not a record id: guessing is no way in.
    const opened = await core.auditRecord(OWNER, PROPERTY_A, run.chargeAtA);
    expect(opened).toBeNull();

    // More than a year old, and on no page anybody has loaded: opened by id.
    const [old] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from audit.records where subject_id = $1::uuid`,
      run.oldRecord,
    );
    const byOldId = await core.auditRecord(OWNER, PROPERTY_A, old!.id);
    expect(byOldId?.entry.subjectId).toBe(run.oldRecord);
    const { entries } = await core.auditLog(OWNER, PROPERTY_A, {
      actions: ["folio.charge_posted"],
      q: "audit-reach-desk@",
    });
    const charge = entries.find((entry) => entry.subjectId === run.chargeAtA)!;
    const byId = await core.auditRecord(OWNER, PROPERTY_A, charge.id);
    expect(byId?.entry.subjectId).toBe(run.chargeAtA);
    expect(byId?.labels[DESK]).toBe("audit-reach-desk@example.test");
    // Not to somebody who may not read it, and not by a guessed id.
    expect(await core.auditRecord(DESK, PROPERTY_A, charge.id)).toBeNull();
    // Nor opened through a Property of another Organization, by somebody who
    // reaches both: the record's own Organization is part of the read.
    expect(await core.auditRecord(BOTH, OTHER_PROPERTY, charge.id)).toBeNull();
    expect(await core.auditRecord(OWNER, PROPERTY_A, "not-a-uuid")).toBeNull();
  });
});
