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
import {
  closeEmptyFolioWithin,
  createFoliosModule,
} from "../../packages/ranza/folios/src";
import { createTranslator } from "next-intl";
import {
  CheckInReversalError,
  StayHasChargesError,
  createReservationsModule,
} from "../../packages/ranza/reservations/src";
import { supportedLocales } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
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
const RETURNED = randomUUID();
const GHOST = randomUUID();
const PRICED = randomUUID();
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
       ($4,$5,$6,$10,'room',2),
       ($11,$5,$6,$12,'room',2),
       ($13,$5,$6,$14,'room',2),
       ($15,$5,$6,$16,'room',2)
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
    RETURNED,
    unitName(RETURNED),
    GHOST,
    unitName(GHOST),
    PRICED,
    unitName(PRICED),
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

  /**
   * And what the front desk is told, which is the whole reason this refusal has
   * a type of its own.
   *
   * Two hops, and each is somewhere a real mistake has been made before. The
   * first is the `instanceof` the server action branches on: Prisma wraps
   * errors, and a wrapped one falls through to the generic answer — so it is
   * asserted against an error a real database raised through the real module,
   * not a hand-built one. The second is the catalogue, where a missing key
   * renders as its own name and a malformed plural throws on the screen that
   * reads it.
   *
   * `reverseCheckIn` in `src/server/front-office.ts` is not imported here. It
   * is a `"use server"` module that reaches `next/cache` and the composition
   * root, so importing it into a node test would need Next's request context
   * stubbed — and the stubbing would be most of what the test then proved. The
   * discrimination it makes is one expression, and it is made here against the
   * real error instead. `pnpm test:browser` presses the button and reads the
   * sentence off the screen, which is the hop this cannot reach.
   */
  it("is told apart from a refusal, and says money in three languages", async () => {
    const arrival = reservationId();
    await reserve(arrival, PRICED, "Priced Guest");
    const { stayId, folioId } = await reservations.checkIn(MEMBER, arrival);

    await folios.postCharge(MEMBER, {
      amountMinor: 9_000,
      description: "Laundry",
      folioId: folioId!,
    });

    const refusal = await reservations
      .reverseCheckIn(MEMBER, stayId, REASON)
      .then(
        () => null,
        (error: unknown) => error,
      );

    // What the action does with it, and the answer it must not give: every
    // other failure on this path is `refused`, and this one is not.
    const outcome =
      refusal instanceof StayHasChargesError ? "charges" : "refused";
    expect(outcome).toBe("charges");

    for (const locale of supportedLocales) {
      const t = createTranslator({
        locale,
        messages: messages[locale] as never,
        // Otherwise a malformed message returns its own key and every
        // assertion below passes on the name of a string nobody can read.
        onError: (error) => {
          throw error;
        },
      });

      const said = t("stayHasCharges");
      expect(said).not.toBe(t("undoCheckInRefused"));
      // Not the key, which is what next-intl returns for one that is missing.
      expect(said).not.toContain("stayHasCharges");
      expect(said.length).toBeGreaterThan(20);
    }
  });
});

