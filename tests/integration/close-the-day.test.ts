/**
 * Closing a business day, against a real database (docs/features/close-the-day).
 *
 * The pgTAP suite proves the stamp, the policies and the guards. This proves the
 * module in front of them — that the checklist and the close agree about what
 * is open, that a close is audited and published in the same transaction, and
 * that the two races worth having are lost on the Property's lock rather than
 * by whichever application noticed first.
 *
 * Every Property here is new on every run. A close can never be deleted, so a
 * fixture reused across runs would already be closed the second time the suite
 * ran on the same day, and every assertion about "the day to close" would be
 * about a different day.
 *
 * Checked by breaking what each asserts, one at a time:
 *   - the Property's lock taken out of the stamp, and separately out of the
 *     Stay guard: all four races red each time — each second command is first
 *     required to be seen waiting on that lock, so a race that did not happen
 *     cannot pass;
 *   - the publish, the audit record and the unique-violation mapping each taken
 *     out of closeDay: the recorded-and-published and two-desks tests red;
 *   - the character count reverted to UTF-16 units: the reason test red;
 *   - the RZ001 mapping in checkIn and checkOut: the in-flight tests red.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  BusinessDayCloseError,
  CloseInputError,
  CloseReasonRequiredError,
  createBusinessDayModule,
  DayAlreadyClosedError,
} from "../../packages/ranza/business-day/src";
import {
  CheckInDayClosedError,
  CheckInError,
  CheckOutError,
  createReservationsModule,
  ReservationPeriodError,
} from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

// ranza_app, twice, so a race runs on two real connections rather than two
// promises queued on one.
const app = createPrismaClient(process.env.DATABASE_URL!);
const rival = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const days = createBusinessDayModule({ db: app });
const rivalDays = createBusinessDayModule({ db: rival });
const reservations = createReservationsModule({ db: app });
const rivalReservations = createReservationsModule({ db: rival });

const ORG = randomUUID();
const DESK = randomUUID();
const OTHER_DESK = randomUUID();
const HOUSEKEEPER = randomUUID();
const DESK_EMAIL = `close-desk-${DESK}@example.test`;
const GUEST = randomUUID();

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1,$3), ($2,$4), ($5,$6)`,
    DESK,
    OTHER_DESK,
    DESK_EMAIL,
    `close-other-${OTHER_DESK}@example.test`,
    HOUSEKEEPER,
    `close-housekeeper-${HOUSEKEEPER}@example.test`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Close the Day Organization', 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1, 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key)
     values ($1, 'front_office'), ($1, 'billing_folios')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'front_desk', 'organization_wide'),
            ($1, $3, 'front_desk', 'organization_wide'),
            ($1, $4, 'housekeeping', 'organization_wide')`,
    ORG,
    DESK,
    OTHER_DESK,
    HOUSEKEEPER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name)
     values ($1, $2, 'Close Guest')`,
    GUEST,
    ORG,
  );
});

afterAll(async () => {
  await Promise.all([
    app.$disconnect(),
    rival.$disconnect(),
    owner.$disconnect(),
  ]);
});

/** A Property of its own, with the front desk and billing on. */
async function aProperty(): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1::uuid, $2::uuid, 'Close Property ' || $1::text)`,
    id,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true), ($1, $2, 'finance', true)`,
    id,
    ORG,
  );
  return id;
}

async function aUnit(propertyId: string): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, 'CD-' || left($1::text, 8), 'room', 2)`,
    id,
    propertyId,
    ORG,
  );
  return id;
}

/**
 * A date relative to the Property's own today, as `YYYY-MM-DD`, computed by the
 * database in the Property's timezone rather than from this process's clock.
 */
async function day(propertyId: string, offset: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    offset,
  );
  return row!.day;
}

/** A booking, written by the owner with dates relative to the Property's today. */
async function aBooking(
  propertyId: string,
  unitId: string,
  status: "requested" | "confirmed",
  startsIn: number,
  endsIn: number,
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     values ($1, $2, $3, $4, $5, 'guest', $6,
             app.property_today($3::uuid) + $7::int,
             app.property_today($3::uuid) + $8::int)`,
    id,
    ORG,
    propertyId,
    unitId,
    GUEST,
    status,
    startsIn,
    endsIn,
  );
  return id;
}

