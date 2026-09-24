/**
 * The room calendar's read, against a real database (RANZ-25).
 *
 * Each `it` names the edge-case row it proves, from
 * docs/features/room-calendar/edge-cases.csv. The arithmetic the read hands to
 * — lanes, counts, sorting — is proved again without a database in
 * tests/unit/room-calendar-build.test.ts; here it is the statement: which rows
 * come back, with which dates, to whom.
 *
 * Dates are relative to the Property's own today and computed by the database,
 * never by this process's clock (CLAUDE.md, "Fixtures for anything
 * date-shaped").
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createReservationsModule,
  FRONT_DESK_CAPABILITY,
} from "../../packages/ranza/reservations/src";
import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
} from "../../packages/ranza/reservations/src";

const ORG = "dc000002-0000-4000-8000-000000000001";
const OTHER_ORG = "dc000002-0000-4000-8000-000000000002";
const PROPERTY = "dc000003-0000-4000-8000-000000000001";
const SECOND = "dc000003-0000-4000-8000-000000000002";
const OTHER_PROPERTY = "dc000003-0000-4000-8000-000000000003";
const FAR_EAST = "dc000003-0000-4000-8000-000000000004";
const FAR_WEST = "dc000003-0000-4000-8000-000000000005";
const UNGATED = "dc000003-0000-4000-8000-000000000006";
const ROLLING = "dc000003-0000-4000-8000-000000000007";
const MEMBER = "dc000001-0000-4000-8000-000000000001";
const OUTSIDER = "dc000001-0000-4000-8000-000000000002";
const UNASSIGNED = "dc000001-0000-4000-8000-000000000003";
const RESIDENT = "dc000001-0000-4000-8000-000000000004";

// ranza_app, not an owner and without BYPASSRLS: the tenant path exactly as the
// host composes it. Pointed at DIRECT_URL every access test would pass for the
// wrong reason.
const prisma = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
// A second connection, so the concurrency test is two transactions and not two
// promises queued on one.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalReservations = createReservationsModule({ db: rival });

const owner = createPrismaClient(process.env.DIRECT_URL!);

// Room names are unique per Property. A run that died before its clean-up
// would otherwise make the next one fail on its first insert.
const RUN = randomUUID().slice(0, 6);

async function sql(statement: string, ...values: unknown[]): Promise<void> {
  await owner.$executeRawUnsafe(statement, ...values);
}

async function seed(): Promise<void> {
  await sql(
    `insert into public.users (id, email) values
       ($1,'calendar-member@example.test'),
       ($2,'calendar-outsider@example.test'),
       ($3,'calendar-unassigned@example.test'),
       ($4,'calendar-resident@example.test')
     on conflict (id) do nothing`,
    MEMBER,
    OUTSIDER,
    UNASSIGNED,
    RESIDENT,
  );
  await sql(
    `insert into public.organizations (id, name, status) values
       ($1,'Calendar Organization','active'), ($2,'Calendar Other','active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1,$8,'Calendar Property','Europe/Istanbul'),
       ($2,$8,'Calendar Second','Europe/Istanbul'),
       ($3,$9,'Calendar Other Property','Europe/Istanbul'),
       ($4,$8,'Calendar Kiritimati','Pacific/Kiritimati'),
       ($5,$8,'Calendar Pago Pago','Pacific/Pago_Pago'),
       ($6,$8,'Calendar Ungated','Europe/Istanbul'),
       ($7,$8,'Calendar Rolling','Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    SECOND,
    OTHER_PROPERTY,
    FAR_EAST,
    FAR_WEST,
    UNGATED,
    ROLLING,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'active')
     on conflict (organization_id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  await sql(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1,$3,'active'), ($2,$3,'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
    OTHER_ORG,
    FRONT_DESK_CAPABILITY.moduleKey,
  );
  await sql(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select property.id, property.organization_id, $2,
            property.id <> $3::uuid
       from public.properties as property
      where property.organization_id in ($1::uuid, $4::uuid)
     on conflict (property_id, capability_key) do nothing`,
    ORG,
    FRONT_DESK_CAPABILITY.capabilityKey,
    UNGATED,
    OTHER_ORG,
  );
  await sql(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$2,'manager','organization_wide'),
       ($3,$4,'manager','organization_wide'),
       ($1,$5,'manager','assigned_properties')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
    OTHER_ORG,
    OUTSIDER,
    UNASSIGNED,
  );
}

/** A date relative to a Property's own today, computed by the database. */
async function day(offset: number, propertyId = PROPERTY): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    offset,
  );
  return row!.day;
}

