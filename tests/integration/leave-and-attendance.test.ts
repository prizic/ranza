/**
 * Leave and the nightly roll call, through the module (RANZ-101, LA-S1-*).
 *
 * tests/database/leave_and_attendance.test.sql proves each policy, trigger and
 * constraint one statement at a time. This proves what only the module adds:
 * the rows are walked in the order a warden walks them, the figures are counted
 * from them, leave outranks a mark, a second tap is not a revision while a
 * changed answer is a correction kept above the old, a Resident's leave is
 * ended or cancelled by whether a night of it has passed, the curfew has a
 * default and a Property's own, and each action leaves its audit record
 * without the reason in it.
 *
 * A Property of each run's own; the Organization and its people are shared and
 * idempotent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import {
  AttendanceInputError,
  AttendanceRefusedError,
  LeaveClosedError,
  LeaveOverlapsError,
  createAttendanceModule,
} from "../../packages/ranza/attendance/src";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createPrismaClient } from "../../packages/db/src";
import { gateOf } from "../../apps/operator-workspace/src/lib/screens";
import { createReservationsModule } from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

const ORG = "d5800002-0000-4000-8000-000000000001";
const OWNER = "d5800001-0000-4000-8000-000000000001";
const WARDEN = "d5800001-0000-4000-8000-000000000002";
const HOUSEKEEPER = "d5800001-0000-4000-8000-000000000003";
const OUTSIDER = "d5800001-0000-4000-8000-000000000004";
const OTHER_ORG = "d5800002-0000-4000-8000-000000000002";
const PROPERTY = randomUUID();
const HOTEL = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const attendance = createAttendanceModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const accommodation = createAccommodationModule({ db: prisma });
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

let today: string;
const beds: Record<string, string> = {};
const stays: Record<string, string> = {};

const day = (offset: number): string => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function residentIn(name: string, unitId: string): Promise<string> {
  const booking = await reservations.createReservation(OWNER, {
    propertyId: PROPERTY,
    accommodationUnitId: unitId,
    guestName: name,
    guestEmail: null,
    guestPhone: null,
    stayType: "resident",
    startsOn: today,
    endsOn: null,
    quotedRateMinor: null,
    quotedCurrency: null,
  });
  const { stayId } = await reservations.checkIn(OWNER, booking.reservationId);
  return stayId;
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'attendance-owner@example.test'),
       ($2, 'attendance-warden@example.test'),
       ($3, 'attendance-housekeeper@example.test'),
       ($4, 'attendance-outsider@example.test')
     on conflict (id) do nothing`,
    OWNER,
    WARDEN,
    HOUSEKEEPER,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Attendance Organization', 'active'),
       ($2, 'Other Attendance Organization', 'active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active'), ($2, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'front_office', 'active'), ($2, 'front_office', 'active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
    OTHER_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1, 'warden', $1, 'Night warden', array['attendance.take'])
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     values ($1, $2, 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
            ($1, $3, 'warden', $1, 'organization_wide'),
            ($1, $4, 'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
            ($5, $6, 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OWNER,
    WARDEN,
    HOUSEKEEPER,
    OTHER_ORG,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, operating_model)
     values ($1, $2, $3, 'dormitory'), ($4, $2, $5, 'hotel')`,
    PROPERTY,
    ORG,
    `Attendance Yurt ${PROPERTY.slice(0, 8)}`,
    HOTEL,
    `Attendance Hotel ${HOTEL.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true), ($1, $2, 'attendance', true),
            ($3, $2, 'front_desk', true)`,
    PROPERTY,
    ORG,
    HOTEL,
  );
  const [row] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select app.property_today($1::uuid)::text as today`,
    PROPERTY,
  );
  today = row!.today;

  // Blok B first, then Blok A, floors 2 then 1: the order they are made in is
  // not the order they are walked in.
  for (const [building, floor, number] of [
    ["Blok B", 1, "301"],
    ["Blok A", 2, "201"],
    ["Blok A", 1, "101"],
  ] as const) {
    const added = await accommodation.addUnits(OWNER, {
      propertyId: PROPERTY,
      building,
      floor,
      unitType: "room",
      firstNumber: number,
      count: 1,
      capacity: 2,
      letByTheBed: true,
      admits: null,
    });
    const bedsOfRoom = await owner.$queryRawUnsafe<
      { id: string; name: string }[]
    >(
      `select id, name from public.accommodation_units
        where parent_id = $1::uuid order by name`,
      added.unitIds[0],
    );
    beds[`${building}/${floor}/A`] = bedsOfRoom[0]!.id;
    beds[`${building}/${floor}/B`] = bedsOfRoom[1]!.id;
  }
  stays.elif = await residentIn("Elif Yılmaz", beds["Blok A/1/A"]!);
  stays.zeynep = await residentIn("Zeynep Kaya", beds["Blok A/1/B"]!);
  stays.merve = await residentIn("Merve Demir", beds["Blok A/2/A"]!);
  stays.emre = await residentIn("Emre Şahin", beds["Blok B/1/A"]!);
});

afterAll(async () => {
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("the roll call of tonight", () => {
  it("LA-S1-14: walks block, floor, room and bed, and counts what it lists", async () => {
    const call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call).not.toBeNull();
    expect(call!.night).toBe(today);
    expect(call!.rows.map((row) => row.residentName)).toEqual([
      "Elif Yılmaz",
      "Zeynep Kaya",
      "Merve Demir",
      "Emre Şahin",
    ]);
    expect(
      call!.rows.map((row) => [row.building, row.floor, row.bedName]),
    ).toEqual([
      ["Blok A", 1, "A"],
      ["Blok A", 1, "B"],
      ["Blok A", 2, "A"],
      ["Blok B", 1, "A"],
    ]);
    expect(call!.figures).toEqual({
      inHouse: 4,
      onLeave: 0,
      present: 0,
      absent: 0,
      notCalled: 4,
    });
  });

  it("LA-S1-16: a second tap writes nothing and a changed answer is a correction above the old", async () => {
    const first = await attendance.record(WARDEN, PROPERTY, today, [
      { stayId: stays.elif!, mark: "present" },
      { stayId: stays.zeynep!, mark: "absent" },
    ]);
    expect(first).toEqual({ recorded: 2, unchanged: 0 });

    const again = await attendance.record(WARDEN, PROPERTY, today, [
      { stayId: stays.elif!, mark: "present" },
    ]);
    expect(again).toEqual({ recorded: 0, unchanged: 1 });

    const corrected = await attendance.record(WARDEN, PROPERTY, today, [
      { stayId: stays.zeynep!, mark: "present" },
    ]);
    expect(corrected).toEqual({ recorded: 1, unchanged: 0 });

    const revisions = await owner.$queryRawUnsafe<
      { status: string; markedBy: string }[]
    >(
      `select status, marked_by as "markedBy" from public.attendance_marks
        where stay_id = $1::uuid and night = $2::date order by id`,
      stays.zeynep,
      today,
    );
    expect(revisions).toEqual([
      { status: "absent", markedBy: WARDEN },
      { status: "present", markedBy: WARDEN },
    ]);

    const call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call!.figures).toMatchObject({
      present: 2,
      absent: 0,
      notCalled: 2,
    });

    const recorded = await latestRecord(owner, "roll_call.recorded", PROPERTY);
    expect(recorded?.locationId).toBe(PROPERTY);
    expect(recorded?.context).toMatchObject({
      night: today,
      present: 1,
      absent: 1,
    });
    const correction = await latestRecord(
      owner,
      "roll_call.corrected",
      stays.zeynep!,
    );
    expect(correction?.context).toMatchObject({
      from: "absent",
      to: "present",
    });
  });

  it("LA-S1-15: marking the rest present leaves the answered and the away alone", async () => {
    await attendance.record(WARDEN, PROPERTY, today, [
      { stayId: stays.merve!, mark: "absent" },
    ]);
    await attendance.grantLeave(OWNER, {
      stayId: stays.emre!,
      fromNight: today,
      toNight: day(1),
      reason: "Visiting family in Ankara",
    });
    const result = await attendance.markTheRestPresent(
      WARDEN,
      PROPERTY,
      Object.values(stays),
    );
    // Elif and Zeynep are answered, Merve is absent, Emre is away: nobody left.
    expect(result).toEqual({ recorded: 0, unchanged: 0 });

    const call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call!.figures).toEqual({
      inHouse: 4,
      onLeave: 1,
      present: 2,
      absent: 1,
      notCalled: 0,
    });
  });

  it("LA-S1-13: leave outranks a mark, and cancelling the leave brings the mark back", async () => {
    await attendance.record(WARDEN, PROPERTY, today, [
      { stayId: stays.emre!, mark: "absent" },
    ]);
    let call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call!.rows.find((row) => row.stayId === stays.emre)?.status).toBe(
      "on_leave",
    );
    expect(call!.figures.absent).toBe(1);

    const [leave] = call!.leaves;
    expect(await attendance.returnFromLeave(OWNER, leave!.leaveId)).toBe(
      "cancelled",
    );

    call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call!.rows.find((row) => row.stayId === stays.emre)?.status).toBe(
      "absent",
    );
    expect(call!.figures).toEqual({
      inHouse: 4,
      onLeave: 0,
      present: 2,
      absent: 2,
      notCalled: 0,
    });
  });

  it("LA-S1-14: Today's figures are the screen's, counted from the same rows", async () => {
    const call = await attendance.rollCall(OWNER, PROPERTY);
    const figures = await attendance.figuresTonight(OWNER, PROPERTY);
    expect(figures).toMatchObject({
      ...call!.figures,
      propertyId: PROPERTY,
      night: today,
    });
  });

  it("LA-S1-10: whoever may not call the roll cannot, and the roll is no secret kept from the desk", async () => {
    await expect(
      attendance.record(HOUSEKEEPER, PROPERTY, today, [
        { stayId: stays.elif!, mark: "absent" },
      ]),
    ).rejects.toBeInstanceOf(AttendanceRefusedError);
    expect(await attendance.rollCall(HOUSEKEEPER, PROPERTY)).toBeNull();
    expect(await attendance.figuresTonight(HOUSEKEEPER, PROPERTY)).toBeNull();
    expect(await attendance.rollCall(OUTSIDER, PROPERTY)).toBeNull();
    await expect(
      attendance.record(OUTSIDER, PROPERTY, today, [
        { stayId: stays.elif!, mark: "absent" },
      ]),
    ).rejects.toBeInstanceOf(AttendanceRefusedError);
  });

  it("LA-S1-19: a Property that does not keep attendance has no roll call", async () => {
    expect(await attendance.rollCall(OWNER, HOTEL)).toBeNull();
    expect(await attendance.figuresTonight(OWNER, HOTEL)).toBeNull();
  });
});

describe("leave", () => {
  it("LA-S1-08: the roll call reads who is away and not why; the desk reads both", async () => {
    await attendance.grantLeave(OWNER, {
      stayId: stays.merve!,
      fromNight: day(2),
      toNight: day(4),
      reason: "Sister's wedding",
    });
    const asWarden = await attendance.rollCall(WARDEN, PROPERTY);
    const away = asWarden!.leaves.find((leave) => leave.stayId === stays.merve);
    expect(away).toMatchObject({
      fromNight: day(2),
      toNight: day(4),
      reason: null,
      mayClose: false,
    });

    const asOwner = await attendance.rollCall(OWNER, PROPERTY);
    expect(
      asOwner!.leaves.find((leave) => leave.stayId === stays.merve),
    ).toMatchObject({
      reason: "Sister's wedding",
      mayClose: true,
    });
  });

  it("LA-S1-07: a warden may not give leave", async () => {
    await expect(
      attendance.grantLeave(WARDEN, {
        stayId: stays.elif!,
        fromNight: today,
        toNight: today,
        reason: "Not allowed",
      }),
    ).rejects.toBeInstanceOf(AttendanceRefusedError);
  });

  it("LA-S1-03: a Resident already away on a night is not given it again", async () => {
    await expect(
      attendance.grantLeave(OWNER, {
        stayId: stays.merve!,
        fromNight: day(4),
        toNight: day(6),
        reason: "Overlapping",
      }),
    ).rejects.toBeInstanceOf(LeaveOverlapsError);
  });

  it("LA-S1-04: a reason and the nights are measured before the database is asked", async () => {
    const attempt = (reason: string, fromNight = day(9), toNight = day(9)) =>
      attendance
        .grantLeave(OWNER, { stayId: stays.elif!, fromNight, toNight, reason })
        .then(
          () => null,
          (error: unknown) => error,
        );
    const short = await attempt(" a ");
    expect(short).toBeInstanceOf(AttendanceInputError);
    expect((short as AttendanceInputError).field).toBe("reason");
    const backwards = await attempt("Valid reason", day(9), day(8));
    expect((backwards as AttendanceInputError).field).toBe("toNight");
    const forever = await attempt("Valid reason", day(9), day(9 + 366));
    expect((forever as AttendanceInputError).field).toBe("toNight");
  });

  it("LA-S1-06: a leave that has begun is ended at the last night spent away, one that has not is cancelled", async () => {
    // A Resident who has lived here five nights, which a booking made today
    // cannot be: the Stay is made the way an import would.
    const [room] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       values ($1::uuid, $2::uuid, 'Older-' || substr(gen_random_uuid()::text, 1, 6), 'room', 1)
       returning id`,
      PROPERTY,
      ORG,
    );
    const [older] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type, status, starts_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'resident', 'in_house', $4::date)
       returning id`,
      ORG,
      PROPERTY,
      room!.id,
      day(-5),
    );
    const leaveId = await attendance.grantLeave(OWNER, {
      stayId: older!.id,
      fromNight: day(-3),
      toNight: day(2),
      reason: "Exam week at home",
    });
    expect(await attendance.returnFromLeave(OWNER, leaveId)).toBe("ended");

    const [ended] = await owner.$queryRawUnsafe<
      { status: string; toNight: string; planned: string; closedBy: string }[]
    >(
      `select status, to_char(to_night, 'YYYY-MM-DD') as "toNight",
              to_char(planned_to_night, 'YYYY-MM-DD') as planned, closed_by as "closedBy"
         from public.attendance_leaves where id = $1::uuid`,
      leaveId,
    );
    expect(ended).toEqual({
      status: "ended",
      toNight: day(-1),
      planned: day(2),
      closedBy: OWNER,
    });

    await expect(
      attendance.returnFromLeave(OWNER, leaveId),
    ).rejects.toBeInstanceOf(LeaveClosedError);
    await expect(attendance.cancelLeave(OWNER, leaveId)).rejects.toBeInstanceOf(
      LeaveClosedError,
    );

    // Cancelling a begun leave is not a way round the history of its nights.
    const second = await attendance.grantLeave(OWNER, {
      stayId: older!.id,
      fromNight: day(1),
      toNight: day(1),
      reason: "A day away",
    });
    expect(await attendance.cancelLeave(OWNER, second)).toBe("cancelled");

    const granted = await latestRecord(
      owner,
      "resident_leave.granted",
      leaveId,
    );
    expect(granted?.locationId).toBe(PROPERTY);
    expect(JSON.stringify(granted?.context)).not.toContain("Exam week");
    expect(
      await latestRecord(owner, "resident_leave.ended", leaveId),
    ).toBeDefined();
    expect(
      await latestRecord(owner, "resident_leave.cancelled", second),
    ).toBeDefined();
  });
});

describe("the curfew", () => {
  it("LA-S1-17: a dormitory starts with the application's default, and a Property's own replaces it", async () => {
    let call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call).toMatchObject({ curfew: "23:00", curfewIsDefault: true });

    // The curfew equal to the Property's cutoff is the start of the night, so
    // tonight's has always passed.
    await attendance.setCurfew(OWNER, PROPERTY, "04:00");
    call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call).toMatchObject({
      curfew: "04:00",
      curfewIsDefault: false,
      curfewPassed: true,
    });
    expect(await attendance.figuresTonight(OWNER, PROPERTY)).toMatchObject({
      curfewPassed: true,
    });

    // The last minute of the business day belongs to the morning after.
    await attendance.setCurfew(OWNER, PROPERTY, "03:59");
    expect((await attendance.rollCall(OWNER, PROPERTY))!.curfewPassed).toBe(
      false,
    );

    await attendance.setCurfew(OWNER, PROPERTY, null);
    call = await attendance.rollCall(OWNER, PROPERTY);
    expect(call).toMatchObject({
      curfew: null,
      curfewIsDefault: false,
      curfewPassed: false,
    });

    const changed = await latestRecord(
      owner,
      "attendance_setting.changed",
      PROPERTY,
    );
    expect(changed?.context).toMatchObject({
      setting: "curfew",
      from: "03:59",
      to: null,
    });
  });

  it("LA-S1-18: only whoever configures the Property sets it, and only a time", async () => {
    await expect(
      attendance.setCurfew(WARDEN, PROPERTY, "22:00"),
    ).rejects.toBeInstanceOf(AttendanceRefusedError);
    const bad = await attendance.setCurfew(OWNER, PROPERTY, "25:00").then(
      () => null,
      (error: unknown) => error,
    );
    expect((bad as AttendanceInputError).field).toBe("curfew");
  });
});

describe("the roll call as a destination", () => {
  /** The Properties the rail offers Roll call at, for one person. */
  async function offeredAt(userId: string): Promise<string[]> {
    const gate = gateOf("roll-call");
    const [properties] = await core.listPermittedPropertiesByGate(userId, [
      {
        permissions:
          typeof gate.permission === "string"
            ? [gate.permission]
            : (gate.permission ?? []),
        capability: gate.capability,
        organizationWide: gate.organizationWide,
      },
    ]);
    return (properties ?? []).map((property) => property.propertyId);
  }

  it("LA-S2-01: the roll call is offered where the capability is on and the viewer may call it or give leave", async () => {
    // The desk may do both and the warden only calls: each is offered the
    // yurt, and no hotel. This Organization keeps a yurt for every run, so the
    // answer is read for these two Properties and not for its length.
    for (const userId of [OWNER, WARDEN]) {
      const offered = await offeredAt(userId);
      expect(offered).toContain(PROPERTY);
      expect(offered).not.toContain(HOTEL);
    }
    // A housekeeper holds neither permission, and somebody in another
    // Organization reaches none of these Properties.
    expect(await offeredAt(HOUSEKEEPER)).toEqual([]);
    expect(await offeredAt(OUTSIDER)).toEqual([]);
  });
});