/** A Stay in house that began without a Reservation. */
async function aStay(
  propertyId: string,
  unitId: string,
  startsIn: number,
  endsIn: number,
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id,
        stay_type, status, starts_on, ends_on)
     values ($1, $2, $3, $4, 'guest', 'in_house',
             app.property_today($3::uuid) + $5::int,
             app.property_today($3::uuid) + $6::int)`,
    id,
    ORG,
    propertyId,
    unitId,
    startsIn,
    endsIn,
  );
  return id;
}

/**
 * A booking already checked in, and its Stay, in one transaction: the pair is
 * checked when a transaction commits, and a checked-in booking with no Stay
 * behind it is refused on its own.
 */
async function aCheckIn(
  propertyId: string,
  unitId: string,
  startsIn: number,
  endsIn: number,
): Promise<{ booking: string; stay: string }> {
  const booking = randomUUID();
  const stay = randomUUID();
  await owner.$transaction([
    owner.$executeRawUnsafe(
      `insert into public.reservations
         (id, organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       values ($1, $2, $3, $4, $5, 'guest', 'checked_in',
               app.property_today($3::uuid) + $6::int,
               app.property_today($3::uuid) + $7::int)`,
      booking,
      ORG,
      propertyId,
      unitId,
      GUEST,
      startsIn,
      endsIn,
    ),
    owner.$executeRawUnsafe(
      `insert into public.stays
         (id, organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       values ($1, $2, $3, $4, $5, 'guest', 'in_house',
               app.property_today($3::uuid) + $6::int,
               app.property_today($3::uuid) + $7::int)`,
      stay,
      ORG,
      propertyId,
      unitId,
      booking,
      startsIn,
      endsIn,
    ),
  ]);
  return { booking, stay };
}

/**
 * Closes the clock could only have produced over a week, written in replica
 * mode so the stamp does not refuse them for being out of order.
 */
async function history(propertyId: string, daysAgo: number[]): Promise<void> {
  await owner.$transaction([
    owner.$executeRawUnsafe(`set local session_replication_role = replica`),
    owner.$executeRawUnsafe(
      `insert into public.business_day_closes
         (organization_id, property_id, business_date, closed_by_job)
       select $1::uuid, $2::uuid, app.property_today($2::uuid) - ago, 'test.fixture'
       from unnest($3::int[]) as ago`,
      ORG,
      propertyId,
      daysAgo,
    ),
  ]);
}

async function exceptionsOf(propertyId: string, businessDate: string) {
  const [row] = await owner.$queryRawUnsafe<
    {
      exceptions: { kind: string; reservationId?: string; stayId?: string }[];
    }[]
  >(
    `select exceptions from public.business_day_closes
      where property_id = $1::uuid and business_date = $2::date`,
    propertyId,
    businessDate,
  );
  return row?.exceptions ?? null;
}

/**
 * The bounds for an owner transaction held open across a race. Prisma's
 * five-second default expired under load while the second command was still
 * being watched, rolling the first back and releasing its lock before the race
 * had run. `withOrganizationContext` already sets bounds of its own.
 */
const HELD = { maxWait: 15_000, timeout: 60_000 };

/** A promise, and the function that settles it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * The first of two commands in a race, stopped after its writes and before it
 * commits.
 *
 * `transaction` runs the first command's writes and then calls `hold`, which
 * waits for `release`. The second command is started only once `written` has
 * resolved: a fixed sleep let it arrive after the first had committed under
 * load, and a race that did not happen passed for the wrong reason.
 */
function heldOpen(transaction: (hold: () => Promise<void>) => Promise<void>): {
  written: Promise<void>;
  release: () => void;
  committed: Promise<void>;
} {
  const written = gate();
  const released = gate();
  const committed = transaction(async () => {
    written.open();
    await released.opened;
  });
  // A first command that fails before it holds must fail the test, not hang it.
  return {
    written: Promise.race([written.opened, committed]),
    release: released.open,
    committed,
  };
}

/**
 * Until `command` is seen waiting on the Property's lock (advisory namespace 3)
 * — the proof that the race happened. A command that finishes without waiting
 * fails the test there and then: under load a fixed pause let the second
 * command arrive after the first had committed, and the race passed without
 * ever being run.
 */
async function untilWaitingOnTheDay(
  command: Promise<unknown>,
  propertyId: string,
): Promise<void> {
  const settled = command.then(
    () => "settled",
    () => "settled",
  );
  for (let poll = 0; poll < 400; poll += 1) {
    const [row] = await owner.$queryRawUnsafe<{ waiting: number }[]>(
      `select count(*)::int as waiting
         from pg_locks
        where locktype = 'advisory' and not granted
          and classid = 3 and objsubid = 2
          and objid = ((hashtext($1)::bigint + 4294967296) % 4294967296)::oid`,
      propertyId,
    );
    if ((row?.waiting ?? 0) > 0) return;
    const pause = new Promise((resolve) => setTimeout(resolve, 50, "waiting"));
    if ((await Promise.race([settled, pause])) === "settled") {
      throw new Error("it finished without waiting on the day's lock");
    }
  }
  throw new Error("it never reached the day's lock");
}

describe("the day to close", () => {
  it("offers yesterday at a Property that has never closed a day", async () => {
    const property = await aProperty();
    const view = await days.getCloseTheDay(DESK, property);
    expect(view?.dayToClose).toBe(await day(property, -1));
    expect(view?.waiting).toBe(1);
    expect(view?.mayClose).toBe(true);
  });

  it("a night shift prepares the day it cannot yet close", async () => {
    const property = await aProperty();
    // Due tonight and not here yet, and due out today and still in — written
    // before yesterday closes, or the Stay could not begin on a closed day.
    const tonight = await aBooking(
      property,
      await aUnit(property),
      "confirmed",
      0,
      2,
    );
    const leaving = await aStay(property, await aUnit(property), -2, 0);
    await days.closeDay(DESK, property, await day(property, -1), null);

    const view = await days.getCloseTheDay(DESK, property);
    expect(view?.dayToClose).toBeNull();
    expect(view?.waiting).toBe(0);
    expect(view?.checklistDay).toBe(await day(property, 0));
    expect(view?.cutoff).toBe("04:00");
    expect(view?.notArrived.map((row) => row.reservationId)).toEqual([tonight]);
    expect(view?.notDeparted.map((row) => row.stayId)).toEqual([leaving]);

    await expect(
      days.closeDay(DESK, property, await day(property, 0), null),
    ).rejects.toBeInstanceOf(BusinessDayCloseError);
  });

  it("a backlog is worked oldest first", async () => {
    const property = await aProperty();
    await history(property, [6, 5]);

    const before = await days.getCloseTheDay(DESK, property);
    expect(before?.dayToClose).toBe(await day(property, -4));
    expect(before?.waiting).toBe(4);

    await days.closeDay(DESK, property, await day(property, -4), null);

    const after = await days.getCloseTheDay(DESK, property);
    expect(after?.dayToClose).toBe(await day(property, -3));
    expect(after?.waiting).toBe(3);
  });

  it("recent closes say who closed them, or that it was automatic", async () => {
    const property = await aProperty();
    await history(property, [2]);
    await days.closeDay(DESK, property, await day(property, -1), null);

    const view = await days.getCloseTheDay(DESK, property);
    expect(
      view?.recent.map(({ businessDate, closedBy, automatic }) => ({
        businessDate,
        closedBy,
        automatic,
      })),
    ).toEqual([
      {
        businessDate: await day(property, -1),
        closedBy: DESK_EMAIL,
        automatic: false,
      },
      {
        businessDate: await day(property, -2),
        closedBy: null,
        automatic: true,
      },
    ]);
  });

  it("is shown to a viewer without close_day, who is not offered the close", async () => {
    const property = await aProperty();
    const view = await days.getCloseTheDay(HOUSEKEEPER, property);
    expect(view?.dayToClose).toBe(await day(property, -1));
    expect(view?.mayClose).toBe(false);
    await expect(
      days.closeDay(HOUSEKEEPER, property, view!.dayToClose!, null),
    ).rejects.toBeInstanceOf(BusinessDayCloseError);
  });

  it("measures a reason in characters, as the table does", async () => {
    const property = await aProperty();
    await aBooking(property, await aUnit(property), "confirmed", -1, 2);
    // Two characters and four UTF-16 units: long enough by .length, too short
    // by char_length, and answered as the reason it is.
    await expect(
      days.closeDay(
        DESK,
        property,
        await day(property, -1),
        "\u{1F600}\u{1F600}",
      ),
    ).rejects.toBeInstanceOf(CloseInputError);
  });

  it("is nothing at all for a Property the viewer cannot reach", async () => {
    const property = await aProperty();
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'front_desk'`,
      property,
    );
    expect(await days.getCloseTheDay(DESK, property)).toBeNull();
    await expect(
      days.closeDay(DESK, property, await day(property, -1), null),
    ).rejects.toBeInstanceOf(BusinessDayCloseError);
  });
});