interface UnitOptions {
  propertyId?: string;
  parentId?: string;
  unitType?: "room" | "bed" | "suite";
  building?: string | null;
  floor?: number | null;
  status?: "available" | "blocked" | "out_of_service";
}

/** A Unit of the test's own, so no test borrows another's nights. */
async function unit(name: string, options: UnitOptions = {}): Promise<string> {
  const id = randomUUID();
  const propertyId = options.propertyId ?? PROPERTY;
  const organizationId = propertyId === OTHER_PROPERTY ? OTHER_ORG : ORG;
  const unitType = options.unitType ?? (options.parentId ? "bed" : "room");
  const status = options.status ?? "available";
  await sql(
    `insert into public.accommodation_units
       (id, property_id, organization_id, parent_id, parent_unit_type, name,
        unit_type, capacity, building, floor, status, status_reason)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
             case when $4::uuid is null then null else 'room' end,
             $5, $6, case when $6 = 'bed' then 1 else 2 end, $7, $8::int, $9,
             case when $9 = 'blocked' then 'Leaking ceiling' end)`,
    id,
    propertyId,
    organizationId,
    options.parentId ?? null,
    `${name} ${RUN}`,
    unitType,
    options.building ?? null,
    options.floor ?? null,
    status,
  );
  return id;
}

/** A Reservation on a Unit, over nights counted from the Property's today. */
async function book(
  unitId: string,
  guestName: string,
  nights: { from: number; to: number | null },
  status: "requested" | "confirmed" | "cancelled" | "no_show" = "confirmed",
  propertyId = PROPERTY,
): Promise<string> {
  const id = randomUUID();
  await sql(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, $5) returning id
     )
     insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest', $8,
            app.property_today($3::uuid) + $6::int,
            case when $7::int is null then null
                 else app.property_today($3::uuid) + $7::int end
       from guest`,
    id,
    propertyId === OTHER_PROPERTY ? OTHER_ORG : ORG,
    propertyId,
    unitId,
    guestName,
    nights.from,
    nights.to,
    status,
  );
  return id;
}

/**
 * A Stay put straight into the table, for the states no command on main
 * reaches: a walk-in, an overdue Guest, a departure days ago.
 */
async function stayOn(
  unitId: string,
  nights: { from: number; to: number | null },
  status: "in_house" | "departed" | "cancelled" | "reserved",
  reservationId: string | null = null,
  userId: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await sql(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id,
        reservation_id, user_id, stay_type, status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
             'guest', $7,
             app.property_today($3::uuid) + $8::int,
             case when $9::int is null then null
                  else app.property_today($3::uuid) + $9::int end)`,
    id,
    ORG,
    PROPERTY,
    unitId,
    reservationId,
    userId,
    status,
    nights.from,
    nights.to,
  );
  return id;
}

async function calendar(
  window: { from?: string | null; days?: number | null } = {},
  propertyId = PROPERTY,
  userId = MEMBER,
): Promise<RoomCalendar> {
  return reservations.listRoomCalendar(userId, propertyId, {
    from: window.from ?? null,
    days: window.days ?? null,
  });
}

function everyUnit(units: readonly RoomCalendarUnit[]): RoomCalendarUnit[] {
  return units.flatMap((entry) => [entry, ...everyUnit(entry.beds)]);
}

function unitOf(found: RoomCalendar, unitId: string): RoomCalendarUnit {
  const entry = everyUnit(found.units).find((u) => u.unitId === unitId);
  if (!entry) throw new Error(`unit ${unitId} is not on the calendar`);
  return entry;
}

function barsOf(found: RoomCalendar, unitId: string): RoomCalendarBar[] {
  return unitOf(found, unitId).bars;
}

/**
 * Removes everything this suite made. Children first: every foreign key here
 * is ON DELETE RESTRICT. Folio lines are append-only, so the trigger that says
 * so is lifted for the clean-up and put back, as folios.test.ts does.
 *
 * Run before the suite as well as after it. Under load a clean-up can outlive
 * its hook's timeout, and the counts asserted below would then include the
 * last run's Units.
 */
