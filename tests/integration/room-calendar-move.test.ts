/**
 * Dragging a bar on the room calendar, end to end below the pointer (RANZ-25,
 * RC-S3-*).
 *
 * A drag is never a write path of its own: it proposes, the calendar says what
 * it already knows against the proposal, and saving is the Change booking,
 * Move Guest or Change departure server action calling the commands of
 * ADR 0039. So this runs the real chain against a real database — the calendar
 * read, the pure proposal, the preview the dialog reads, the form the dialog
 * submits, the server action, the command — and asks two things of it:
 *
 *   1. The calendar's own conflicts and the database's agree. Where the
 *      calendar says a move cannot go, the command refuses it; where it says
 *      nothing, the command accepts it. They are written twice (a TypeScript
 *      rule and a constraint) and only a test that runs both can say they match.
 *   2. A refusal the calendar could not know — somebody booked the room
 *      between the preview and the save — comes back as the outcome the dialog
 *      words, with nothing written.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { createReservationsModule } from "../../packages/ranza/reservations/src";
import type { RoomCalendar } from "../../packages/ranza/reservations/src";
import { barsByKey } from "../../apps/operator-workspace/src/features/room-calendar/layout";
import {
  conflictsOf,
  proposeMove,
  type DragMode,
  type MoveRequest,
} from "../../apps/operator-workspace/src/features/room-calendar/move";

const ORG = "a7500002-0000-4000-8000-000000000001";
const DESK = "a7500001-0000-4000-8000-000000000001";
const DATABASE_BUDGET_MS = 60_000;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

vi.mock("../../apps/operator-workspace/node_modules/next/cache", () => ({
  revalidatePath: () => undefined,
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({ userId: DESK }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ reservations }),
}));

const actions =
  await import("../../apps/operator-workspace/src/server/front-office");

let property: string;
let today: string;
const unit: Record<string, string> = {};

function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A room of a test's own, so no test books over another's nights. */
async function room(name: string): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     values ($1, $2, $3, 'room', 2)
     returning id`,
    property,
    ORG,
    name,
  );
  unit[name] = row!.id;
  return row!.id;
}

async function seed() {
  property = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1, 'drag-desk@example.test')
     on conflict (id) do nothing`,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Drag Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, currency)
     values ($1, $2, 'Drag Property', 'TRY')`,
    property,
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
       (property_id, organization_id, name, unit_type, capacity, status,
        status_reason)
     values ($1, $2, 'D-X', 'room', 2, 'out_of_service', null),
            ($1, $2, 'D-B', 'room', 2, 'available', null)
     returning id, name`,
    property,
    ORG,
  );
  for (const row of units) unit[row.name] = row.id;
  const [bed] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.accommodation_units
       (property_id, organization_id, parent_id, parent_unit_type, name,
        unit_type, capacity)
     values ($1, $2, $3, 'room', 'D-B-1', 'bed', 1)
     returning id`,
    property,
    ORG,
    unit["D-B"],
  );
  unit["D-B-1"] = bed!.id;
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

async function calendar(): Promise<RoomCalendar> {
  return reservations.listRoomCalendar(DESK, property, {
    from: null,
    days: 14,
  });
}

/** A room booking at the list price, taken as the desk takes one. */
async function book(
  unitName: string,
  from: number,
  to: number,
  guestName = "Drag Guest",
) {
  const created = await reservations.createReservation(DESK, {
    propertyId: property,
    accommodationUnitId: unit[unitName]!,
    guestName,
    guestEmail: null,
    guestPhone: null,
    stayType: "guest",
    startsOn: plusDays(today, from),
    endsOn: plusDays(today, to),
    quotedRateMinor: 150000,
    quotedCurrency: "TRY",
  });
  return created.reservationId;
}

/** A Guest in house from yesterday to `to` days on. */
async function inHouse(unitName: string, to: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ stay: string }[]>(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($1, 'Drag In House') returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1, $2, $3, guest.id, 'guest', 'checked_in',
              $4::date - 1, $4::date + $5::int
         from guest
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'guest', 'in_house', starts_on, ends_on
         from arrived
       returning id
     )
     select id as stay from stay`,
    ORG,
    property,
    unit[unitName],
    today,
    to,
  );
  return row!.stay;
}

function entryOf(found: RoomCalendar, key: string) {
  const entry = barsByKey(found).get(key);
  if (!entry) throw new Error(`${key} should be on the calendar`);
  return entry;
}