describe("what is open", () => {
  it("what the screen lists open is what the close records", async () => {
    const property = await aProperty();
    const notArrived = await aBooking(
      property,
      await aUnit(property),
      "confirmed",
      -1,
      2,
    );
    const requested = await aBooking(
      property,
      await aUnit(property),
      "requested",
      -2,
      1,
    );
    const overstayed = await aStay(property, await aUnit(property), -3, -1);
    await aBooking(property, await aUnit(property), "confirmed", 1, 3);
    await aStay(property, await aUnit(property), -3, 0);

    const view = await days.getCloseTheDay(DESK, property);
    const listed = [
      ...view!.notArrived.map((row) => `not_arrived ${row.reservationId}`),
      ...view!.notDeparted.map((row) => `not_departed ${row.stayId}`),
    ].sort();
    expect(listed).toEqual(
      [
        `not_arrived ${notArrived}`,
        `not_arrived ${requested}`,
        `not_departed ${overstayed}`,
      ].sort(),
    );

    await expect(
      days.closeDay(DESK, property, view!.dayToClose!, null),
    ).rejects.toBeInstanceOf(CloseReasonRequiredError);
    await days.closeDay(
      DESK,
      property,
      view!.dayToClose!,
      "Guests called ahead",
    );

    const recorded = (await exceptionsOf(property, view!.dayToClose!))!
      .map((item) => `${item.kind} ${item.reservationId ?? item.stayId}`)
      .sort();
    expect(recorded).toEqual(listed);
  });

  it("a late arrival checks in after their day closed", async () => {
    const property = await aProperty();
    const unit = await aUnit(property);
    const booking = await aBooking(property, unit, "confirmed", -1, 2);
    const yesterday = await day(property, -1);

    await days.closeDay(DESK, property, yesterday, "Arriving late, rang ahead");
    const checkedIn = await reservations.checkIn(DESK, booking);

    const [stay] = await owner.$queryRawUnsafe<{ startsOn: string }[]>(
      `select to_char(starts_on, 'YYYY-MM-DD') as "startsOn"
         from public.stays where id = $1::uuid`,
      checkedIn.stayId,
    );
    expect(stay?.startsOn).toBe(await day(property, 0));
    expect(await exceptionsOf(property, yesterday)).toEqual([
      { kind: "not_arrived", reservationId: booking },
    ]);
  });

  it("nothing written after a close is dated on it", async () => {
    const property = await aProperty();
    const yesterday = await day(property, -1);
    await days.closeDay(DESK, property, yesterday, null);

    await expect(
      reservations.createReservation(DESK, {
        propertyId: property,
        accommodationUnitId: await aUnit(property),
        guestName: "Too Late",
        guestEmail: null,
        guestPhone: null,
        stayType: "guest",
        startsOn: yesterday,
        endsOn: await day(property, 1),
      }),
    ).rejects.toBeInstanceOf(ReservationPeriodError);
  });

  it("a close posts nothing to any Folio", async () => {
    const property = await aProperty();
    const stay = await aStay(property, await aUnit(property), -2, 2);
    await owner.$executeRawUnsafe(
      `with folio as (
         insert into public.folios (organization_id, property_id, stay_id, currency)
         values ($1, $2, $3, 'TRY') returning id
       )
       insert into public.folio_lines
         (organization_id, property_id, folio_id, line_type, description, amount_minor)
       select $1, $2, folio.id, 'charge', 'Minibar', 4500 from folio`,
      ORG,
      property,
      stay,
    );
    const lines = async () =>
      (
        await owner.$queryRawUnsafe<{ count: number }[]>(
          `select count(*)::int as count from public.folio_lines
            where property_id = $1::uuid`,
          property,
        )
      )[0]!.count;

    const before = await lines();
    await days.closeDay(DESK, property, await day(property, -1), null);
    expect(await lines()).toBe(before);
  });
});

