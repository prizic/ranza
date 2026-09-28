/**
 * Changing a booking against a real database (ADR 0039,
 * docs/features/amend-booking, slice 1).
 *
 * tests/database/amend_booking.test.sql proves the command one statement at a
 * time. This proves what one transaction cannot: two desks changing one booking
 * at once, two bookings swapping rooms at once, and the preview agreeing with
 * what saving then does. It also proves the module's own part — the quote, the
 * event and the audit record.
 *
 * Each run makes a Property of its own, so nothing here depends on a previous
 * run's bookings.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  BookingChangedError,
  BookingChangeError,
  ChangeNoteError,
  PriceChangedError,
  ReservationPeriodError,
  UnitHasOccupantError,
  UnitNotInServiceError,
  UnitUnavailableError,
  createReservationsModule,
  type ChangePreview,
} from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

const ORG = "a7100002-0000-4000-8000-000000000001";
const DESK = "a7100001-0000-4000-8000-000000000001";
const CHECK_IN_ONLY = "a7100001-0000-4000-8000-000000000002";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
// A second Staff connection, for the races: one client would serialise them.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalReservations = createReservationsModule({ db: rival });
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

async function seed() {
  property = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'amend-desk@example.test'), ($2, 'amend-check-in@example.test')
     on conflict (id) do nothing`,
    DESK,
    CHECK_IN_ONLY,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Amend Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, currency)
     values ($1, $2, 'Amend Property', 'TRY')`,
    property,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1, 'amend_check_in_only', $1, 'Check-in only', array['front_desk.check_in'])
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
     values ($1, $2, 'amend_check_in_only', $1, 'organization_wide')
     on conflict do nothing`,
    ORG,
    CHECK_IN_ONLY,
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
  // Rooms 1-4, a suite, a room out of order, and a room let by the bed.
  const units = await owner.$queryRawUnsafe<{ id: string; name: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, status)
     values ($1, $2, 'A-1', 'room', 2, 'available'),
            ($1, $2, 'A-2', 'room', 2, 'available'),
            ($1, $2, 'A-3', 'room', 2, 'available'),
            ($1, $2, 'A-4', 'room', 2, 'available'),
            ($1, $2, 'A-S', 'suite', 4, 'available'),
            ($1, $2, 'A-X', 'room', 2, 'out_of_service'),
            ($1, $2, 'A-B', 'room', 2, 'available')
     returning id, name`,
    property,
    ORG,
  );
  for (const row of units) unit[row.name] = row.id;
  const [bed] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, parent_id, parent_unit_type, name,
        unit_type, capacity)
     values ($1, $2, $3, 'room', 'A-B-1', 'bed', 1)
     returning id`,
    property,
    ORG,
    unit["A-B"],
  );
  unit["A-B-1"] = bed!.id;
  await owner.$executeRawUnsafe(
    `insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor)
     values ($1, $2, 'room', 150000), ($1, $2, 'suite', 300000)`,
    ORG,
    property,
  );
  const [day] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today`,
    property,
  );
  today = day!.today;
  // Somebody in house in A-4 until three days from now.
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on)
     values ($1, $2, $3, 'guest', 'in_house', $4::date - 1, $4::date + 3)`,
    ORG,
    property,
    unit["A-4"],
    today,
  );
}

/** A room booking at the list price, taken as the desk takes one. */
async function book(unitName: string, from: number, to: number) {
  const created = await reservations.createReservation(DESK, {
    propertyId: property,
    accommodationUnitId: unit[unitName]!,
    guestName: "Amend Guest",
    guestEmail: null,
    guestPhone: null,
    stayType: "guest",
    startsOn: plusDays(today, from),
    endsOn: plusDays(today, to),
    quotedRateMinor: unitName === "A-S" ? 300000 : 150000,
    quotedCurrency: "TRY",
  });
  return created.reservationId;
}

async function booking(reservationId: string) {
  const rows = await reservations.listReservations(DESK, property);
  const row = rows.find((r) => r.reservationId === reservationId);
  if (!row) throw new Error("the booking should be listed");
  return row;
}

