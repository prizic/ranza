/**
 * Withdrawing a check-in that should not have happened.
 *
 * The pgTAP suite proves the two database rules: a Stay with a charge against it
 * cannot be withdrawn, and a withdrawn Stay's Folio accepts nothing further.
 * This proves what a module in front of them does — that the Stay and its
 * Reservation move together or not at all, that the Unit is free again
 * afterwards, and that the refusal a front desk can act on arrives as its own
 * type rather than as "you cannot".
 *
 * Each assertion was watched go red: the trigger dropped, the reservation update
 * removed, the audit record moved out of the transaction.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuditModule } from "../../packages/platform/audit/src";
import { createFoliosModule } from "../../packages/ranza/folios/src";
import {
  CheckInReversalError,
  StayHasChargesError,
  createReservationsModule,
} from "../../packages/ranza/reservations/src";
import { createPrismaClient } from "../../packages/db/src";

const ORG = "d7000002-0000-4000-8000-000000000001";
const PROPERTY = "d7000003-0000-4000-8000-000000000001";
const MEMBER = "d7000001-0000-4000-8000-000000000001";
/**
 * A fresh Unit per run — and a fresh name with it, because `(property_id,
 * name)` is unique — for the same reason `reservationId()` exists in
 * `front-office.test.ts`: the rows this suite leaves behind cannot be removed.
 * A Folio line is append-only — that is the point of it — and every foreign key
 * here is `ON DELETE RESTRICT`, so the charged Stay stays in house forever and a
 * fixed Unit id would be occupied on the second run. Fixed ids would be tidier
 * right up until the suite passed once and never again.
 */
const MISTAKE = randomUUID();
const CHARGED = randomUUID();
const CONTESTED = randomUUID();
const RACED = randomUUID();
const REASON = "checked in the wrong one of two Guests arriving together";

/** `(property_id, name)` is unique, so the name has to be per-run as well. */
const unitName = (id: string) => `RV-${id.slice(0, 8)}`;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
// A second client, so the race below runs on two real connections. On one they
// would queue and the race would never happen.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const reservations = createReservationsModule({ db: prisma });
const folios = createFoliosModule({ db: prisma });
const rivalReservations = createReservationsModule({ db: rival });
const audit = createAuditModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const reservationId = () => randomUUID();

/** A Reservation arriving today, dated by the Property rather than the runner. */
async function reserve(
  id: string,
  unitId: string,
  guestName: string,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id,
        guest_name, stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'guest', 'confirmed',
            (now() at time zone property.timezone)::date,
            (now() at time zone property.timezone)::date + 2
     from public.properties as property
     where property.id = $3::uuid`,
    id,
    ORG,
    PROPERTY,
    unitId,
    guestName,
  );
}

async function statuses(reservation: string, stay: string) {
  const [row] = await owner.$queryRawUnsafe<
    { reservation: string; stay: string }[]
  >(
    `select
       (select status from public.reservations where id = $1::uuid) as "reservation",
       (select status from public.stays where id = $2::uuid) as "stay"`,
    reservation,
    stay,
  );
  return row;
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1,'reversal@example.test')
     on conflict (id) do nothing`,
    MEMBER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values ($1,'Reversal Organization','active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1,$2,'Reversal Property','Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity) values
       ($1,$5,$6,$7,'room',2),
       ($2,$5,$6,$8,'room',2),
       ($3,$5,$6,$9,'room',2),
       ($4,$5,$6,$10,'room',2)
     on conflict (id) do nothing`,
    MISTAKE,
    CHARGED,
    CONTESTED,
    RACED,
    PROPERTY,
    ORG,
    unitName(MISTAKE),
    unitName(CHARGED),
    unitName(CONTESTED),
    unitName(RACED),
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1,'active')
     on conflict (organization_id) do nothing`,
    ORG,
  );
  // Both, because a withdrawal has to be refused once money exists and that
  // needs a Folio to post to.
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key) values
       ($1,'front_office'), ($1,'billing_folios')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$2,'front_desk',true), ($1,$2,'finance',true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values ($1,$2,'owner','organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MEMBER,
  );
});