describe("recorded and published", () => {
  it("a close is audited and published", async () => {
    const property = await aProperty();
    await aBooking(property, await aUnit(property), "confirmed", -1, 1);
    const yesterday = await day(property, -1);

    const { closeId } = await days.closeDay(
      DESK,
      property,
      yesterday,
      "Booking kept for tomorrow",
    );

    // Filed at the Property it happened at (ADR 0031): without it the record
    // is visible only to readers of the whole Organization, and an audit
    // record is never rewritten, so it would stay misfiled.
    expect(await latestRecord(owner, "business_day.closed", closeId)).toEqual({
      locationId: property,
      subjectId: closeId,
      reason: "Booking kept for tomorrow",
      context: { propertyId: property, businessDate: yesterday },
    });
    const [actor] = await owner.$queryRawUnsafe<{ actorId: string }[]>(
      `select actor_id as "actorId" from audit.records
        where action = 'business_day.closed' and subject_id = $1::uuid`,
      closeId,
    );
    expect(actor?.actorId).toBe(DESK);

    const [published] = await owner.$queryRawUnsafe<{ payload: unknown }[]>(
      `select payload from outbox.events
        where event_type = 'business_day.closed' and payload ->> 'closeId' = $1`,
      closeId,
    );
    expect(published?.payload).toEqual({
      closeId,
      propertyId: property,
      businessDate: yesterday,
    });
  });
});