/**
 * What a drop would propose and what the calendar knows against it, taken from
 * a fresh read of the calendar, as the screen does.
 */
async function dropped(
  key: string,
  mode: DragMode,
  dayShift: number,
  toUnit: string,
): Promise<{ found: RoomCalendar; request: MoveRequest; known: string[] }> {
  const found = await calendar();
  const request = proposeMove(
    entryOf(found, key),
    mode,
    dayShift,
    unit[toUnit]!,
  );
  if (!request) throw new Error("the drag should propose something");
  return {
    found,
    request,
    known: conflictsOf(found, request).map((conflict) => conflict.kind),
  };
}

/** The form Change booking submits for a proposal, as the dialog fills it from its preview. */
async function bookingForm(
  request: Extract<MoveRequest, { kind: "booking" }>,
  version?: number,
): Promise<FormData> {
  const { target, entry } = request;
  const preview = await reservations.previewChange(
    DESK,
    entry.bar.reservationId,
    target.startsOn,
    target.endsOn,
  );
  const chosen = preview.options.find(
    (option) => option.unitId === target.unitId,
  );
  const form = new FormData();
  form.set("locale", "en");
  form.set("reservation", entry.bar.reservationId);
  form.set("version", String(version ?? preview.version));
  form.set("unit", target.unitId);
  form.set("startsOn", target.startsOn);
  form.set("endsOn", target.endsOn ?? "");
  form.set("quotedRateMinor", String(chosen?.nightlyRateMinor ?? ""));
  form.set("quotedCurrency", chosen?.rateCurrency ?? "");
  form.set("note", "");
  return form;
}