afterAll(async () => {
  // Children first: every foreign key is ON DELETE RESTRICT, because operational
  // history is never silently removed. Folio lines cannot be removed at all —
  // that is the point of them — so the Folio that has one stays, and with it the
  // Stay, the Reservation and the Organization. Dropping the membership is what
  // puts them back out of reach.
  for (const statement of [
    `delete from outbox.events where organization_id = '${ORG}'`,
    `delete from public.organization_memberships where organization_id = '${ORG}'`,
    `delete from public.property_capabilities where organization_id = '${ORG}'`,
    `delete from public.entitlements where organization_id = '${ORG}'`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await Promise.all([
    prisma.$disconnect(),
    rival.$disconnect(),
    owner.$disconnect(),
  ]);
});

describe("withdrawing a check-in", () => {
  it("cancels the Stay, confirms the Reservation, and frees the Unit", async () => {
    const wrong = reservationId();
    await reserve(wrong, MISTAKE, "Wrong Guest");
    const { stayId } = await reservations.checkIn(MEMBER, wrong);

    await reservations.reverseCheckIn(MEMBER, stayId, REASON);

    // Cancelled, not deleted and not back to `reserved`: a Stay that was in
    // house and is now reserved is indistinguishable from one that never
    // happened, and the mistake would stop being observable.
    expect(await statuses(wrong, stayId)).toEqual({
      reservation: "confirmed",
      stay: "cancelled",
    });

    // And the Unit is lettable again — by the status leaving the exclusion
    // constraint's partial index, with the dates untouched.
    const second = reservationId();
    await reserve(second, MISTAKE, "Right Guest");
    await expect(reservations.checkIn(MEMBER, second)).resolves.toMatchObject({
      reservationId: second,
    });
  });

  it("records who did it and why, in the same transaction", async () => {
    const wrong = reservationId();
    await reserve(wrong, CONTESTED, "Recorded Guest");
    const { stayId } = await reservations.checkIn(MEMBER, wrong);

    await reservations.reverseCheckIn(MEMBER, stayId, REASON);

    const history = await audit.historyOf(MEMBER, "reservation", wrong);
    const withdrawal = history.find(
      (entry) => entry.action === "reservation.check_in_reversed",
    );
    expect(withdrawal?.actorId).toBe(MEMBER);
    // Blueprint 4.4: the caller decides which actions need a reason, and taking
    // back the record of somebody's arrival is one.
    expect(withdrawal?.reason).toBe(REASON);
    expect(withdrawal?.context).toMatchObject({ stayId });

    const events = await owner.$queryRawUnsafe<{ eventType: string }[]>(
      `select event_type as "eventType" from outbox.events
        where payload->>'stayId' = $1 order by occurred_at`,
      stayId,
    );
    // Both facts, in the order they happened. A consumer of the first that
    // never heard the second would act on an arrival that was taken back.
    expect(events.map((event) => event.eventType)).toEqual([
      "stay.checked_in",
      "stay.check_in_reversed",
    ]);
  });

  it("refuses a reason the audit record would not accept", async () => {
    const wrong = reservationId();
    await reserve(wrong, CONTESTED, "Unexplained Guest");
    const { stayId } = await reservations.checkIn(MEMBER, wrong);

    await expect(
      reservations.reverseCheckIn(MEMBER, stayId, "no"),
    ).rejects.toBeInstanceOf(CheckInReversalError);
    // Refused before anything moved, rather than after the Stay was already
    // withdrawn and the audit record failed behind it.
    expect((await statuses(wrong, stayId)).stay).toBe("in_house");

    await reservations.reverseCheckIn(MEMBER, stayId, REASON);
  });

  it("refuses a second withdrawal rather than reporting success", async () => {
    const wrong = reservationId();
    await reserve(wrong, CONTESTED, "Twice Guest");
    const { stayId } = await reservations.checkIn(MEMBER, wrong);

    await reservations.reverseCheckIn(MEMBER, stayId, REASON);
    await expect(
      reservations.reverseCheckIn(MEMBER, stayId, REASON),
    ).rejects.toBeInstanceOf(CheckInReversalError);
  });
});

describe("a withdrawal and a charge at the same moment", () => {
  // Write skew, and the reason this test is shaped the way it is.
  //
  // The withdrawal asks "are there charges?" and the posting asks "is the Stay
  // withdrawn?". Under READ COMMITTED neither transaction sees the other's
  // uncommitted work, so before the advisory lock both answered no, both
  // committed, and the result was a withdrawn Stay carrying money.
  //
  // Two calls started together do not reproduce it — they nearly always finish
  // one after the other. What reproduces it is holding the first transaction
  // open while the second runs its check, which is what this does: the charge
  // is written and its transaction parked, the withdrawal is attempted while
  // the charge is still uncommitted, and only then does the first commit.
  //
  // With the lock, the withdrawal waits and then sees the charge and refuses.
  // Without it, the withdrawal sails through. Confirmed both ways.
  it("never leaves a withdrawn Stay carrying a charge", async () => {
    const arrival = reservationId();
    await reserve(arrival, RACED, "Raced Guest");
    const { stayId, folioId } = await reservations.checkIn(MEMBER, arrival);

    let chargeIsInPlace: () => void;
    const charged = new Promise<void>((resolve) => {
      chargeIsInPlace = resolve;
    });

    // Held open deliberately. The delay is how long the withdrawal gets to run
    // its check against a database where the charge exists but has not been
    // committed — the window the whole bug lived in.
    const posting = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "select app.set_request_context($1::uuid)",
        MEMBER,
      );
      await tx.$executeRawUnsafe(
        `insert into public.folio_lines
           (organization_id, property_id, folio_id, line_type, description, amount_minor)
         select folio.organization_id, folio.property_id, folio.id, 'charge', 'Minibar', 4500
         from public.folios as folio where folio.id = $1::uuid`,
        folioId,
      );
      chargeIsInPlace();
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await charged;
    const withdrawal = rivalReservations
      .reverseCheckIn(MEMBER, stayId, REASON)
      .then(
        () => "withdrawn" as const,
        () => "refused" as const,
      );

    await posting;
    expect(await withdrawal).toBe("refused");

    const [row] = await owner.$queryRawUnsafe<
      { status: string; charges: number }[]
    >(
      `select stay.status,
              (select count(*) from public.folio_lines as line
                 join public.folios as folio on folio.id = line.folio_id
                where folio.stay_id = stay.id)::int as charges
         from public.stays as stay where stay.id = $1::uuid`,
      stayId,
    );
    // The state the rule exists to prevent: cancelled, with money on its Folio.
    expect(row).toEqual({ status: "in_house", charges: 1 });
  });
});

describe("once money exists it is no longer a slip", () => {
  it("refuses the withdrawal and leaves both rows exactly as they were", async () => {
    const arrival = reservationId();
    await reserve(arrival, CHARGED, "Charged Guest");
    const { stayId, folioId } = await reservations.checkIn(MEMBER, arrival);
    expect(folioId).not.toBeNull();

    await folios.postCharge(MEMBER, {
      amountMinor: 12_500,
      description: "Minibar",
      folioId: folioId!,
    });

    // Its own type, because it is the one refusal a front desk can act on: this
    // is a stay that happened, and correcting it is a credit or a refund.
    await expect(
      reservations.reverseCheckIn(MEMBER, stayId, REASON),
    ).rejects.toBeInstanceOf(StayHasChargesError);

    expect(await statuses(arrival, stayId)).toEqual({
      reservation: "checked_in",
      stay: "in_house",
    });
  });
});