/**
 * Today itself closed, in replica mode: a state the clock never produces, and
 * exactly what a check-in or check-out in flight meets when the day it read at
 * its start is closed before it commits.
 */
async function closedUnderfoot(propertyId: string): Promise<void> {
  await owner.$transaction([
    owner.$executeRawUnsafe(`set local session_replication_role = replica`),
    owner.$executeRawUnsafe(
      `insert into public.business_day_closes
         (organization_id, property_id, business_date, closed_by_job)
       values ($1::uuid, $2::uuid, app.property_today($2::uuid), 'test.fixture')`,
      ORG,
      propertyId,
    ),
  ]);
}

describe("a command in flight when its day closes", () => {
  it("a check-in whose day closes under it is refused as a check-in", async () => {
    const property = await aProperty();
    const booking = await aBooking(
      property,
      await aUnit(property),
      "confirmed",
      0,
      2,
    );
    await closedUnderfoot(property);

    const refused = reservations.checkIn(DESK, booking);
    await expect(refused).rejects.toBeInstanceOf(CheckInError);
    await expect(refused).rejects.toThrow(/closed during the check-in/);
  });

  it("a check-out whose day closes under it is refused as a check-out", async () => {
    const property = await aProperty();
    const stay = await aStay(property, await aUnit(property), -2, 0);
    await closedUnderfoot(property);

    const refused = reservations.checkOut(DESK, stay, {
      folioVersion: null,
      earlyDeparture: false,
      balanceReason: null,
    });
    await expect(refused).rejects.toBeInstanceOf(CheckOutError);
    await expect(refused).rejects.toThrow(/closed during the check-out/);
  });
});

