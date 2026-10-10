/**
 * The time a Guest expects to arrive, against a real database (RANZ-23,
 * docs/features/front-desk, FD-S6-*).
 *
 * tests/database/expected_arrival.test.sql proves the grant and the command one
 * statement at a time. This proves the module's part: the time travelling in
 * with a booking, the arrivals list reading it against the Property's own
 * clock, and the amend command changing it with or without the nights.
 *
 * The Property's clock is chosen so that "now" is well inside its day, whenever
 * this runs: a time of 00:01 has then passed and 23:59 has not, and neither
 * answer depends on the hour the suite was started. Between 05:00 and 20:00 the
 * business date is also the calendar date, whatever the cutoff.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  BookingChangedError,
  BookingChangeError,
  ExpectedArrivalError,
  ReservationPeriodError,
  UnitUnavailableError,
  createReservationsModule,
  type BookingChange,
} from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

const ORG = "a7300002-0000-4000-8000-000000000001";
const DESK = "a7300001-0000-4000-8000-000000000001";
const BOOKER = "a7300001-0000-4000-8000-000000000002";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

let property: string;
let today: string;
const unit: Record<string, string> = {};

function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A timezone in which it is between 05:00 and 20:00 right now. One of six
 * zones is always in that window, which is why there are six.
 */
async function zoneInsideItsDay(): Promise<string> {
  const candidates = [
    "Etc/GMT",
    "Etc/GMT+12",
    "Europe/Istanbul",
    "Pacific/Kiritimati",
    "Asia/Tokyo",
    "America/New_York",
  ];
  for (const zone of candidates) {
    const [row] = await owner.$queryRawUnsafe<{ hour: number }[]>(
      `select extract(hour from now() at time zone $1)::int as hour`,
      zone,
    );
    if (row && row.hour >= 5 && row.hour <= 20) return zone;
  }
  throw new Error("some zone is always inside its day");
}

async function seed() {
  property = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'arrival-desk@example.test'), ($2, 'arrival-booker@example.test')
     on conflict (id) do nothing`,
    DESK,
    BOOKER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Expected Arrival Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties
       (id, organization_id, name, currency, timezone)
     values ($1, $2, 'Expected Arrival Property', 'TRY', $3)`,
    property,
    ORG,
    await zoneInsideItsDay(),
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1, 'arrival_booker', $1, 'Books only', array['front_desk.book', 'front_desk.check_in'])
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'front_desk', 'organization_wide')
     on conflict do nothing`,
    ORG,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     values ($1, $2, 'arrival_booker', $1, 'organization_wide')
     on conflict do nothing`,
    ORG,
    BOOKER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key)
     values ($1, 'front_office') on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    property,
    ORG,
  );
  const units = await owner.$queryRawUnsafe<{ id: string; name: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, status)
     values ($1, $2, 'E-1', 'room', 2, 'available'),
            ($1, $2, 'E-2', 'room', 2, 'available'),
            ($1, $2, 'E-3', 'room', 2, 'available'),
            ($1, $2, 'E-4', 'room', 2, 'available'),
            ($1, $2, 'E-5', 'room', 2, 'available'),
            ($1, $2, 'E-6', 'room', 2, 'available')
     returning id, name`,
    property,
    ORG,
  );
  for (const row of units) unit[row.name] = row.id;
  await owner.$executeRawUnsafe(
    `insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ($1, $2, 'room', 150000)`,
    ORG,
    property,
  );
  const [day] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today`,
    property,
  );
  today = day!.today;
}

async function book(
  unitName: string,
  from: number,
  to: number,
  expectedArrival?: string | null,
  actor = DESK,
) {
  const created = await reservations.createReservation(actor, {
    propertyId: property,
    accommodationUnitId: unit[unitName]!,
    guestName: "Arrival Guest",
    guestEmail: null,
    guestPhone: null,
    stayType: "guest",
    startsOn: plusDays(today, from),
    endsOn: plusDays(today, to),
    quotedRateMinor: 150000,
    quotedCurrency: "TRY",
    ...(expectedArrival === undefined ? {} : { expectedArrival }),
  });
  return created.reservationId;
}