function option(preview: ChangePreview, unitName: string) {
  const found = preview.options.find((o) => o.unitId === unit[unitName]);
  if (!found) throw new Error(`${unitName} should be offered`);
  return found;
}

async function amendTo(
  reservationId: string,
  unitName: string,
  from: number,
  to: number,
  client = reservations,
) {
  const preview = await client.previewChange(
    DESK,
    reservationId,
    plusDays(today, from),
    plusDays(today, to),
  );
  const target = option(preview, unitName);
  return client.amendBooking(DESK, {
    reservationId,
    startsOn: plusDays(today, from),
    endsOn: plusDays(today, to),
    accommodationUnitId: unit[unitName]!,
    version: preview.version,
    quotedRateMinor: target.nightlyRateMinor,
    quotedCurrency: target.rateCurrency,
    note: null,
  });
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await rival.$disconnect();
  await owner.$disconnect();
});

describe("changing a booking", () => {
  it(
    "a_booking_is_moved_to_other_nights",
    async () => {
      const id = await book("A-1", 5, 8);
      const before = await booking(id);
      const amended = await reservations.amendBooking(DESK, {
        reservationId: id,
        startsOn: plusDays(today, 6),
        endsOn: plusDays(today, 9),
        accommodationUnitId: unit["A-1"]!,
        version: 0,
        quotedRateMinor: 150000,
        quotedCurrency: "TRY",
        note: "  The Guest asked  ",
      });
      expect(amended.nightlyRateMinor).toBe(150000);

      const after = await booking(id);
      expect(after).toMatchObject({
        reference: before.reference,
        guestId: before.guestId,
        startsOn: plusDays(today, 6),
        endsOn: plusDays(today, 9),
        nightlyRateMinor: 150000,
        mayAmend: true,
      });

      const record = await latestRecord(owner, "reservation.amended", id);
      expect(record?.reason).toBe("The Guest asked");
      expect(record?.context).toMatchObject({
        changeId: amended.changeId,
        fromStartsOn: plusDays(today, 5),
        toStartsOn: plusDays(today, 6),
        fromEndsOn: plusDays(today, 8),
        toEndsOn: plusDays(today, 9),
        fromUnitId: unit["A-1"],
        toUnitId: unit["A-1"],
        fromAmountMinor: 150000,
        amountMinor: 150000,
      });

      const [event] = await owner.$queryRawUnsafe<{ payload: unknown }[]>(
        `select payload from outbox.events
          where event_type = 'reservation.amended'
            and payload->>'changeId' = $1`,
        amended.changeId,
      );
      expect(event?.payload).toEqual({
        reservationId: id,
        changeId: amended.changeId,
        propertyId: property,
        accommodationUnitId: unit["A-1"],
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_moved_to_another_kind_is_priced_for_it",
    async () => {
      const id = await book("A-2", 10, 12);
      const preview = await reservations.previewChange(
        DESK,
        id,
        plusDays(today, 10),
        plusDays(today, 12),
      );
      expect(option(preview, "A-S")).toMatchObject({
        sameKind: false,
        blocker: null,
        nightlyRateMinor: 300000,
      });

      // The suite's price moves while the dialog is open.
      await owner.$executeRawUnsafe(
        `update public.property_rates set amount_minor = 320000
          where property_id = $1 and unit_type = 'suite'`,
        property,
      );
      await expect(
        reservations.amendBooking(DESK, {
          reservationId: id,
          startsOn: plusDays(today, 10),
          endsOn: plusDays(today, 12),
          accommodationUnitId: unit["A-S"]!,
          version: preview.version,
          quotedRateMinor: 300000,
          quotedCurrency: "TRY",
          note: null,
        }),
      ).rejects.toBeInstanceOf(PriceChangedError);
      // Refused whole: still the room, still its price, and no revision.
      expect(await booking(id)).toMatchObject({
        unitId: unit["A-2"],
        nightlyRateMinor: 150000,
      });

      const moved = await amendTo(id, "A-S", 10, 12);
      expect(moved.nightlyRateMinor).toBe(320000);
      const [count] = await owner.$queryRawUnsafe<{ n: number }[]>(
        `select count(*)::int as n from public.reservation_changes
          where reservation_id = $1::uuid`,
        id,
      );
      expect(count?.n).toBe(1);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_change_dialog_previews_conflicts_and_price",
    async () => {
      // A-3 is taken by another booking on the nights asked for; A-4 has
      // somebody in house; A-X is out of order; A-B is let by the bed.
      const other = await book("A-3", 1, 3);
      const id = await book("A-1", 20, 21);
      const preview = await reservations.previewChange(
        DESK,
        id,
        plusDays(today, 1),
        plusDays(today, 2),
      );
      const otherReference = (await booking(other)).reference;

      expect(option(preview, "A-3")).toMatchObject({
        blocker: "booked",
        conflictReference: otherReference,
      });
      expect(option(preview, "A-4").blocker).toBe("occupied");
      expect(option(preview, "A-2").blocker).toBeNull();
      expect(option(preview, "A-B-1").blocker).toBeNull();
      const offered = preview.options.map((o) => o.unitId);
      expect(offered).not.toContain(unit["A-X"]);
      expect(offered).not.toContain(unit["A-B"]);
      // Free Units of its own kind come first, the taken last.
      const kinds = preview.options.map((o) => [
        o.blocker === null,
        o.sameKind,
      ]);
      expect(kinds.findIndex(([free]) => !free)).toBeGreaterThan(
        kinds.findLastIndex(([free, same]) => free && same),
      );

      // And saving does what the preview said, for every kind of answer.
      const save = (unitName: string, rate: number | null) =>
        reservations.amendBooking(DESK, {
          reservationId: id,
          startsOn: plusDays(today, 1),
          endsOn: plusDays(today, 2),
          accommodationUnitId: unit[unitName]!,
          version: preview.version,
          quotedRateMinor: rate,
          quotedCurrency: rate === null ? null : "TRY",
          note: null,
        });
      await expect(save("A-3", 150000)).rejects.toBeInstanceOf(
        UnitUnavailableError,
      );
      await expect(save("A-4", 150000)).rejects.toBeInstanceOf(
        UnitHasOccupantError,
      );
      await expect(save("A-X", 150000)).rejects.toBeInstanceOf(
        UnitNotInServiceError,
      );
      await expect(save("A-B", 150000)).rejects.toBeInstanceOf(
        UnitNotInServiceError,
      );
      await expect(save("A-2", 150000)).resolves.toMatchObject({
        nightlyRateMinor: 150000,
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_on_a_room_gone_out_of_order_can_still_change_its_dates",
    async () => {
      // A room of its own, booked, then taken out of order under the booking.
      const [room] = await owner.$queryRawUnsafe<{ id: string }[]>(
        `insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity)
         values ($1, $2, 'A-O', 'room', 2) returning id`,
        property,
        ORG,
      );
      unit["A-O"] = room!.id;
      const id = await book("A-O", 70, 72);
      await owner.$executeRawUnsafe(
        `update public.accommodation_units set status = 'out_of_service'
          where id = $1::uuid`,
        room!.id,
      );

      const preview = await reservations.previewChange(
        DESK,
        id,
        plusDays(today, 71),
        plusDays(today, 73),
      );
      // Listed, because it is the booking's own, and marked as taking none.
      expect(option(preview, "A-O")).toMatchObject({
        current: true,
        takesBookings: false,
        blocker: null,
      });
      // And the command agrees: its dates change there.
      await expect(amendTo(id, "A-O", 71, 73)).resolves.toMatchObject({
        nightlyRateMinor: 150000,
      });
      expect((await booking(id)).startsOn).toBe(plusDays(today, 71));
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_arrival_is_brought_forward_to_today",
    async () => {
      // A Guest at the desk a day before their booking: moved to today from
      // Reservations, then checked in as any arrival is (AB-S1-09).
      const [room] = await owner.$queryRawUnsafe<{ id: string }[]>(
        `insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity)
         values ($1, $2, 'A-E', 'room', 2) returning id`,
        property,
        ORG,
      );
      unit["A-E"] = room!.id;
      const id = await book("A-E", 1, 3);
      await expect(reservations.checkIn(DESK, id)).rejects.toThrow();

      await amendTo(id, "A-E", 0, 3);
      await expect(reservations.checkIn(DESK, id)).resolves.toMatchObject({
        stayId: expect.any(String),
      });
      expect((await booking(id)).status).toBe("checked_in");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_arrival_is_never_moved_into_the_past",
    async () => {
      const id = await book("A-2", 30, 31);
      const change = {
        reservationId: id,
        startsOn: plusDays(today, -1),
        endsOn: plusDays(today, 31),
        accommodationUnitId: unit["A-2"]!,
        version: 0,
        quotedRateMinor: 150000,
        quotedCurrency: "TRY",
        note: null,
      };
      await expect(
        reservations.amendBooking(DESK, change),
      ).rejects.toBeInstanceOf(ReservationPeriodError);
      await expect(
        reservations.amendBooking(DESK, { ...change, startsOn: "2026-02-31" }),
      ).rejects.toBeInstanceOf(ReservationPeriodError);
      await expect(
        reservations.amendBooking(DESK, {
          ...change,
          startsOn: plusDays(today, 30),
          note: "no",
        }),
      ).rejects.toBeInstanceOf(ChangeNoteError);
      // Characters, not UTF-16 units: two emoji are two, so still too short.
      await expect(
        reservations.amendBooking(DESK, {
          ...change,
          startsOn: plusDays(today, 30),
          note: "🙂🙂",
        }),
      ).rejects.toBeInstanceOf(ChangeNoteError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "without_front_desk_amend_nothing_changes",
    async () => {
      const id = await book("A-1", 40, 41);
      const rows = await reservations.listReservations(CHECK_IN_ONLY, property);
      expect(rows.find((r) => r.reservationId === id)?.mayAmend).toBe(false);
      await expect(
        reservations.amendBooking(CHECK_IN_ONLY, {
          reservationId: id,
          startsOn: plusDays(today, 41),
          endsOn: plusDays(today, 42),
          accommodationUnitId: unit["A-1"]!,
          version: 0,
          quotedRateMinor: 150000,
          quotedCurrency: "TRY",
          note: null,
        }),
      ).rejects.toBeInstanceOf(BookingChangeError);
      expect((await booking(id)).startsOn).toBe(plusDays(today, 40));
    },
    DATABASE_BUDGET_MS,
  );
});

describe("two desks at once", () => {
  it(
    "two_changes_to_one_booking_do_not_both_land",
    async () => {
      const id = await book("A-1", 50, 52);
      const change = (from: number, to: number) => ({
        reservationId: id,
        startsOn: plusDays(today, from),
        endsOn: plusDays(today, to),
        accommodationUnitId: unit["A-1"]!,
        version: 0,
        quotedRateMinor: 150000,
        quotedCurrency: "TRY",
        note: null,
      });
      const results = await Promise.allSettled([
        reservations.amendBooking(DESK, change(51, 53)),
        rivalReservations.amendBooking(DESK, change(55, 57)),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(BookingChangedError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "two_moves_between_two_rooms_do_not_deadlock",
    async () => {
      // Each round swaps two bookings between A-1 and A-2 over overlapping
      // nights, both at once. The Unit locks are taken in hashed order, so one
      // waits for the other rather than deadlock; then the constraint refuses
      // both, since each still overlaps the other where it stands — a swap
      // takes a third room. Without that order the two lock the rooms in
      // opposite orders and one is chosen as a deadlock victim.
      for (let round = 0; round < 6; round++) {
        const from = 60 + round * 3;
        const a = await book("A-1", from, from + 2);
        const b = await book("A-2", from, from + 2);
        const results = await Promise.allSettled([
          amendTo(a, "A-2", from + 1, from + 3),
          amendTo(b, "A-1", from + 1, from + 3, rivalReservations),
        ]);
        for (const settled of results) {
          expect(settled.status).toBe("rejected");
          const reason = (settled as PromiseRejectedResult).reason;
          expect(String(reason)).not.toMatch(/40P01|deadlock/i);
          expect(reason).toBeInstanceOf(UnitUnavailableError);
        }
      }
    },
    DATABASE_BUDGET_MS * 2,
  );
});