describe("two people at once", () => {
  it("two desks closing one day make one close", async () => {
    const property = await aProperty();
    const yesterday = await day(property, -1);

    const results = await Promise.allSettled([
      days.closeDay(DESK, property, yesterday, null),
      rivalDays.closeDay(OTHER_DESK, property, yesterday, null),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [lost] = results.filter((r) => r.status === "rejected");
    expect((lost as PromiseRejectedResult).reason).toBeInstanceOf(
      DayAlreadyClosedError,
    );
  });

  /**
   * A check-in or check-out that began before the cutoff and commits after it.
   * The clock cannot be moved here, so the Stay is written by the owner, on the
   * day being closed, in a transaction held open — which is all an in-flight
   * check-in is to the trigger.
   */
  it("a Stay written as its day closes is counted: the Stay first", async () => {
    const property = await aProperty();
    const unit = await aUnit(property);
    const yesterday = await day(property, -1);

    const writing = heldOpen((hold) =>
      owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `insert into public.stays
             (organization_id, property_id, accommodation_unit_id, stay_type,
              status, starts_on, ends_on)
           values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
                   $4::date, $4::date + 3)`,
          ORG,
          property,
          unit,
          yesterday,
        );
        await hold();
      }, HELD),
    );
    await writing.written;
    const closing = days.closeDay(DESK, property, yesterday, null);
    await untilWaitingOnTheDay(closing, property);
    writing.release();

    await writing.committed;
    await closing;
    const [counted] = await owner.$queryRawUnsafe<{ arrived: number }[]>(
      `select arrived from public.business_day_closes
        where property_id = $1::uuid and business_date = $2::date`,
      property,
      yesterday,
    );
    expect(counted?.arrived).toBe(1);
  });

  it("a Stay written as its day closes is refused: the close first", async () => {
    const property = await aProperty();
    const unit = await aUnit(property);
    const yesterday = await day(property, -1);

    const closing = heldOpen((hold) =>
      withOrganizationContext(app, { userId: DESK }, async (tx) => {
        await tx.$executeRawUnsafe(
          `insert into public.business_day_closes
             (organization_id, property_id, business_date)
           values ($1::uuid, $2::uuid, $3::date)`,
          ORG,
          property,
          yesterday,
        );
        await hold();
      }),
    );
    await closing.written;
    const writing = owner.$executeRawUnsafe(
      `insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, 'guest', 'in_house',
               $4::date, $4::date + 3)`,
      ORG,
      property,
      unit,
      yesterday,
    );
    await untilWaitingOnTheDay(writing, property);
    closing.release();

    await closing.committed;
    await expect(writing).rejects.toThrow(/RZ001|is closed at this Property/);
  });

  it("a close and a withdrawal of its day do not interleave: the close first", async () => {
    const property = await aProperty();
    const { stay } = await aCheckIn(property, await aUnit(property), -1, 2);
    const yesterday = await day(property, -1);

    const closing = heldOpen((hold) =>
      withOrganizationContext(app, { userId: DESK }, async (tx) => {
        await tx.$executeRawUnsafe(
          `insert into public.business_day_closes
             (organization_id, property_id, business_date)
           values ($1::uuid, $2::uuid, $3::date)`,
          ORG,
          property,
          yesterday,
        );
        await hold();
      }),
    );
    await closing.written;
    // Started while the close holds the Property's lock and has not committed.
    // Without the lock it would find no close, withdraw, and leave a closed day
    // counting an arrival that was taken back.
    const withdrawing = rivalReservations.reverseCheckIn(
      OTHER_DESK,
      stay,
      "Checked into the wrong room",
    );
    await untilWaitingOnTheDay(withdrawing, property);
    closing.release();

    await closing.committed;
    await expect(withdrawing).rejects.toBeInstanceOf(CheckInDayClosedError);
  });

  it("a close and a withdrawal of its day do not interleave: the withdrawal first", async () => {
    const property = await aProperty();
    const { booking, stay } = await aCheckIn(
      property,
      await aUnit(property),
      -1,
      2,
    );
    const yesterday = await day(property, -1);

    const withdrawing = heldOpen((hold) =>
      withOrganizationContext(rival, { userId: OTHER_DESK }, async (tx) => {
        await tx.$executeRawUnsafe(
          `update public.stays set status = 'cancelled', updated_at = now()
            where id = $1::uuid`,
          stay,
        );
        await tx.$executeRawUnsafe(
          `update public.reservations set status = 'confirmed', updated_at = now()
            where id = $1::uuid`,
          booking,
        );
        await hold();
      }),
    );
    await withdrawing.written;
    // Waits on the Property's lock inside the stamp, then counts what the
    // withdrawal left: a booking nobody arrived for.
    const closing = days.closeDay(
      DESK,
      property,
      yesterday,
      "Withdrawn at night",
    );
    await untilWaitingOnTheDay(closing, property);
    withdrawing.release();

    await withdrawing.committed;
    await closing;
    expect(await exceptionsOf(property, yesterday)).toEqual([
      { kind: "not_arrived", reservationId: booking },
    ]);
  });
});