async function bookingRow(reservationId: string) {
  const [row] = await owner.$queryRawUnsafe<
    { unit: string; starts: string; ends: string }[]
  >(
    `select accommodation_unit_id as unit,
            to_char(starts_on, 'YYYY-MM-DD') as starts,
            to_char(ends_on, 'YYYY-MM-DD') as ends
       from public.reservations where id = $1::uuid`,
    reservationId,
  );
  return row!;
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("a booking dragged to another room", () => {
  it(
    "a_free_room_is_known_to_be_free_and_the_command_moves_the_booking",
    async () => {
      await room("m1-from");
      await room("m1-to");
      const id = await book("m1-from", 3, 5);
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        1,
        "m1-to",
      );
      expect(known).toEqual([]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");

      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).toBe("done");
      expect(await bookingRow(id)).toEqual({
        unit: unit["m1-to"],
        starts: plusDays(today, 4),
        ends: plusDays(today, 6),
      });
      // The calendar, read again, draws it in the new row.
      const after = entryOf(await calendar(), `reservation:${id}`);
      expect(after.unit.unitId).toBe(unit["m1-to"]);
      expect(after.bar.startsOn).toBe(plusDays(today, 4));
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_departure_day_is_free_for_an_arrival_in_the_calendar_and_in_the_command",
    async () => {
      await room("m2-from");
      await room("m2-to");
      await book("m2-to", 5, 7, "Leaves on the 7th");
      await book("m2-to", 9, 11, "Arrives on the 9th");
      const id = await book("m2-from", 7, 9);
      // Arrive the day the first leaves, leave the day the second arrives.
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        0,
        "m2-to",
      );
      expect(known).toEqual([]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");
      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).toBe("done");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_night_another_booking_holds_is_a_conflict_the_command_agrees_with",
    async () => {
      await room("m3-from");
      await room("m3-to");
      await book("m3-to", 3, 6, "Holds the room");
      const id = await book("m3-from", 6, 8);
      // Two days earlier: nights 4 and 5 are the holder's.
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        -2,
        "m3-to",
      );
      expect(known).toEqual(["booked"]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");

      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).toBe("unavailable");
      expect((await bookingRow(id)).unit).toBe(unit["m3-from"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_guest_in_house_is_a_conflict_the_command_agrees_with",
    async () => {
      await room("m4-from");
      await room("m4-to");
      await inHouse("m4-to", 3);
      const id = await book("m4-from", 1, 3);
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        0,
        "m4-to",
      );
      expect(known).toEqual(["occupied"]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");

      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).toBe("occupied");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_room_out_of_service_and_a_room_let_by_the_bed_are_conflicts_the_command_agrees_with",
    async () => {
      await room("m5-from");
      const id = await book("m5-from", 3, 5);
      for (const [target, kind] of [
        ["D-X", "outOfUse"],
        ["D-B", "notSellable"],
      ] as const) {
        const { request, known } = await dropped(
          `reservation:${id}`,
          "move",
          0,
          target,
        );
        expect(known).toEqual([kind]);
        if (request.kind !== "booking")
          throw new Error("a booking was dragged");
        expect(
          await actions.changeBooking("idle", await bookingForm(request)),
        ).toBe("notInService");
      }
      expect((await bookingRow(id)).unit).toBe(unit["m5-from"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "an_arrival_before_today_is_a_conflict_the_command_agrees_with",
    async () => {
      await room("m6-from");
      await room("m6-to");
      const id = await book("m6-from", 1, 3);
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        -3,
        "m6-to",
      );
      expect(known).toEqual(["past"]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");

      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).not.toBe("done");
      expect((await bookingRow(id)).unit).toBe(unit["m6-from"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_room_taken_after_the_preview_is_refused_by_the_command_and_nothing_is_written",
    async () => {
      await room("m7-from");
      await room("m7-to");
      const id = await book("m7-from", 7, 9);
      const { request, known } = await dropped(
        `reservation:${id}`,
        "move",
        0,
        "m7-to",
      );
      expect(known).toEqual([]);
      if (request.kind !== "booking") throw new Error("a booking was dragged");
      const form = await bookingForm(request);

      // Somebody else books it between the preview and the save.
      await book("m7-to", 7, 9, "Quicker");
      expect(await actions.changeBooking("idle", form)).toBe("unavailable");
      expect((await bookingRow(id)).unit).toBe(unit["m7-from"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_changed_after_the_calendar_was_read_is_refused_as_changed",
    async () => {
      await room("m8-from");
      await room("m8-to");
      const id = await book("m8-from", 4, 6);
      const { request } = await dropped(
        `reservation:${id}`,
        "move",
        1,
        "m8-to",
      );
      if (request.kind !== "booking") throw new Error("a booking was dragged");
      const stale = await bookingForm(request);

      // Another desk changes it first, so the version this one holds is stale.
      const other = await dropped(`reservation:${id}`, "move", 2, "m8-from");
      if (other.request.kind !== "booking") throw new Error("a booking");
      expect(
        await actions.changeBooking("idle", await bookingForm(other.request)),
      ).toBe("done");

      expect(await actions.changeBooking("idle", stale)).toBe("changed");
      expect(await bookingRow(id)).toMatchObject({
        unit: unit["m8-from"],
        starts: plusDays(today, 6),
      });
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a booking's end pulled", () => {
  it(
    "shortening_a_booking_is_known_to_be_free_and_the_command_agrees",
    async () => {
      await room("m9");
      const id = await book("m9", 5, 8);
      const found = await calendar();
      const request = proposeMove(
        entryOf(found, `reservation:${id}`),
        "resize",
        -1,
        unit["m9"]!,
      );
      expect(request).toMatchObject({
        kind: "booking",
        target: { endsOn: plusDays(today, 7) },
      });
      if (request?.kind !== "booking") return;
      expect(conflictsOf(found, request)).toEqual([]);
      expect(
        await actions.changeBooking("idle", await bookingForm(request)),
      ).toBe("done");
      expect((await bookingRow(id)).ends).toBe(plusDays(today, 7));
    },
    DATABASE_BUDGET_MS,
  );
});

describe("a Guest in house dragged", () => {
  async function moveForm(stayId: string, unitId: string): Promise<FormData> {
    const preview = await reservations.previewMove(DESK, stayId);
    const form = new FormData();
    form.set("locale", "en");
    form.set("stay", stayId);
    form.set("unit", unitId);
    form.set("reason", "upgrade");
    form.set("version", String(preview.version));
    form.set("note", "");
    return form;
  }

  async function departureForm(
    stayId: string,
    endsOn: string,
  ): Promise<FormData> {
    const preview = await reservations.previewDeparture(DESK, stayId, endsOn);
    const form = new FormData();
    form.set("locale", "en");
    form.set("stay", stayId);
    form.set("endsOn", endsOn);
    form.set("version", String(preview.version));
    form.set("note", "");
    return form;
  }

  async function stayUnit(stayId: string): Promise<string> {
    const [row] = await owner.$queryRawUnsafe<{ unit: string }[]>(
      `select accommodation_unit_id as unit from public.stays where id = $1::uuid`,
      stayId,
    );
    return row!.unit;
  }

  it(
    "a_free_room_is_known_to_be_free_and_the_command_moves_the_guest",
    async () => {
      await room("g1-from");
      await room("g1-to");
      const stayId = await inHouse("g1-from", 3);
      const { request, known } = await dropped(
        `stay:${stayId}`,
        "move",
        4,
        "g1-to",
      );
      expect(known).toEqual([]);
      if (request.kind !== "guest") throw new Error("a Guest was dragged");
      expect(request.unitId).toBe(unit["g1-to"]);

      expect(
        await actions.moveGuest("idle", await moveForm(stayId, request.unitId)),
      ).toBe("done");
      expect(await stayUnit(stayId)).toBe(unit["g1-to"]);
      expect(entryOf(await calendar(), `stay:${stayId}`).unit.unitId).toBe(
        unit["g1-to"],
      );
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_on_a_night_they_have_left_is_a_conflict_the_command_agrees_with",
    async () => {
      await room("g2-from");
      await room("g2-to");
      await book("g2-to", 2, 4, "Holds the room");
      const stayId = await inHouse("g2-from", 3);
      const { request, known } = await dropped(
        `stay:${stayId}`,
        "move",
        0,
        "g2-to",
      );
      expect(known).toEqual(["booked"]);
      if (request.kind !== "guest") throw new Error("a Guest was dragged");

      expect(
        await actions.moveGuest("idle", await moveForm(stayId, request.unitId)),
      ).not.toBe("done");
      expect(await stayUnit(stayId)).toBe(unit["g2-from"]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_that_begins_the_day_they_leave_is_not_a_conflict",
    async () => {
      await room("g3-from");
      await room("g3-to");
      await book("g3-to", 3, 5, "Arrives as they leave");
      const stayId = await inHouse("g3-from", 3);
      const { request, known } = await dropped(
        `stay:${stayId}`,
        "move",
        0,
        "g3-to",
      );
      expect(known).toEqual([]);
      if (request.kind !== "guest") throw new Error("a Guest was dragged");
      expect(
        await actions.moveGuest("idle", await moveForm(stayId, request.unitId)),
      ).toBe("done");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "pulling_the_end_is_known_to_be_free_or_not_and_the_command_agrees",
    async () => {
      await room("g4");
      const stayId = await inHouse("g4", 3);
      await book("g4", 5, 7, "Next");

      const extend = await dropped(`stay:${stayId}`, "resize", 2, "g4");
      expect(extend.known).toEqual([]);
      if (extend.request.kind !== "departure") throw new Error("a departure");
      expect(extend.request.endsOn).toBe(plusDays(today, 5));
      expect(
        await actions.changeDeparture(
          "idle",
          await departureForm(stayId, extend.request.endsOn!),
        ),
      ).toBe("done");

      // The next booking begins where they now leave; one more night is its.
      const further = await dropped(`stay:${stayId}`, "resize", 1, "g4");
      expect(further.known).toEqual(["booked"]);
      if (further.request.kind !== "departure") throw new Error("a departure");
      expect(
        await actions.changeDeparture(
          "idle",
          await departureForm(stayId, further.request.endsOn!),
        ),
      ).toBe("occupied");

      const shorter = await dropped(`stay:${stayId}`, "resize", -2, "g4");
      expect(shorter.known).toEqual([]);
      if (shorter.request.kind !== "departure") throw new Error("a departure");
      expect(
        await actions.changeDeparture(
          "idle",
          await departureForm(stayId, shorter.request.endsOn!),
        ),
      ).toBe("done");
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "leaving_today_is_known_to_be_a_check_out_and_the_command_agrees",
    async () => {
      await room("g5");
      const stayId = await inHouse("g5", 3);
      const { request, known } = await dropped(
        `stay:${stayId}`,
        "resize",
        -3,
        "g5",
      );
      expect(known).toEqual(["leavesToday"]);
      if (request.kind !== "departure") throw new Error("a departure");
      expect(
        await actions.changeDeparture(
          "idle",
          await departureForm(stayId, request.endsOn!),
        ),
      ).not.toBe("done");
    },
    DATABASE_BUDGET_MS,
  );
});