async function clean(): Promise<void> {
  const orgs = `('${ORG}','${OTHER_ORG}')`;
  for (const statement of [
    `alter table public.folio_lines disable trigger folio_lines_append_only`,
    `delete from public.folio_lines where organization_id in ${orgs}`,
    `alter table public.folio_lines enable trigger folio_lines_append_only`,
    `delete from public.folios where organization_id in ${orgs}`,
    `delete from public.stays where organization_id in ${orgs}`,
    `delete from public.reservations where organization_id in ${orgs}`,
    `delete from public.property_capabilities where organization_id in ${orgs}`,
    `delete from public.property_assignments where organization_id in ${orgs}`,
    `delete from public.organization_memberships where organization_id in ${orgs}`,
    `delete from public.entitlements where organization_id in ${orgs}`,
    `delete from public.subscriptions where organization_id in ${orgs}`,
    `delete from outbox.events where organization_id in ${orgs}`,
    `delete from public.accommodation_units where organization_id in ${orgs} and parent_id is not null`,
    `delete from public.accommodation_units where organization_id in ${orgs}`,
    `delete from public.guests where organization_id in ${orgs}`,
    `delete from public.properties where organization_id in ${orgs}`,
    `delete from public.organizations where id in ${orgs}`,
    `delete from public.users where id in ('${MEMBER}','${OUTSIDER}','${UNASSIGNED}','${RESIDENT}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
}

const HOOK_TIMEOUT = 120_000;

beforeAll(async () => {
  await clean();
  await seed();
}, HOOK_TIMEOUT);

afterAll(async () => {
  await clean();
  await owner.$disconnect();
  await rival.$disconnect();
  await prisma.$disconnect();
}, HOOK_TIMEOUT);

describe("the window and the Property's day", () => {
  it("RC-S1-05: a request with no window starts three days before today and runs 14 days", async () => {
    await unit("Window-1");
    const found = await calendar();
    expect(found.today).toBe(await day(0));
    expect(found.from).toBe(await day(-3));
    expect(found.days).toBe(14);
    expect(found.nights.map((night) => night.day)).toEqual(
      await Promise.all(Array.from({ length: 14 }, (_, i) => day(i - 3))),
    );
  });

  it("RC-S1-06: only 7, 14 or 30 days are read", async () => {
    for (const days of [7, 14, 30]) {
      expect((await calendar({ days })).days).toBe(days);
    }
    for (const days of [0, -1, 365, 13]) {
      expect((await calendar({ days })).days).toBe(14);
    }
  });

  it("RC-S1-07: a start date that is not a date falls back to the default window", async () => {
    for (const from of [
      "2026-02-30",
      "yesterday",
      "",
      "2026-9-1",
      // Outside the years the date type and a window after them both hold.
      "0000-01-01",
      "9999-12-31",
    ]) {
      expect((await calendar({ from })).from).toBe(await day(-3));
    }
  });

  it("RC-S1-08: any start date is readable, five years back or ahead", async () => {
    const ahead = await day(5 * 365);
    const back = await day(-5 * 365);
    expect((await calendar({ from: ahead })).from).toBe(ahead);
    expect((await calendar({ from: back })).from).toBe(back);
  });

  it("RC-S1-03: the window is half-open at both edges", async () => {
    const from = await day(10);
    const endsOnFirst = await unit("Edge-A");
    const endsOnSecond = await unit("Edge-B");
    const startsOnLast = await unit("Edge-C");
    const startsAfter = await unit("Edge-D");
    await book(endsOnFirst, "Ends on the first day", { from: 8, to: 10 });
    await book(endsOnSecond, "Ends on the second day", { from: 8, to: 11 });
    await book(startsOnLast, "Starts on the last day", { from: 23, to: 25 });
    await book(startsAfter, "Starts after the window", { from: 24, to: 26 });

    const found = await calendar({ from });
    expect(barsOf(found, endsOnFirst)).toEqual([]);
    expect(barsOf(found, endsOnSecond)).toHaveLength(1);
    expect(barsOf(found, startsOnLast)).toHaveLength(1);
    expect(barsOf(found, startsAfter)).toEqual([]);
  });

  it("RC-S1-04: today is the Property's day in far timezones", async () => {
    // At every hour of the day one of UTC+14 and UTC−11 is on a different
    // calendar day from UTC, so a statement that asked the server what day it
    // is would fail one of these two whenever the suite runs.
    for (const propertyId of [FAR_EAST, FAR_WEST]) {
      await unit(`Far-${propertyId.slice(-1)}`, { propertyId });
      const found = await calendar({}, propertyId);
      expect(found.today).toBe(await day(0, propertyId));
      expect(found.from).toBe(await day(-3, propertyId));
    }
  });

  it("RC-S1-09: when the Property's day rolls, the next read moves today and overdue", async () => {
    // The day is made to roll by moving the Property across the date line
    // rather than by waiting for midnight: the read must ask
    // app.property_today on every call, which is what either way proves.
    await sql(
      `update public.properties set timezone = 'Pacific/Pago_Pago' where id = $1::uuid`,
      ROLLING,
    );
    const room = await unit("Rolling-1", { propertyId: ROLLING });
    const yesterdayThere = await day(0, ROLLING);
    await sql(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
               app.property_today($2::uuid) - 2, app.property_today($2::uuid))`,
      ORG,
      ROLLING,
      room,
    );
    const before = await calendar({}, ROLLING);
    expect(before.today).toBe(yesterdayThere);
    expect(barsOf(before, room)[0]?.overdue).toBe(false);

    await sql(
      `update public.properties set timezone = 'Pacific/Kiritimati' where id = $1::uuid`,
      ROLLING,
    );
    const after = await calendar({}, ROLLING);
    expect(after.today > before.today).toBe(true);
    // Past the planned departure the Guest is overdue, and the window with no
    // explicit start moved with today.
    expect(after.from > before.from).toBe(true);
    expect(barsOf(after, room)[0]?.overdue).toBe(true);
  });

  it("RC-DIFF-01: today follows app.property_today and nothing else", async () => {
    await unit("Business-date-1");
    const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
      `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as day`,
      PROPERTY,
    );
    expect((await calendar()).today).toBe(row!.day);
  });
});