describe("a withdrawal is a correction, not a one-way door", () => {
  /**
   * ADR 0022's own mechanism: a withdrawn check-in returns the Reservation to
   * `confirmed` precisely so the Guest can arrive again — the front desk checked
   * in the wrong one of two people, and the right one is still standing there.
   *
   * The unique index on `(reservation_id, property_id, organization_id)` is not
   * partial on status, so the cancelled Stay keeps holding the Reservation and
   * the second check-in collides with it. The ADR describes a door that is
   * one-way in the database. Issue #34.
   */
  it("a reversed Reservation can be checked in again", async () => {
    const arrival = reservationId();
    await reserve(arrival, RETURNED, "Returning Guest");
    const { stayId } = await reservations.checkIn(MEMBER, arrival);

    await reservations.reverseCheckIn(MEMBER, stayId, REASON);
    expect(await statuses(arrival, stayId)).toEqual({
      reservation: "confirmed",
      stay: "cancelled",
    });

    const again = await reservations.checkIn(MEMBER, arrival);

    // A second Stay, and the withdrawn one still there to show the mistake.
    expect(again.stayId).not.toBe(stayId);
    expect(await statuses(arrival, again.stayId)).toEqual({
      reservation: "checked_in",
      stay: "in_house",
    });
    const [withdrawn] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.stays where id = $1::uuid`,
      stayId,
    );
    expect(withdrawn?.status).toBe("cancelled");
  });
});

describe("the Folio of a check-in that was withdrawn", () => {
  /**
   * A withdrawn Stay's Folio was left open and empty. Nothing could ever be
   * posted to it — `folio_lines_postable` refuses a cancelled Stay — so it was
   * not a way to lose money; it was a row on the Finance screen that no one
   * could act on and no one could close, for a Guest who was never there.
   *
   * With the second check-in now possible (issue #34), one Reservation produced
   * two open Folios, which is the same ghost twice.
   */
  it("is closed, so the Reservation is left with exactly one open Folio", async () => {
    const arrival = reservationId();
    await reserve(arrival, GHOST, "Ghost Guest");
    const first = await reservations.checkIn(MEMBER, arrival);
    expect(first.folioId).not.toBeNull();

    await reservations.reverseCheckIn(MEMBER, first.stayId, REASON);
    const second = await reservations.checkIn(MEMBER, arrival);
    expect(second.folioId).not.toBeNull();

    const all = await owner.$queryRawUnsafe<
      { id: string; status: string; stayId: string }[]
    >(
      `select folio.id, folio.status, folio.stay_id as "stayId"
         from public.folios as folio
         join public.stays as stay on stay.id = folio.stay_id
        where stay.reservation_id = $1::uuid
        order by folio.created_at`,
      arrival,
    );

    // Both Folios are still there — a Folio is never deleted, like the Stay it
    // belongs to. What matters is that only the live one is open.
    expect(all).toHaveLength(2);
    expect(all.filter((folio) => folio.status === "open")).toEqual([
      expect.objectContaining({ id: second.folioId, stayId: second.stayId }),
    ]);
    expect(all.find((folio) => folio.stayId === first.stayId)?.status).toBe(
      "closed",
    );
  });
});

/** Thrown to unwind the transaction below; never escapes the test. */
class Rollback extends Error {}

describe("closing the Folio of a withdrawn Stay", () => {
  /**
   * The name says `Empty`, and the name has to be load-bearing: this function
   * takes no per-Stay lock and reads no balance, so if it ever met a Folio with
   * money on it, closing it would be silent and wrong.
   *
   * The state is unreachable through the application — `folio_lines_postable`
   * refuses a line on a cancelled Stay and `stays_withdrawal_is_free_of_charges`
   * refuses to cancel a Stay carrying one — so it is built here with the trigger
   * off, inside a transaction that is rolled back. Databases older than those
   * rules can still hold it, which is why the backfill guards for it too.
   */
  it("leaves one carrying a line exactly as it was", async () => {
    const unitId = randomUUID();
    const stayId = randomUUID();
    const folioId = randomUUID();
    let closed: { folioId: string } | null = null;
    let statusAfter: string | undefined;

    await expect(
      owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "select app.set_request_context($1::uuid)",
          MEMBER,
        );
        await tx.$executeRawUnsafe(
          `alter table public.folio_lines disable trigger folio_lines_postable`,
        );
        await tx.$executeRawUnsafe(
          `insert into public.accommodation_units
             (id, property_id, organization_id, name, unit_type, capacity)
           values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2)`,
          unitId,
          PROPERTY,
          ORG,
          unitName(unitId),
        );
        await tx.$executeRawUnsafe(
          `insert into public.stays
             (id, organization_id, property_id, accommodation_unit_id,
              stay_type, status, starts_on, ends_on)
           select $1::uuid, $3::uuid, $2::uuid, $4::uuid, 'guest', 'cancelled',
                  (now() at time zone property.timezone)::date,
                  (now() at time zone property.timezone)::date + 2
             from public.properties as property where property.id = $2::uuid`,
          stayId,
          PROPERTY,
          ORG,
          unitId,
        );
        await tx.$executeRawUnsafe(
          `insert into public.folios
             (id, organization_id, property_id, stay_id, currency)
           values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'TRY')`,
          folioId,
          ORG,
          PROPERTY,
          stayId,
        );
        await tx.$executeRawUnsafe(
          `insert into public.folio_lines
             (organization_id, property_id, folio_id, line_type, description, amount_minor)
           values ($1::uuid, $2::uuid, $3::uuid, 'charge', 'Older than the rules', 6400)`,
          ORG,
          PROPERTY,
          folioId,
        );

        closed = await closeEmptyFolioWithin(tx, stayId);

        const [row] = await tx.$queryRawUnsafe<{ status: string }[]>(
          `select status from public.folios where id = $1::uuid`,
          folioId,
        );
        statusAfter = row?.status;

        throw new Rollback("nothing this test built is kept");
      }),
    ).rejects.toBeInstanceOf(Rollback);

    // Asserted out here, so a failure reads as what the function did rather
    // than as the rollback failing to be a rollback.
    expect(closed).toBeNull();
    expect(statusAfter).toBe("open");
  });
});