async function booking(reservationId: string) {
  const rows = await reservations.listReservations(DESK, property);
  const row = rows.find((r) => r.reservationId === reservationId);
  if (!row) throw new Error("the booking should be listed");
  return row;
}

async function arrival(reservationId: string) {
  const rows = await reservations.listArrivals(DESK, property);
  const row = rows.find((r) => r.reservationId === reservationId);
  if (!row) throw new Error("the booking should be on the arrivals list");
  return row;
}

/** A change that keeps the nights and the Unit and says only what is given. */
function sameNights(
  id: string,
  from: number,
  to: number,
  unitName: string,
  extra: Partial<BookingChange> & { version: number },
): BookingChange {
  return {
    reservationId: id,
    startsOn: plusDays(today, from),
    endsOn: plusDays(today, to),
    accommodationUnitId: unit[unitName]!,
    quotedRateMinor: 150000,
    quotedCurrency: "TRY",
    note: null,
    ...extra,
  };
}

async function revisions(reservationId: string) {
  return owner.$queryRawUnsafe<
    { kind: string; fromTime: string | null; toTime: string | null }[]
  >(
    `select kind,
            to_char(from_expected_arrival_time, 'HH24:MI') as "fromTime",
            to_char(to_expected_arrival_time, 'HH24:MI')   as "toTime"
       from public.reservation_changes
      where reservation_id = $1::uuid
      -- changed_at is the transaction's start, so the two revisions of one save
      -- share it; the kind keeps the order the assertions read in.
      order by changed_at, kind`,
    reservationId,
  );
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("taking a booking with an expected arrival", () => {
  it(
    "an_expected_arrival_is_kept_when_a_booking_is_taken",
    async () => {
      const withTime = await book("E-1", 10, 12, "14:30");
      const without = await book("E-1", 14, 15);
      const cleared = await book("E-2", 10, 12, null);

      expect((await booking(withTime)).expectedArrival).toBe("14:30");
      expect((await booking(without)).expectedArrival).toBeNull();
      expect((await booking(cleared)).expectedArrival).toBeNull();
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_with_a_malformed_time_is_refused_before_it_is_written",
    async () => {
      for (const malformed of ["25:00", "9:30", "1430", "12:60", "noon"]) {
        await expect(book("E-3", 20, 21, malformed)).rejects.toBeInstanceOf(
          ExpectedArrivalError,
        );
      }
      const [row] = await owner.$queryRawUnsafe<{ count: number }[]>(
        `select count(*)::int as count from public.reservations
          where accommodation_unit_id = $1::uuid`,
        unit["E-3"],
      );
      expect(row?.count).toBe(0);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_desk_that_may_book_but_not_amend_sets_the_time_when_taking_the_booking",
    async () => {
      const id = await book("E-4", 10, 12, "09:15", BOOKER);
      expect((await booking(id)).expectedArrival).toBe("09:15");
    },
    DATABASE_BUDGET_MS,
  );
});

describe("the arrivals list", () => {
  it(
    "says_when_the_expected_time_has_passed_on_the_properties_own_clock",
    async () => {
      const passed = await book("E-5", 0, 1, "00:01");
      const upcoming = await book("E-6", 0, 1, "23:59");
      const unsaid = await book("E-1", 0, 1);

      expect(await arrival(passed)).toMatchObject({
        expectedArrival: "00:01",
        expectedArrivalPassed: true,
        daysLate: 0,
      });
      expect(await arrival(upcoming)).toMatchObject({
        expectedArrival: "23:59",
        expectedArrivalPassed: false,
      });
      expect(await arrival(unsaid)).toMatchObject({
        expectedArrival: null,
        expectedArrivalPassed: false,
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "stops_saying_so_once_the_guest_is_checked_in",
    async () => {
      const id = await book("E-2", 0, 1, "00:01");
      expect((await arrival(id)).expectedArrivalPassed).toBe(true);

      await reservations.checkIn(DESK, id);

      expect(await arrival(id)).toMatchObject({
        status: "checked_in",
        expectedArrival: "00:01",
        expectedArrivalPassed: false,
      });
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a Property whose business date still reads yesterday", () => {
  it(
    "reads_the_time_on_the_bookings_own_calendar_day_between_midnight_and_the_cutoff",
    async () => {
      // A zone in which it is between 01:00 and 03:00 now: past midnight, before
      // the 04:00 cutoff, so the business date is still yesterday's.
      let zone: string | null = null;
      for (let offset = -12; offset <= 12 && zone === null; offset++) {
        const candidate = `Etc/GMT${offset < 0 ? "-" : "+"}${Math.abs(offset)}`;
        const [row] = await owner.$queryRawUnsafe<{ hour: number }[]>(
          `select extract(hour from now() at time zone $1)::int as hour`,
          candidate,
        );
        if (row && row.hour >= 1 && row.hour <= 3) zone = candidate;
      }
      if (zone === null) {
        throw new Error("some zone is always just past midnight");
      }

      const late = randomUUID();
      await owner.$executeRawUnsafe(
        `insert into public.properties (id, organization_id, name, currency, timezone)
         values ($1, $2, 'Expected Arrival After Midnight', 'TRY', $3)`,
        late,
        ORG,
        zone,
      );
      await owner.$executeRawUnsafe(
        `insert into public.property_capabilities
           (property_id, organization_id, capability_key, enabled)
         values ($1, $2, 'front_desk', true)`,
        late,
        ORG,
      );
      const [room] = await owner.$queryRawUnsafe<{ id: string }[]>(
        `insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity, status)
         values ($1, $2, 'L-1', 'room', 2, 'available') returning id`,
        late,
        ORG,
      );
      const [day] = await owner.$queryRawUnsafe<
        { today: string; calendar: string }[]
      >(
        `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today,
                to_char(now() at time zone $2, 'YYYY-MM-DD') as calendar`,
        late,
        zone,
      );
      expect(day!.today < day!.calendar).toBe(true);

      const created = await reservations.createReservation(DESK, {
        propertyId: late,
        accommodationUnitId: room!.id,
        guestName: "Night Owl",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        startsOn: day!.today,
        endsOn: plusDays(day!.today, 1),
        quotedRateMinor: null,
        quotedCurrency: null,
        expectedArrival: "23:30",
      });

      const rows = await reservations.listArrivals(DESK, late);
      expect(
        rows.find((r) => r.reservationId === created.reservationId),
      ).toMatchObject({
        expectedArrival: "23:30",
        expectedArrivalPassed: true,
      });
    },
    DATABASE_BUDGET_MS,
  );
});

describe("changing the expected arrival", () => {
  it(
    "changing_only_the_time_leaves_the_nights_and_the_unit_alone",
    async () => {
      const id = await book("E-3", 30, 33);
      const before = await booking(id);
      const preview = await reservations.previewChange(
        DESK,
        id,
        plusDays(today, 30),
        plusDays(today, 33),
      );
      expect(preview.expectedArrival).toBeNull();

      const amended = await reservations.amendBooking(
        DESK,
        sameNights(id, 30, 33, "E-3", {
          version: preview.version,
          expectedArrival: "18:45",
          note: "The Guest called",
        }),
      );
      expect(amended.nightlyRateMinor).toBe(150000);

      expect(await booking(id)).toMatchObject({
        startsOn: before.startsOn,
        endsOn: before.endsOn,
        unitId: before.unitId,
        nightlyRateMinor: before.nightlyRateMinor,
        expectedArrival: "18:45",
      });
      expect(await revisions(id)).toEqual([
        { kind: "arrival_time_changed", fromTime: null, toTime: "18:45" },
      ]);

      const record = await latestRecord(
        owner,
        "reservation.arrival_time_changed",
        id,
      );
      expect(record?.reason).toBe("The Guest called");
      expect(record?.locationId).toBe(property);
      expect(record?.context).toMatchObject({
        changeId: amended.changeId,
        fromTime: null,
        toTime: "18:45",
      });
      expect(
        await latestRecord(owner, "reservation.amended", id),
      ).toBeUndefined();

      const reread = await reservations.previewChange(
        DESK,
        id,
        plusDays(today, 30),
        plusDays(today, 33),
      );
      expect(reread).toMatchObject({
        expectedArrival: "18:45",
        version: preview.version + 1,
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_omitted_time_is_left_as_it_is_and_null_clears_it",
    async () => {
      const id = await book("E-4", 40, 42, "13:00");

      // A caller that knows nothing of the time moves the nights.
      await reservations.amendBooking(
        DESK,
        sameNights(id, 41, 43, "E-4", { version: 0 }),
      );
      expect((await booking(id)).expectedArrival).toBe("13:00");

      await reservations.amendBooking(
        DESK,
        sameNights(id, 41, 43, "E-4", { version: 1, expectedArrival: null }),
      );
      expect((await booking(id)).expectedArrival).toBeNull();
      expect(await revisions(id)).toEqual([
        { kind: "amended", fromTime: null, toTime: null },
        { kind: "arrival_time_changed", fromTime: "13:00", toTime: null },
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_nights_and_the_time_changed_together_are_two_revisions_in_one_save",
    async () => {
      const id = await book("E-5", 50, 52);
      const amended = await reservations.amendBooking(
        DESK,
        sameNights(id, 51, 54, "E-5", {
          version: 0,
          expectedArrival: "20:00",
        }),
      );

      expect(await booking(id)).toMatchObject({
        startsOn: plusDays(today, 51),
        endsOn: plusDays(today, 54),
        expectedArrival: "20:00",
      });
      expect(await revisions(id)).toEqual([
        { kind: "amended", fromTime: null, toTime: null },
        { kind: "arrival_time_changed", fromTime: null, toTime: "20:00" },
      ]);
      expect(amended.changeId).toBeTruthy();
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_save_whose_nights_are_refused_changes_neither_the_nights_nor_the_time",
    async () => {
      const id = await book("E-6", 60, 62, "10:00");
      const rival = await book("E-1", 60, 62);
      expect(rival).toBeTruthy();

      await expect(
        reservations.amendBooking(DESK, {
          ...sameNights(id, 60, 62, "E-6", {
            version: 0,
            expectedArrival: "22:00",
          }),
          accommodationUnitId: unit["E-1"]!,
        }),
      ).rejects.toBeInstanceOf(UnitUnavailableError);

      expect(await booking(id)).toMatchObject({
        unitId: unit["E-6"],
        expectedArrival: "10:00",
      });
      expect(await revisions(id)).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "saving_the_time_a_booking_already_has_changes_nothing_and_is_refused",
    async () => {
      const id = await book("E-2", 70, 72, "11:00");
      await expect(
        reservations.amendBooking(
          DESK,
          sameNights(id, 70, 72, "E-2", {
            version: 0,
            expectedArrival: "11:00",
          }),
        ),
      ).rejects.toBeInstanceOf(ReservationPeriodError);
      expect(await revisions(id)).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_time_saved_against_an_old_version_is_refused",
    async () => {
      const id = await book("E-3", 80, 82);
      await reservations.amendBooking(
        DESK,
        sameNights(id, 80, 82, "E-3", { version: 0, expectedArrival: "12:00" }),
      );
      await expect(
        reservations.amendBooking(
          DESK,
          sameNights(id, 80, 82, "E-3", {
            version: 0,
            expectedArrival: "13:00",
          }),
        ),
      ).rejects.toBeInstanceOf(BookingChangedError);
      expect((await booking(id)).expectedArrival).toBe("12:00");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_malformed_time_is_refused_before_the_booking_is_touched",
    async () => {
      const id = await book("E-4", 90, 92);
      await expect(
        reservations.amendBooking(
          DESK,
          sameNights(id, 90, 92, "E-4", {
            version: 0,
            expectedArrival: "24:00",
          }),
        ),
      ).rejects.toBeInstanceOf(ExpectedArrivalError);
      expect(await revisions(id)).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_desk_without_front_desk_amend_cannot_change_the_time",
    async () => {
      const id = await book("E-5", 100, 102, "08:00", BOOKER);
      await expect(
        reservations.amendBooking(
          BOOKER,
          sameNights(id, 100, 102, "E-5", {
            version: 0,
            expectedArrival: "23:00",
          }),
        ),
      ).rejects.toBeInstanceOf(BookingChangeError);
      expect((await booking(id)).expectedArrival).toBe("08:00");
      expect(await revisions(id)).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );
});