describe("bars", () => {
  it("RC-S1-01: the calendar draws every Unit and its bars, beds beneath their room", async () => {
    const room = await unit("Draw-101", { building: "Main", floor: 1 });
    const bedA = await unit("A", { parentId: room });
    const bedB = await unit("B", { parentId: room });
    await book(bedA, "Bed A Guest", { from: 0, to: 2 });

    const found = await calendar();
    const entry = found.units.find((u) => u.unitId === room)!;
    expect(entry.sellable).toBe(false);
    expect(entry.beds.map((bed) => bed.unitId)).toEqual([bedA, bedB]);
    expect(entry.beds[0]!.bars.map((bar) => bar.guestName)).toEqual([
      "Bed A Guest",
    ]);
    expect(entry.bars).toEqual([]);
  });

  it("RC-S1-10: a confirmed Reservation draws its planned nights", async () => {
    const room = await unit("Confirmed-1");
    const id = await book(room, "Confirmed Guest", { from: 1, to: 4 });
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      kind: "reservation",
      reservationId: id,
      status: "confirmed",
      guestName: "Confirmed Guest",
      startsOn: await day(1),
      endsOn: await day(4),
      heldUntil: await day(4),
      holds: true,
      overdue: false,
    });
  });

  it("RC-S1-11: a requested Reservation is drawn and holds nothing", async () => {
    const room = await unit("Requested-1");
    const before = await calendar();
    await book(room, "Requested Guest", { from: 0, to: 2 }, "requested");
    const after = await calendar();
    expect(barsOf(after, room)[0]).toMatchObject({
      status: "requested",
      holds: false,
    });
    // The request takes no night: every night is as free as it was.
    expect(after.nights).toEqual(before.nights);
  });

  it("RC-S1-12: a checked-in Reservation is drawn once, as its Stay", async () => {
    const room = await unit("Checked-in-1");
    const id = await book(room, "Checked In Guest", { from: 0, to: 3 });
    const { stayId } = await reservations.checkIn(MEMBER, id);
    const bars = barsOf(await calendar(), room);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      kind: "stay",
      stayId,
      reservationId: id,
      status: "in_house",
      guestName: "Checked In Guest",
    });
  });

  it("RC-S1-13: a Stay's bar starts on the day of arrival and keeps the booked dates", async () => {
    const room = await unit("Late-1");
    const id = await book(room, "Late Guest", { from: -1, to: 3 });
    await reservations.checkIn(MEMBER, id);
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      kind: "stay",
      startsOn: await day(0),
      bookedStartsOn: await day(-1),
      bookedEndsOn: await day(3),
    });
  });

  it("RC-S1-14: a withdrawn check-in draws the Reservation again", async () => {
    const room = await unit("Withdrawn-1");
    const id = await book(room, "Withdrawn Guest", { from: 0, to: 2 });
    const { stayId } = await reservations.checkIn(MEMBER, id);
    await reservations.reverseCheckIn(MEMBER, stayId, "Wrong room");
    const bars = barsOf(await calendar(), room);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      kind: "reservation",
      reservationId: id,
      status: "confirmed",
    });
  });

  it("RC-S1-68: a withdrawn overdue check-in draws the Reservation again", async () => {
    const room = await unit("Withdrawn-overdue-1");
    const id = await book(room, "Overdue Withdrawn", { from: -3, to: -1 });
    await sql(
      `update public.reservations set status = 'checked_in' where id = $1::uuid`,
      id,
    );
    const stayId = await stayOn(room, { from: -3, to: -1 }, "in_house", id);
    await reservations.reverseCheckIn(MEMBER, stayId, "Never arrived");
    const bars = barsOf(await calendar(), room);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      kind: "reservation",
      startsOn: await day(-3),
      endsOn: await day(-1),
    });
  });

  it("RC-S1-15: an overdue Stay is drawn through tonight", async () => {
    const room = await unit("Overdue-1");
    await stayOn(room, { from: -4, to: -1 }, "in_house");
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      overdue: true,
      endsOn: await day(-1),
      heldUntil: await day(1),
    });
  });

  it("RC-S1-16: a Stay leaving today is not overdue and ends today", async () => {
    const room = await unit("Leaving-1");
    await stayOn(room, { from: -2, to: 0 }, "in_house");
    const [bar] = barsOf(await calendar(), room);
    // Ending today means tonight is not held: the room is free for the next
    // Guest once this one leaves.
    expect(bar).toMatchObject({
      overdue: false,
      endsOn: await day(0),
      heldUntil: await day(0),
    });
  });

  it("RC-S1-17: an open-ended Stay begun before the window runs past it", async () => {
    const room = await unit("Open-ended-1");
    await stayOn(room, { from: -40, to: null }, "in_house");
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      startsOn: await day(-40),
      endsOn: null,
      heldUntil: null,
      overdue: false,
    });
  });

  it("RC-S1-18: a departed Stay is drawn, muted by status, over the nights stayed", async () => {
    const room = await unit("Departed-1");
    await stayOn(room, { from: -3, to: -1 }, "departed");
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      kind: "stay",
      status: "departed",
      startsOn: await day(-3),
      heldUntil: await day(-1),
      holds: true,
    });
  });

  it("RC-S1-69: an overdue Stay checked out ends on the day it left", async () => {
    const room = await unit("Overdue-out-1");
    const id = await book(room, "Overdue Leaver", { from: -3, to: -1 });
    await sql(
      `update public.reservations set status = 'checked_in' where id = $1::uuid`,
      id,
    );
    const stayId = await stayOn(room, { from: -3, to: -1 }, "in_house", id);
    await reservations.checkOut(MEMBER, stayId);
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      status: "departed",
      endsOn: await day(0),
      heldUntil: await day(0),
      overdue: false,
    });
  });

  it("RC-S1-19: a same-day check-out draws nothing", async () => {
    const room = await unit("Same-day-1");
    await stayOn(room, { from: 0, to: 0 }, "departed");
    expect(barsOf(await calendar(), room)).toEqual([]);
  });

  it("RC-S1-20: an early check-out frees the later nights", async () => {
    const room = await unit("Early-1");
    const id = await book(room, "Early Leaver", { from: -2, to: 5 });
    await sql(
      `update public.reservations set status = 'checked_in' where id = $1::uuid`,
      id,
    );
    const stayId = await stayOn(room, { from: -2, to: 5 }, "in_house", id);
    const before = await calendar();
    await reservations.checkOut(MEMBER, stayId);
    const after = await calendar();
    expect(barsOf(after, room)[0]).toMatchObject({
      status: "departed",
      startsOn: await day(-2),
      heldUntil: await day(0),
    });
    // Tonight up to the planned departure is free again; the past is not.
    const today = await day(0);
    const plannedEnd = await day(5);
    after.nights.forEach((night, i) => {
      const freed = night.day >= today && night.day < plannedEnd ? 1 : 0;
      expect(night.free - before.nights[i]!.free).toBe(freed);
    });
  });

  it("RC-S1-21: cancelled and no-show are not drawn", async () => {
    const room = await unit("Cancelled-1");
    await book(room, "Cancelled Guest", { from: 0, to: 2 }, "cancelled");
    await book(room, "No Show Guest", { from: 3, to: 5 }, "no_show");
    await stayOn(room, { from: -2, to: 3 }, "cancelled");
    expect(barsOf(await calendar(), room)).toEqual([]);
  });

  it("RC-S1-22: a Stay with no Reservation is drawn without a Guest", async () => {
    const room = await unit("Walk-in-1");
    const stayId = await stayOn(room, { from: -1, to: 2 }, "in_house");
    const [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      kind: "stay",
      stayId,
      reservationId: null,
      guestName: null,
    });
  });

  it("RC-S1-23: a reserved Stay is not drawn", async () => {
    const room = await unit("Reserved-1");
    await stayOn(room, { from: 1, to: 3 }, "reserved");
    expect(barsOf(await calendar(), room)).toEqual([]);
  });
});

describe("nights, overlaps and blocks", () => {
  it("RC-S1-25: a booking made over an in-house Guest is shown as an overlap", async () => {
    const room = await unit("Gap-1");
    const first = await book(room, "In House Guest", { from: 0, to: 4 });
    await reservations.checkIn(MEMBER, first);
    // Through the product, not a fixture: the gap is reachable by a front
    // desk today, which is why the calendar must show it.
    await reservations.createReservation(MEMBER, {
      propertyId: PROPERTY,
      accommodationUnitId: room,
      guestName: "Promised Guest",
      guestEmail: null,
      guestPhone: null,
      stayType: "guest",
      startsOn: await day(2),
      endsOn: await day(5),
    });
    const found = await calendar();
    const bars = barsOf(found, room);
    expect(bars).toHaveLength(2);
    expect(bars.every((bar) => bar.overlaps)).toBe(true);
    expect(found.overlaps).toBeGreaterThanOrEqual(1);
  });

  it("RC-S1-26: an overdue Guest overlaps the booking arriving today", async () => {
    const room = await unit("Overdue-gap-1");
    await stayOn(room, { from: -3, to: -1 }, "in_house");
    await book(room, "Arriving Today", { from: 0, to: 2 });
    expect(barsOf(await calendar(), room).map((bar) => bar.overlaps)).toEqual([
      true,
      true,
    ]);
  });

  it("RC-S1-27: a changeover day is not an overlap", async () => {
    const room = await unit("Changeover-1");
    await book(room, "Leaving On Two", { from: 0, to: 2 });
    await book(room, "Arriving On Two", { from: 2, to: 4 });
    expect(barsOf(await calendar(), room).map((bar) => bar.overlaps)).toEqual([
      false,
      false,
    ]);
  });

  it("RC-S1-28: checking the Guest out, or cancelling the booking, clears the overlap", async () => {
    const byCheckOut = await unit("Cleared-1");
    const stayId = await stayOn(byCheckOut, { from: -2, to: 3 }, "in_house");
    await book(byCheckOut, "Overlapping Guest", { from: 1, to: 4 });
    expect(barsOf(await calendar(), byCheckOut)[0]?.overlaps).toBe(true);
    await reservations.checkOut(MEMBER, stayId);
    expect(
      barsOf(await calendar(), byCheckOut).some((bar) => bar.overlaps),
    ).toBe(false);

    const byCancel = await unit("Cleared-2");
    await stayOn(byCancel, { from: -2, to: 3 }, "in_house");
    const booking = await book(byCancel, "Cancelled Later", { from: 1, to: 4 });
    await sql(
      `update public.reservations set status = 'cancelled' where id = $1::uuid`,
      booking,
    );
    expect(barsOf(await calendar(), byCancel).some((bar) => bar.overlaps)).toBe(
      false,
    );
  });

  it("RC-S1-29: a requested clash is labelled, not counted", async () => {
    const room = await unit("Clash-1");
    await book(room, "Confirmed Holder", { from: 0, to: 3 });
    await book(room, "Hopeful Request", { from: 1, to: 2 }, "requested");
    const bars = barsOf(await calendar(), room);
    const requested = bars.find((bar) => bar.status === "requested")!;
    const confirmed = bars.find((bar) => bar.status === "confirmed")!;
    expect(requested.clashesWith).toBe("booking");
    expect(requested.overlaps).toBe(false);
    expect(confirmed.overlaps).toBe(false);
  });

  it("RC-S1-32: a block is drawn from today with its reason", async () => {
    const room = await unit("Blocked-1", { status: "blocked" });
    const found = await calendar();
    expect(unitOf(found, room)).toMatchObject({
      status: "blocked",
      statusReason: "Leaking ceiling",
    });
  });

  it("RC-S1-24: the nightly free count counts sellable Units and blocks only from today", async () => {
    const room = await unit("Free-room", { propertyId: SECOND });
    await unit("A", { propertyId: SECOND, parentId: room });
    const bedB = await unit("B", { propertyId: SECOND, parentId: room });
    await unit("Lone bed", { propertyId: SECOND, unitType: "bed" });
    await unit("Blocked room", { propertyId: SECOND, status: "blocked" });
    await sql(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
               app.property_today($2::uuid) - 1, app.property_today($2::uuid) + 1)`,
      ORG,
      SECOND,
      bedB,
    );
    const found = await calendar({}, SECOND);
    // Bed A, bed B, the lone bed and the blocked room — not the room with beds.
    expect(found.sellable).toBe(4);
    const free = Object.fromEntries(
      found.nights.map((night) => [night.day, night.free]),
    );
    // Yesterday: the block is not drawn on a past night; bed B was taken.
    expect(free[await day(-1, SECOND)]).toBe(3);
    // Tonight: bed B taken and the room blocked.
    expect(free[await day(0, SECOND)]).toBe(2);
    // Tomorrow: bed B's Guest has left; the block goes on.
    expect(free[await day(1, SECOND)]).toBe(3);
  });

  it("RC-S1-34: a booking on a blocked Unit is counted apart from overlaps", async () => {
    const room = await unit("Booked-blocked-1");
    await book(room, "Booked Before The Block", { from: 1, to: 3 });
    const overlapsBefore = (await calendar()).overlaps;
    const blockedBefore = (await calendar()).bookedWhileBlocked;
    await sql(
      `update public.accommodation_units
          set status = 'blocked', status_reason = 'Painting'
        where id = $1::uuid`,
      room,
    );
    const found = await calendar();
    expect(barsOf(found, room)[0]?.bookedWhileBlocked).toBe(true);
    expect(found.bookedWhileBlocked).toBe(blockedBefore + 1);
    expect(found.overlaps).toBe(overlapsBefore);
  });

  it("RC-S1-35 and RC-S1-33: unblocking frees the Unit and clears booked-while-blocked", async () => {
    const room = await unit("Unblocked-1", { status: "blocked" });
    await book(room, "Waiting Guest", { from: 1, to: 2 });
    expect(barsOf(await calendar(), room)[0]?.bookedWhileBlocked).toBe(true);
    await sql(
      `update public.accommodation_units
          set status = 'available', status_reason = null
        where id = $1::uuid`,
      room,
    );
    const found = await calendar();
    expect(unitOf(found, room).status).toBe("available");
    expect(barsOf(found, room)[0]?.bookedWhileBlocked).toBe(false);
  });

  it("RC-S1-36: an out-of-service Unit is drawn like a block", async () => {
    const room = await unit("Out-of-service-1", { status: "out_of_service" });
    await book(room, "Held Anyway", { from: 1, to: 2 });
    const found = await calendar();
    expect(unitOf(found, room).status).toBe("out_of_service");
    expect(barsOf(found, room)[0]?.bookedWhileBlocked).toBe(true);
  });

  it("RC-S1-37: a bed with no room is its own row", async () => {
    const bed = await unit("Dorm bed 7", { unitType: "bed" });
    const found = await calendar();
    const entry = found.units.find((u) => u.unitId === bed);
    expect(entry).toMatchObject({ unitType: "bed", sellable: true, beds: [] });
  });
});

describe("the Folio in the drawer", () => {
  it("RC-S1-48: a Stay shows its Folio balance, and says when the Folio is closed", async () => {
    const room = await unit("Balance-1");
    const stayId = await stayOn(room, { from: -1, to: 2 }, "in_house");
    const [folio] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `insert into public.folios (organization_id, property_id, stay_id, currency)
       values ($1::uuid, $2::uuid, $3::uuid, 'TRY') returning id`,
      ORG,
      PROPERTY,
      stayId,
    );
    await sql(
      `insert into public.folio_lines
         (organization_id, property_id, folio_id, line_type, description, amount_minor)
       values ($1::uuid, $2::uuid, $3::uuid, 'charge', 'Room night', 125000),
              ($1::uuid, $2::uuid, $3::uuid, 'charge', 'Minibar', 4550)`,
      ORG,
      PROPERTY,
      folio!.id,
    );
    let [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({
      kind: "stay",
      balance: { balanceMinor: 129550, currency: "TRY", closed: false },
    });

    await sql(
      `update public.folios set status = 'closed', closed_at = now() where id = $1::uuid`,
      folio!.id,
    );
    [bar] = barsOf(await calendar(), room);
    expect(bar).toMatchObject({ balance: { closed: true } });
  });

  it("RC-S1-49: a booking, or a Stay without a Folio, shows no balance", async () => {
    const booked = await unit("No-balance-1");
    await book(booked, "Not Yet Arrived", { from: 1, to: 2 });
    const walkIn = await unit("No-balance-2");
    await stayOn(walkIn, { from: -1, to: 2 }, "in_house");
    const found = await calendar();
    expect(barsOf(found, booked)[0]).not.toHaveProperty("balance");
    expect(barsOf(found, walkIn)[0]).toMatchObject({ balance: null });
  });
});

describe("rows", () => {
  it("RC-S1-38: rooms sort by number, not by text", async () => {
    const ids = {
      ten: await unit("10", { propertyId: FAR_WEST, floor: 7 }),
      two: await unit("2", { propertyId: FAR_WEST, floor: 7 }),
      hundred: await unit("101", { propertyId: FAR_WEST, floor: 7 }),
    };
    const found = await calendar({}, FAR_WEST);
    const order = found.units.filter((u) => u.floor === 7).map((u) => u.unitId);
    expect(order).toEqual([ids.two, ids.ten, ids.hundred]);
  });
});

describe("who reads it", () => {
  it("RC-S1-42: a Property out of reach reads as empty", async () => {
    await unit("Reach-1");
    const found = await calendar({}, PROPERTY, UNASSIGNED);
    expect(found.units).toEqual([]);
    expect(found.sellable).toBe(0);
  });

  it("RC-S1-43: without front_desk the calendar reads as empty", async () => {
    await unit("Ungated-1", { propertyId: UNGATED });
    expect((await calendar({}, UNGATED)).units).toEqual([]);
  });

  it("RC-S1-44: another Organization's Property reads as empty", async () => {
    await unit("Other-1", { propertyId: OTHER_PROPERTY });
    expect((await calendar({}, OTHER_PROPERTY)).units).toEqual([]);
    expect((await calendar({}, PROPERTY, OUTSIDER)).units).toEqual([]);
  });

  it("RC-S1-45: one Property never returns another's Units", async () => {
    const here = await unit("Here-1");
    const there = await unit("There-1", { propertyId: SECOND });
    const ids = everyUnit((await calendar()).units).map((u) => u.unitId);
    expect(ids).toContain(here);
    expect(ids).not.toContain(there);
  });

  it("RC-S1-46: a Resident reads no calendar, not even their own Unit", async () => {
    const room = await unit("Resident-1");
    await stayOn(room, { from: -1, to: 20 }, "in_house", null, RESIDENT);
    expect((await calendar({}, PROPERTY, RESIDENT)).units).toEqual([]);
  });
});

describe("concurrency", () => {
  it("RC-S1-02: a check-in during the read draws the Guest once", async () => {
    // Twenty rounds: one read racing one check-in each time. Whichever lands
    // first, the Guest is one bar — confirmed before, in house after — and
    // never two and never none.
    //
    // A smoke check, not the proof. What guarantees it is that the read is one
    // statement (listRoomCalendar in module.ts): a statement sees one snapshot
    // even at READ COMMITTED. A two-statement version was not written to
    // sabotage this, because hitting the window between two statements from a
    // test is luck, and a red that depends on luck proves nothing either way.
    for (let round = 0; round < 20; round++) {
      const room = await unit(`Race-${round}`);
      const id = await book(room, `Racing Guest ${round}`, { from: 0, to: 2 });
      const [found] = await Promise.all([
        calendar(),
        rivalReservations.checkIn(MEMBER, id),
      ]);
      expect(barsOf(found, room)).toHaveLength(1);
    }
    // Twenty rounds of four statements each: a budget of its own, because the
    // default five seconds is a ceiling for one read, not for twenty races.
  }, 60_000);
});
