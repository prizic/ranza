import { withOrganizationContext } from "@ranza/db";
import {
  closeEmptyFolioWithin,
  closeSettledFolioWithin,
  openFolioWithin,
} from "@ranza/folios";
import { identifyGuestWithin } from "@ranza/guests";
import { recordWithin } from "@ranza/platform-audit";
import { publishWithin } from "@ranza/platform-outbox";
import {
  closeStayWithin,
  openStayWithin,
  StayWriteError,
  withdrawStayWithin,
} from "@ranza/stays";
import {
  BALANCE_REASON,
  BalanceReasonError,
  CANCELLATION_REASON,
  CheckInError,
  CheckInReversalError,
  CheckOutError,
  EarlyDepartureError,
  FolioChangedError,
  FRONT_DESK_CAPABILITY,
  ReservationEndError,
  ReservationPeriodError,
  ReservationReasonError,
  ReservationRefusedError,
  REVERSAL_REASON,
  StayHasChargesError,
  UnitNotInServiceError,
  UnitHasOccupantError,
  UnitUnavailableError,
  type Arrival,
  type BookableUnit,
  type CheckedIn,
  type CheckedOut,
  type CheckInReversed,
  type CheckOutConfirmation,
  type CreatedReservation,
  type Departure,
  type DepartureView,
  type NewReservation,
  type ReservationEnded,
  type ReservationRow,
} from "./contracts";
import type { ReservationsDeps } from "./ports";

/**
 * Reservations and Front Office: the first operation in the product.
 *
 * Like every Ranza module this one owns no authorization logic. Blueprint 3.5
 * is decided by `app.can_use_capability()` and row-level security, in the
 * database, where an application defect cannot skip it — and here that applies
 * to writing as well as reading, which is new (ADR 0012). Nothing below asks
 * whether the actor may do this. The statements are simply run inside a request
 * context, and the policies answer.
 */

/** Postgres raises this when an exclusion constraint rejects a row. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Raised by `stays_one_in_house_per_unit` when a check-in would put a second
 * Guest in a Unit somebody is in. Read by code alone, and safe to: the only
 * other unique index on `stays` is one Stay per Reservation, and the check-in
 * that reaches the insert has just moved its Reservation out of `confirmed`, so
 * it cannot already have a Stay.
 */
const UNIQUE_VIOLATION = "23505";

/**
 * Raised by `app.unit_holds_one_occupancy`: a booking over nights somebody is
 * staying for, or a Stay over nights somebody else is booked for (ADR 0033).
 */
const UNIT_OCCUPIED = "55006";

/**
 * object_not_in_prerequisite_state. Raised by `stays_withdrawal_is_free_of_charges`
 * when a withdrawn Stay has money on it, and by `stays_unit_is_in_service` when
 * a Stay would start in a blocked Unit; the two never meet in one command.
 * Deliberately not 42501: a policy refusal is also 42501, and "money has been
 * posted" or "the room is blocked" is a different answer from "you cannot".
 */
const NOT_IN_PREREQUISITE_STATE = "55000";

/**
 * Whether a failure carries a particular SQLSTATE.
 *
 * Read from the code rather than from a constraint or trigger name, so renaming
 * either cannot silently turn a specific failure into a generic one.
 *
 * Prisma reports a raw-query failure as P2010 and carries the real code inside
 * `meta`, so that nested path is the first place to look. The message is checked
 * too, because the shape of `meta` is Prisma's private arrangement and has
 * already changed once — and the cost of being wrong is asymmetric. Missing the
 * code reports a specific, actionable refusal as an unexplained error; there is
 * no false positive, because nothing else in these transactions raises either
 * code.
 */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

/**
 * `YYYY-MM-DD`, or null when it is not a day that exists.
 *
 * The round trip is the point: `2026-02-31` matches the pattern and parses as
 * the 3rd of March, so a regular expression alone would accept a booking for a
 * week nobody asked for. Everything here stays a string — a calendar date is not
 * an instant, and turning one into a `Date` is how a booking moves by a day for
 * a reader west of the meridian.
 */
function calendarDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

interface MovedReservation {
  organizationId: string;
  propertyId: string;
  accommodationUnitId: string;
  stayType: string;
  /**
   * The Property's today, which is the date the Guest actually arrived.
   *
   * Not the Reservation's `starts_on`. Somebody arriving two days late began
   * their Stay today, and recording the planned date instead would hold the
   * Unit over two nights nobody slept in and bill them if anything ever
   * charges per night.
   */
  arrivedOn: Date;
  endsOn: Date | null;
}

export function createReservationsModule(deps: ReservationsDeps) {
  /**
   * The Reservations arriving today at one Property.
   *
   * "Today" is the Property's own day, not the reader's: a front desk in İzmir
   * and one in Dubai are working different dates at the same moment, and an
   * arrivals list computed in the server's timezone would be wrong for one of
   * them for several hours every day.
   *
   * Two kinds of row are on it, and they leave for different reasons. Today's
   * Reservations are the day's work, and they stay all day once checked in
   * rather than emptying the list as it goes. A late arrival — somebody who
   * should have come yesterday and has not — stays only while check-in would
   * still accept them, because letting them be checked in is the only thing
   * this screen does with them.
   *
   * Both bounds are needed. `= today` alone made every late arrival
   * unreachable from the one screen that exists to handle them; `<= today`
   * alone made the list every Reservation whose start date had ever passed —
   * every Guest ever checked in, and every booking that expired unused,
   * offering a button `checkIn` then refuses. The same shape as the departures
   * list, which shows the Guest who should have left on Tuesday and not the one
   * who left in March.
   *
   * A late arrival checked in today stays on the list for the rest of the day,
   * like today's own, because their Stay began today (ADR 0022): taking the
   * check-in back is done from this row.
   *
   * `canCheckIn` mirrors what `checkIn` and the Stay's triggers refuse — the
   * status, the dates, a blocked Unit, somebody still in the room — and
   * `checkInBlocker` says which, when the desk can act on it. The integration
   * suite presses the button on every kind of row and asserts the two agree;
   * they drifted apart once already, and a button that raises when pressed is
   * worse than one that is not offered.
   *
   * Cancelled and no-show Reservations are absent because they are not
   * arriving.
   *
   * Empty is the correct answer for a Property the viewer cannot reach, for one
   * whose Organization lost the Entitlement, and for a quiet day. Those are
   * different situations with deliberately identical answers.
   */
  async function listArrivals(
    userId: string,
    propertyId: string,
  ): Promise<Arrival[]> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          (Omit<Arrival, "balanceMinor"> & { balanceMinor: string })[]
        >`
        with arriving as (
          select
            reservation.*,
            guest.full_name                         as guest_name,
            unit.name                               as unit_name,
            unit.unit_type,
            unit.status                             as unit_status,
            room.name                               as room_name,
            stay.id                                 as stay_id,
            folio.id                                as folio_id,
            folio.currency                          as folio_currency,
            property.currency                       as property_currency,
            today.day                               as today,
            occupant.ends_on                        as occupant_ends_on,
            occupant.id is not null                 as occupied,
            reservation.starts_on <= today.day
              and (reservation.ends_on is null
                   or reservation.ends_on > today.day) as dated_for_today
          from public.reservations as reservation
          join public.properties as property
            on property.id = reservation.property_id
          -- An inner join: guest_id is NOT NULL and its composite foreign key
          -- proves the Guest is this Organization's.
          join public.guests as guest
            on guest.id = reservation.guest_id
          join public.accommodation_units as unit
            on unit.id = reservation.accommodation_unit_id
          left join public.accommodation_units as room
            on room.id = unit.parent_id
          -- At most one row joins: one Stay per Reservation is unique where
          -- the status is not cancelled.
          left join public.stays as stay
            on stay.reservation_id = reservation.id
           and stay.status = 'in_house'
          left join public.folios as folio
            on folio.stay_id = stay.id
           and folio.status = 'open'
          -- Somebody else in the room: at most one, because one in-house Stay
          -- per Unit is unique (ADR 0033).
          left join public.stays as occupant
            on occupant.accommodation_unit_id = reservation.accommodation_unit_id
           and occupant.status = 'in_house'
           and occupant.reservation_id is distinct from reservation.id
          -- Once, for the whole query, so the comparisons cannot disagree across
          -- a cutoff that fell between them.
          cross join (
            select app.property_today(${propertyId}::uuid) as day
          ) as today
          where reservation.property_id = ${propertyId}::uuid
            and reservation.status in ('requested', 'confirmed', 'checked_in')
            and (
              reservation.starts_on = today.day
              -- A Stay that began today is today's work whatever the
              -- Reservation planned (ADR 0022).
              or stay.starts_on = today.day
              or (
                reservation.status <> 'checked_in'
                and reservation.starts_on < today.day
                and (reservation.ends_on is null
                     or reservation.ends_on > today.day)
              )
            )
            and app.can_use_capability(
              reservation.property_id,
              ${FRONT_DESK_CAPABILITY.moduleKey},
              ${FRONT_DESK_CAPABILITY.capabilityKey}
            )
        )
        select
          id                                          as "reservationId",
          reference                                   as "reference",
          guest_name                                  as "guestName",
          stay_type                                   as "stayType",
          status                                      as "status",
          to_char(starts_on, 'YYYY-MM-DD')            as "startsOn",
          to_char(ends_on, 'YYYY-MM-DD')              as "endsOn",
          accommodation_unit_id                       as "unitId",
          unit_name                                   as "unitName",
          room_name                                   as "roomName",
          unit_type                                   as "unitType",
          unit_status                                 as "unitStatus",
          -- What checkIn's update and the Stay triggers refuse, in the order a
          -- desk would fix them. Every clause mirrors one of them: the status
          -- and the dates are the update's predicate, the Unit's status is
          -- stays_unit_is_in_service, the occupant is stays_one_in_house_per_unit.
          status = 'confirmed' and dated_for_today
            and unit_status not in ('blocked', 'out_of_service')
            and not occupied                          as "canCheckIn",
          case
            when status = 'requested'                 then 'not_confirmed'
            when status <> 'confirmed' or not dated_for_today then null
            when unit_status = 'blocked'              then 'unit_blocked'
            when unit_status = 'out_of_service'       then 'unit_out_of_service'
            when occupied                             then 'unit_occupied'
          end                                         as "checkInBlocker",
          case
            when not occupied               then null
            when occupant_ends_on is null   then 'open'
            when occupant_ends_on < today   then 'overdue'
            when occupant_ends_on = today   then 'today'
            else 'later'
          end                                         as "occupantLeaves",
          stay_id                                     as "stayId",
          folio_id                                    as "folioId",
          greatest(0, (today - starts_on))::int       as "daysLate",
          -- Text, as the Folio module reads it: a sum of bigints overflowed
          -- ::int on a large enough bill.
          coalesce(
            (select sum(line.amount_minor) from public.folio_lines as line
              where line.folio_id = arriving.folio_id),
            0
          )::text                                     as "balanceMinor",
          trim(coalesce(folio_currency, property_currency)) as "currency",
          app.has_organization_permission(
            organization_id, 'front_desk.check_in')   as "mayCheckIn",
          app.has_organization_permission(
            organization_id, 'front_desk.cancel')     as "mayCancel"
        from arriving
        order by coalesce(room_name, unit_name), unit_name, guest_name
      `,
    );
    return rows.map((row) => ({
      ...row,
      balanceMinor: Number(row.balanceMinor),
    }));
  }

  /**
   * Checks a Reservation in: it becomes a Stay, and the actor is recorded.
   *
   * Three writes in one transaction, so they share one fate. A Stay with no
   * Reservation behind it, a Reservation marked arrived with nobody in a room,
   * and an action with no audit record are each worse than the check-in simply
   * not happening, and each is what a second transaction here would eventually
   * produce.
   *
   * The order is deliberate. Moving the Reservation first takes a row lock on
   * it, and the `status = 'confirmed'` predicate is re-evaluated after any
   * concurrent transaction holding that lock commits — so two people pressing
   * the button at once produce one Stay and one refusal, without the
   * application comparing anything.
   *
   * Nothing here checks whether the actor is allowed to do this. The update
   * returns no row when they are not, because the policy filtered it, and the
   * insert is rejected by its own policy even if the update somehow did.
   *
   * The date conditions are not authorization and are here for a different
   * reason. A Reservation cannot be checked in before the day it starts, or on
   * or after the day it ends: without the first, a booking three weeks out
   * became an `in_house` Stay with future dates, and a second Guest could then
   * be checked into the same Unit tonight because the two ranges do not
   * overlap.
   *
   * `>` and not `>=` on the end date, which is the same bug at the other edge.
   * Somebody arriving on the day their booking ends has no night left, and the
   * Stay would be `[today, today)` — an empty daterange, which overlaps nothing,
   * so the exclusion constraint has no opinion and the Unit takes a second
   * Guest tonight. `stays_in_house_has_a_night` refuses the row for every role;
   * this is what turns that into a refusal rather than a constraint violation
   * to decode.
   * `stays_insert_front_desk` refuses the same row independently (see
   * 20260916001300_check_in_on_the_day); this predicate is what turns that
   * refusal into an empty result the front desk can be told about, rather than
   * a constraint violation to decode.
   */
  async function checkIn(
    userId: string,
    reservationId: string,
  ): Promise<CheckedIn> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The Unit's lock before the Reservation's row lock. The occupancy
      // trigger takes the same lock when the Stay is inserted below, and a
      // booking on this Unit takes it before it waits on anything; taking it
      // here first is what stops the two from each holding what the other
      // needs. A Reservation the viewer cannot see locks nothing.
      await tx.$queryRaw`
        select pg_advisory_xact_lock(2, hashtext(accommodation_unit_id::text))::text
        from public.reservations
        where id = ${reservationId}::uuid
      `;

      const moved = await tx.$queryRaw<MovedReservation[]>`
        update public.reservations
           set status = 'checked_in',
               updated_at = now()
         where id = ${reservationId}::uuid
           and status = 'confirmed'
           and starts_on <= app.property_today(property_id)
           and (ends_on is null or ends_on > app.property_today(property_id))
        returning
          organization_id                 as "organizationId",
          property_id                     as "propertyId",
          accommodation_unit_id           as "accommodationUnitId",
          stay_type                       as "stayType",
          app.property_today(property_id) as "arrivedOn",
          ends_on                         as "endsOn"
      `;

      const [reservation] = moved;
      if (!reservation) {
        // Out of reach, already checked in, cancelled, or never existed. One
        // message for all four: telling them apart would confirm that a
        // Reservation the caller cannot see is there.
        throw new CheckInError("that Reservation cannot be checked in");
      }

      // Every value comes from the row the update returned, never from the
      // caller. The composite foreign keys then prove what would otherwise be
      // an application promise: the Stay is in the same Property and
      // Organization as the Reservation it came from.
      //
      // The insert itself belongs to @ranza/stays, which owns that table. This
      // module supplies the facts and joins its transaction.
      let created: { stayId: string };
      try {
        created = await openStayWithin(tx, {
          accommodationUnitId: reservation.accommodationUnitId,
          endsOn: reservation.endsOn,
          organizationId: reservation.organizationId,
          propertyId: reservation.propertyId,
          reservationId,
          stayType: reservation.stayType as "guest" | "resident",
          startsOn: reservation.arrivedOn,
        });
      } catch (error: unknown) {
        // The exclusion constraint refused: another current Stay holds this Unit
        // over these nights. Worth its own type because it is the one failure
        // here a front desk can act on — the others are all "you cannot".
        if (raised(error, EXCLUSION_VIOLATION)) {
          throw new UnitUnavailableError(
            "that Accommodation Unit is occupied for those nights",
          );
        }
        // Somebody is in the room, whatever their dates say, or it is promised
        // to another booking tonight (ADR 0033). The desk checks them out or
        // puts this Guest elsewhere.
        if (raised(error, UNIQUE_VIOLATION) || raised(error, UNIT_OCCUPIED)) {
          throw new UnitHasOccupantError(
            "that Accommodation Unit has somebody in it",
          );
        }
        // Blocked or out of service, refused by stays_unit_is_in_service.
        if (raised(error, NOT_IN_PREREQUISITE_STATE)) {
          throw new UnitNotInServiceError(
            "that Accommodation Unit is not in service",
          );
        }
        throw error;
      }

      // The Folio the Stay will accrue against — blueprint 6.1 step 5, where
      // Billing creates or links one as part of turning a Reservation into a
      // Stay. It belongs to @ranza/folios, which owns that table; this module
      // supplies the Stay and joins its transaction.
      //
      // Null when the Property does not do billing, which is a state rather
      // than a failure. Front Office is gated on `front_desk` and Folios on
      // `finance`: an Organization that has not bought the second must still
      // be able to check somebody in, so this cannot be allowed to raise.
      const folio = await openFolioWithin(tx, created.stayId);

      // Published here rather than after the commit, which is the whole of
      // ADR 0017: a message sent for a check-in that rolled back, and a
      // check-in that committed with nothing recording that anybody should
      // hear about it, are the two halves of the same mistake. In the
      // transaction, they cannot happen.
      //
      // Ids only. The queue is the one table a single process reads across
      // every Organization, so a Guest's name has no business in it; a handler
      // that needs one reads it under this Organization's own context.
      await publishWithin(tx, {
        organizationId: reservation.organizationId,
        eventType: "stay.checked_in",
        payload: {
          stayId: created.stayId,
          reservationId,
          propertyId: reservation.propertyId,
          accommodationUnitId: reservation.accommodationUnitId,
          folioId: folio?.folioId ?? null,
        },
      });

      // Same transaction as the writes above, so an action that happened
      // without a record is not a state this can reach (blueprint 7.4). The
      // actor is named by the caller because this module knows who it is and
      // the audit module deliberately does not.
      await recordWithin(tx, {
        organizationId: reservation.organizationId,
        actorId: userId,
        action: "reservation.checked_in",
        subjectType: "reservation",
        subjectId: reservationId,
        context: {
          stayId: created.stayId,
          accommodationUnitId: reservation.accommodationUnitId,
          folioId: folio?.folioId ?? null,
        },
      });

      return {
        reservationId,
        stayId: created.stayId,
        folioId: folio?.folioId ?? null,
      };
    });
  }

  /**
   * Withdraws a check-in that should not have happened.
   *
   * Two rows move and they share one fate: the Stay becomes `cancelled`, which
   * frees the Unit because `stays_no_double_booking` is partial on status, and
   * the Reservation returns to `confirmed`, so it reappears on the arrivals list
   * where somebody will deal with it properly.
   *
   * Nothing is deleted and nothing is edited back to `reserved`. A Stay that was
   * in house and is now reserved is indistinguishable from one that was never
   * checked in, which would make the mistake unobservable and leave the audit
   * trail as the only evidence it happened (ADR 0022). Cancelled says what
   * occurred: somebody checked in, and it was withdrawn.
   *
   * The Stay first, so the row lock is taken on the thing being withdrawn and
   * the `status = 'in_house'` predicate is re-evaluated after any concurrent
   * transaction holding it commits — two people pressing the button produce one
   * withdrawal and one refusal.
   *
   * Nothing here asks whether the actor may do this, and nothing here looks for
   * charges. `stays_withdrawal_is_free_of_charges` does, from a `security
   * definer` function, because a Staff Member with `front_desk` and without
   * `finance` cannot see a folio line and a check written here would conclude
   * there were none.
   */
  async function reverseCheckIn(
    userId: string,
    stayId: string,
    reason: string,
  ): Promise<CheckInReversed> {
    const explanation = reason.trim();
    // Blueprint 4.4 leaves it to the caller to decide which actions need a
    // reason, and withdrawing the record of somebody's arrival is one. The
    // bounds are the audit column's own — published, because a screen has to
    // stop somebody typing past them and has to say why it refused — so a
    // reason that passes here cannot fail after the Stay has already been
    // withdrawn, which would roll back and name a field the caller never
    // mentioned.
    if (
      explanation.length < REVERSAL_REASON.min ||
      explanation.length > REVERSAL_REASON.max
    ) {
      throw new CheckInReversalError(
        `a reason must be between ${REVERSAL_REASON.min} and ${REVERSAL_REASON.max} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The Unit's lock first, as in checkIn (ADR 0033). A check-in on this
      // Unit holds it and waits, inside the unique index, for this transaction
      // to finish with the Stay; had this transaction then asked for it, each
      // would wait on the other. Today it never asks — the occupancy trigger
      // does not fire on the way back to confirmed — so this keeps the order
      // right should that arrow ever be checked again.
      await tx.$queryRaw`
        select pg_advisory_xact_lock(2, hashtext(accommodation_unit_id::text))::text
        from public.stays
        where id = ${stayId}::uuid
      `;

      let withdrawn;
      try {
        withdrawn = await withdrawStayWithin(tx, stayId);
      } catch (error: unknown) {
        // The one refusal a front desk can act on: money exists, so this is a
        // stay that happened and correcting it is a credit or a refund.
        if (raised(error, NOT_IN_PREREQUISITE_STATE)) {
          throw new StayHasChargesError(
            "that Stay has charges posted against it",
          );
        }
        // Out of reach, already departed, already withdrawn, never existed. One
        // message for all four: telling them apart would confirm that a Stay
        // the caller cannot see is there.
        if (error instanceof StayWriteError) {
          throw new CheckInReversalError("that check-in cannot be withdrawn");
        }
        throw error;
      }

      if (!withdrawn.reservationId) {
        // A Stay that began without a Reservation has none to return, so there
        // is no check-in to withdraw — only a Stay, and ending one is a
        // check-out. Not reachable yet, because nothing creates a walk-in.
        throw new CheckInReversalError("that check-in cannot be withdrawn");
      }

      const returned = await tx.$queryRaw<{ id: string }[]>`
        update public.reservations
           set status = 'confirmed',
               updated_at = now()
         where id = ${withdrawn.reservationId}::uuid
           and status = 'checked_in'
        returning id
      `;
      if (returned.length === 0) {
        // The Stay moved and its Reservation did not, which would leave a
        // Reservation marked arrived with a withdrawn Stay behind it. Throwing
        // rolls the first write back rather than leaving the pair disagreeing.
        throw new CheckInReversalError("that check-in cannot be withdrawn");
      }

      // The Folio the check-in opened goes with it. Left open it was a row on
      // the Finance screen for a Guest who was never there — nothing could be
      // posted to it and nothing could close it — and once a withdrawn
      // Reservation could be checked in again, one Reservation showed two.
      await closeEmptyFolioWithin(tx, stayId);

      // Published like the check-in it undoes, and for the same reason: a
      // consumer of `stay.checked_in` that never hears this would act on an
      // arrival that was taken back.
      await publishWithin(tx, {
        organizationId: withdrawn.organizationId,
        eventType: "stay.check_in_reversed",
        payload: {
          stayId,
          reservationId: withdrawn.reservationId,
          accommodationUnitId: withdrawn.accommodationUnitId,
        },
      });

      await recordWithin(tx, {
        organizationId: withdrawn.organizationId,
        actorId: userId,
        action: "reservation.check_in_reversed",
        subjectType: "reservation",
        subjectId: withdrawn.reservationId,
        reason: explanation,
        context: {
          stayId,
          accommodationUnitId: withdrawn.accommodationUnitId,
        },
      });

      return { reservationId: withdrawn.reservationId, stayId };
    });
  }

  /**
   * The Stays in house at one Property, as the departures screen lists them.
   *
   * `due` is the day's work: everybody whose planned departure is today, and
   * everybody past theirs and still here. The overdue ones are the point — a
   * list showing only today hides the Guest who should have left on Tuesday,
   * which is the row a front desk most needs — so they lead.
   *
   * `in_house` is everybody, because a front desk also checks out a Guest
   * leaving early and a Resident with no end date, neither of whom is ever due
   * (CO-S1-03, CO-S1-05).
   *
   * The Folio's line count and balance are read here so the check-out dialog
   * can show the bill and confirm against it; the count is what the check-out
   * compares, under the Stay's lock (CO-S1-12).
   *
   * Empty for a Property the viewer cannot reach, one whose Organization lost
   * the Entitlement, and a quiet day — deliberately the same answer.
   */
  async function listDepartures(
    userId: string,
    propertyId: string,
    view: DepartureView = "due",
  ): Promise<Departure[]> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          (Omit<Departure, "balanceMinor"> & { balanceMinor: string })[]
        >`
        select
          stay.id                                     as "stayId",
          reservation.id                              as "reservationId",
          reservation.reference                       as "reference",
          coalesce(guest.full_name, '')               as "guestName",
          stay.stay_type                              as "stayType",
          to_char(stay.starts_on, 'YYYY-MM-DD')       as "startsOn",
          to_char(stay.ends_on, 'YYYY-MM-DD')         as "endsOn",
          unit.id                                     as "unitId",
          unit.name                                   as "unitName",
          room.name                                   as "roomName",
          unit.unit_type                              as "unitType",
          unit.status                                 as "unitStatus",
          coalesce(stay.ends_on < today.day, false)   as "overdue",
          coalesce(stay.ends_on > today.day, false)   as "early",
          folio.id                                    as "folioId",
          case when folio.id is null then null
               else (select count(*) from public.folio_lines as line
                      where line.folio_id = folio.id)::int
          end                                         as "folioVersion",
          -- Text, then a number in the contract, as the Folio module does: the
          -- sum is a bigint, and ::int overflowed on a large enough bill.
          coalesce(
            (select sum(line.amount_minor) from public.folio_lines as line
              where line.folio_id = folio.id),
            0
          )::text                                     as "balanceMinor",
          trim(coalesce(folio.currency, property.currency)) as "currency",
          app.has_organization_permission(
            stay.organization_id, 'front_desk.check_out') as "mayCheckOut"
        from public.stays as stay
        join public.properties as property
          on property.id = stay.property_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        left join public.reservations as reservation
          on reservation.id = stay.reservation_id
        -- Left, because the Reservation is: a Stay that began without one has
        -- no Guest recorded anywhere.
        left join public.guests as guest
          on guest.id = reservation.guest_id
        left join public.folios as folio
          on folio.stay_id = stay.id
         and folio.status = 'open'
        cross join (
          select app.property_today(${propertyId}::uuid) as day
        ) as today
        where stay.property_id = ${propertyId}::uuid
          and stay.status = 'in_house'
          and (${view} = 'in_house'
               or (stay.ends_on is not null and stay.ends_on <= today.day))
          and app.can_use_capability(
            stay.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
        order by stay.ends_on nulls last,
                 coalesce(room.name, unit.name), unit.name
      `,
    );
    return rows.map((row) => ({
      ...row,
      balanceMinor: Number(row.balanceMinor),
    }));
  }

  /**
   * Checks a Stay out: it ends, its Reservation ends with it, a settled Folio
   * closes, and the actor is recorded.
   *
   * Confirmed against the review the desk saw (`CheckOutConfirmation`), and
   * everything that review claimed is compared with what is true under the
   * Stay's lock before anything is written:
   *
   * - the Folio's line count, so a charge posted after the review — or a charge
   *   and its correction, which leave the balance as it was — is not settled by
   *   a desk that never saw it (CO-S1-12, CO-S1-16);
   * - an early departure, which must be acknowledged (CO-S1-03, CO-S1-04);
   * - the balance. Nothing can take a payment yet (PRE-01), so a Folio with
   *   money on it cannot be settled; the Guest is leaving regardless, so the
   *   desk leaves it open and says why, and the reason is the audit record's.
   *   A zero balance closes the Folio in the same transaction.
   *
   * The lock is the Stay's (namespace 1), the one every posting to its Folio
   * takes, so a charge racing this either lands first and changes the count,
   * or waits and is then refused because the Folio is closed (CO-S1-15).
   *
   * Nothing here checks whether the actor is allowed to do this. The Stay's
   * update returns no row when they are not, the Reservation's policy asks for
   * check-out again, and the Folio's trigger refuses a Folio that is not
   * settled — the database's answers, not this module's.
   */
  async function checkOut(
    userId: string,
    stayId: string,
    confirmation: CheckOutConfirmation,
  ): Promise<CheckedOut> {
    const reason = confirmation.balanceReason?.trim() || null;
    if (
      reason !== null &&
      (reason.length < BALANCE_REASON.min || reason.length > BALANCE_REASON.max)
    ) {
      throw new BalanceReasonError(
        `a reason must be between ${BALANCE_REASON.min} and ${BALANCE_REASON.max} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The Stay's lock, in a statement of its own. `folio_line_is_postable`
      // takes the same lock, so no line can be added between the read below
      // and the commit. Its own statement because the read must start after
      // the lock is granted: a statement's snapshot is taken when it begins,
      // and one that waited for the lock inside itself would not see the
      // charge whose transaction it was waiting for.
      //
      // This relies on READ COMMITTED, which is what withOrganizationContext
      // runs at. Under REPEATABLE READ the read below would use the
      // transaction's first snapshot and miss that charge; the race test
      // asserts the isolation level so raising it fails loudly.
      //
      // Taken from the Stay, like reverseCheckIn: a Stay the viewer cannot
      // read locks nothing.
      await tx.$queryRaw`
        select pg_advisory_xact_lock(1, hashtext(id::text))::text
        from public.stays
        where id = ${stayId}::uuid
      `;

      const [review] = await tx.$queryRaw<
        {
          today: Date;
          todayText: string;
          plannedEndsOn: string | null;
          folioId: string | null;
          folioLines: number;
          balanceMinor: string;
          currency: string | null;
        }[]
      >`
        select app.property_today(stay.property_id)            as "today",
               to_char(app.property_today(stay.property_id),
                       'YYYY-MM-DD')                           as "todayText",
               to_char(stay.ends_on, 'YYYY-MM-DD')             as "plannedEndsOn",
               folio.id                                        as "folioId",
               (select count(*) from public.folio_lines as line
                 where line.folio_id = folio.id)::int          as "folioLines",
               coalesce((select sum(line.amount_minor)
                           from public.folio_lines as line
                          where line.folio_id = folio.id), 0)::text as "balanceMinor",
               folio.currency                                  as "currency"
        from public.stays as stay
        left join public.folios as folio
          on folio.stay_id = stay.id and folio.status = 'open'
        where stay.id = ${stayId}::uuid
          and stay.status = 'in_house'
      `;
      if (!review) {
        // Out of reach, already departed, withdrawn, or never existed. One
        // message for all four: telling them apart would confirm that a Stay
        // the caller cannot see is there.
        throw new CheckOutError("that Stay cannot be checked out");
      }

      const reviewedVersion = review.folioId ? review.folioLines : null;
      if (reviewedVersion !== confirmation.folioVersion) {
        throw new FolioChangedError("the bill changed since it was reviewed");
      }

      // ISO dates compare as strings; nothing here becomes a Date.
      const early =
        review.plannedEndsOn !== null &&
        review.plannedEndsOn > review.todayText;
      if (early && !confirmation.earlyDeparture) {
        throw new EarlyDepartureError(
          "the Guest is leaving before their planned departure",
        );
      }

      // Compared as the database's text, never parsed to a number: a balance
      // is a sum of bigints and a JavaScript number is not one (ADR 0015).
      const settled = review.balanceMinor === "0";
      if (!settled && reason === null) {
        throw new BalanceReasonError("the Folio has a balance");
      }

      let closed;
      try {
        closed = await closeStayWithin(tx, stayId, review.today);
      } catch (error: unknown) {
        // Checked in house under the lock a moment ago, so reaching this means
        // a policy refused the update: the actor cannot check out here. The
        // same message as every other refusal. Anything else is not a refusal
        // and is thrown as it is, so a real failure is not reported as one.
        if (error instanceof StayWriteError) {
          throw new CheckOutError("that Stay cannot be checked out");
        }
        throw error;
      }

      // The Reservation ends with its Stay (CO-S1-01). Checked at commit by
      // app.stay_and_reservation_agree, so a check-out that moved one and not
      // the other would roll back rather than leave them disagreeing. A Stay
      // that began without a Reservation has nothing to move (CO-S1-06).
      if (closed.reservationId) {
        const ended = await tx.$queryRaw<{ id: string }[]>`
          update public.reservations
             set status = 'checked_out',
                 updated_at = now()
           where id = ${closed.reservationId}::uuid
             and status = 'checked_in'
          returning id
        `;
        if (ended.length === 0) {
          // The pair was already broken — a row written before the rule
          // existed. Reported, not repaired in passing (CO-S1-28).
          throw new CheckOutError("that Stay's Reservation is not checked in");
        }
      }

      // A settled Folio closes with the Stay, under the lock that stops a
      // charge landing between the balance read and this.
      const folio = settled ? await closeSettledFolioWithin(tx, stayId) : null;

      // The same transaction again. A departure is the fact most things want to
      // react to — a final bill, a housekeeping task, a review request — and
      // none of those may hold up a front desk at eleven in the morning
      // (ADR 0020).
      await publishWithin(tx, {
        organizationId: closed.organizationId,
        eventType: "stay.checked_out",
        payload: {
          stayId,
          accommodationUnitId: closed.accommodationUnitId,
          // Formatted by the database, like every other date this module
          // publishes. The string never leaves the Property's own day.
          departedOn: review.todayText,
          folioId: review.folioId,
          folioClosed: folio !== null,
        },
      });

      await recordWithin(tx, {
        organizationId: closed.organizationId,
        actorId: userId,
        action: "stay.checked_out",
        subjectType: "stay",
        subjectId: stayId,
        // Why the Folio was left with money on it; nothing when it was settled.
        ...(!settled && reason !== null ? { reason } : {}),
        context: {
          accommodationUnitId: closed.accommodationUnitId,
          reservationId: closed.reservationId,
          folioId: review.folioId,
          balanceMinor: review.balanceMinor,
          currency: review.currency,
          folioClosed: folio !== null,
          plannedEndsOn: review.plannedEndsOn,
          earlyDeparture: early,
        },
      });

      return { stayId, folioClosed: folio !== null };
    });
  }

  /**
   * Every Unit in the Property a booking may be placed on.
   *
   * In service, not free. Whether a Unit is free over particular nights is
   * `reservations_no_double_booking`'s answer and nobody else's — computing it
   * here would produce a list that was true when the page rendered and false by
   * the time somebody pressed the button, and would be a second opinion about
   * availability for the first time in this repository.
   *
   * Empty for a Property the viewer cannot reach and for one whose Organization
   * lost the Entitlement, which are deliberately the same answer.
   */
  async function listBookableUnits(
    userId: string,
    propertyId: string,
  ): Promise<BookableUnit[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<BookableUnit[]>`
        select
          unit.id        as "unitId",
          unit.name      as "unitName",
          room.name      as "roomName",
          unit.unit_type as "unitType"
        from public.accommodation_units as unit
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        where unit.property_id = ${propertyId}::uuid
          and unit.status not in ('out_of_service', 'blocked')
          -- A Unit is sellable when it has no children (ADR 0025): a room with
          -- beds under it is let by the bed, and offering it would be offering
          -- something the sellability trigger then refuses. (No backticks in
          -- this comment: the statement is a JS template literal.)
          and not exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )
          and app.can_use_capability(
            unit.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
        order by coalesce(room.name, unit.name), unit.name
      `,
    );
  }

  /**
   * The Property's Reservations that are still ahead of it or under way.
   *
   * Not today's — that is the arrivals list, and it answers a different
   * question. This one exists so that a booking taken for a fortnight's time is
   * visible the moment it is made; without it, creating a Reservation would
   * produce no observable effect until the day it starts, which is indis-
   * tinguishable from it not having worked.
   *
   * A Reservation leaves the list when its last night has passed, so the screen
   * does not grow without bound. Until then it stays whatever became of it —
   * cancelled, a no-show, checked out — because a booking that disappears the
   * moment it is cancelled reads the same as one that was never taken.
   *
   * `ends_on >= today` and not `>`: nights are half-open, so a Reservation
   * ending today is somebody leaving today, and they are still here this
   * morning.
   */
  async function listReservations(
    userId: string,
    propertyId: string,
  ): Promise<ReservationRow[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<ReservationRow[]>`
        select
          reservation.id                                as "reservationId",
          reservation.reference                         as "reference",
          guest.id                                      as "guestId",
          guest.full_name                               as "guestName",
          guest.email                                   as "guestEmail",
          reservation.stay_type                         as "stayType",
          reservation.status                            as "status",
          to_char(reservation.starts_on, 'YYYY-MM-DD')  as "startsOn",
          to_char(reservation.ends_on, 'YYYY-MM-DD')    as "endsOn",
          unit.id                                       as "unitId",
          unit.name                                     as "unitName",
          room.name                                     as "roomName",
          unit.unit_type                                as "unitType",
          reservation.status in ('requested', 'confirmed')
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.cancel')
                                                        as "mayCancel",
          reservation.status = 'confirmed'
            and reservation.starts_on <= today.day
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.cancel')
                                                        as "mayMarkNoShow"
        from public.reservations as reservation
        join public.guests as guest
          on guest.id = reservation.guest_id
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        cross join (
          select app.property_today(${propertyId}::uuid) as day
        ) as today
        where reservation.property_id = ${propertyId}::uuid
          -- A booking still open stays however old it is: one whose nights
          -- all passed unarrived is on no other screen, and has to be marked a
          -- no-show or cancelled from here rather than stay confirmed forever.
          and (reservation.ends_on is null
               or reservation.ends_on >= today.day
               or reservation.status in ('requested', 'confirmed'))
          and app.can_use_capability(
            reservation.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
        order by reservation.starts_on, unit.name
      `,
    );
  }

  /**
   * Takes a booking: a Guest, and the nights they hold on one Unit.
   *
   * The first thing in the product that creates a Reservation. Until now every
   * one was written by `scripts/db-seed-dev.mjs`, which is why
   * `reservations_no_double_booking` did not exist — blueprint section 13
   * forbids the rule ahead of the workflow, and this is the workflow
   * ([ADR 0024](../../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)).
   *
   * Two writes and a record in one transaction. A Guest recorded for a booking
   * that was refused is a profile nobody asked for, and a Reservation with no
   * Guest is unrepresentable, so they share one fate.
   *
   * Created `confirmed` rather than `requested`. A front desk taking a booking
   * is allocating the Unit — that is what the person on the telephone is being
   * told — and only an allocated Reservation holds its nights under the
   * exclusion constraint. `requested` is what a booking engine or a channel will
   * write when one exists, and confirming it will then be the act that has to
   * pass this same constraint.
   *
   * Nothing here asks whether the actor may do this. The Unit query returns no
   * row when they may not, because it carries all four gates; the insert is
   * refused independently by `reservations_insert_front_desk`; and the Guest by
   * `guests_insert_front_desk`. Three separate refusals for one action, which is
   * the arrangement blueprint 3.5 asks for.
   */
  async function createReservation(
    userId: string,
    booking: NewReservation,
  ): Promise<CreatedReservation> {
    const startsOn = calendarDay(booking.startsOn);
    const endsOn = booking.endsOn === null ? null : calendarDay(booking.endsOn);

    // Shape first, and before the transaction. `2026-02-31` parses as the 3rd of
    // March, so a regular expression alone would silently book a different week.
    if (!startsOn || (booking.endsOn !== null && !endsOn)) {
      throw new ReservationPeriodError("those are not calendar dates");
    }
    // ISO dates compare correctly as strings, which is most of why this module
    // never turns one into a Date. `reservations_period_check` refuses the same
    // row; this is what turns its 23514 into a sentence about the field.
    if (endsOn !== null && endsOn <= startsOn) {
      throw new ReservationPeriodError(
        "a Reservation covers at least one night",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The Unit is the thing the caller is allowed to name, and everything
      // else is read from the row it returns — the Organization above all
      // (ADR 0012). A caller supplying a valid-looking organization_id would be
      // refused by a foreign key, and cannot supply one at all.
      //
      // `app.property_today` comes back in the same statement so the day the
      // booking is measured against is the Property's own, not the server's.
      const located = await tx.$queryRaw<
        { organizationId: string; propertyId: string; today: string }[]
      >`
        select
          unit.organization_id                             as "organizationId",
          unit.property_id                                 as "propertyId",
          to_char(app.property_today(unit.property_id),
                  'YYYY-MM-DD')                            as "today"
        from public.accommodation_units as unit
        where unit.id = ${booking.accommodationUnitId}::uuid
          and unit.property_id = ${booking.propertyId}::uuid
          and unit.status not in ('out_of_service', 'blocked')
          -- Let by the bed, so not sellable whole (ADR 0025). Refused here so
          -- the caller gets this module's sentence; the trigger refuses it
          -- again underneath, for every role rather than only this one.
          and not exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )
          and app.can_use_capability(
            unit.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;

      const [unit] = located;
      if (!unit) {
        // Out of reach, unentitled, out of service, let by the bed, in
        // another Property, or never existed. One message for all six: telling
        // them apart would confirm that a Unit the caller cannot see is there.
        throw new ReservationRefusedError("that booking cannot be taken");
      }

      if (startsOn < unit.today) {
        // A booking for a night that has already passed. Not a policy question
        // and not authorization — there is nothing to allocate.
        throw new ReservationPeriodError(
          "a Reservation cannot start before today",
        );
      }

      const guest = await identifyGuestWithin(tx, {
        organizationId: unit.organizationId,
        fullName: booking.guestName,
        email: booking.guestEmail,
        phone: booking.guestPhone,
      });

      let reservationId: string;
      try {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          insert into public.reservations
            (organization_id, property_id, accommodation_unit_id,
             guest_id, stay_type, status, starts_on, ends_on)
          values (
            ${unit.organizationId}::uuid,
            ${unit.propertyId}::uuid,
            ${booking.accommodationUnitId}::uuid,
            ${guest.guestId}::uuid,
            ${booking.stayType},
            'confirmed',
            ${startsOn}::date,
            ${endsOn}::date
          )
          returning id
        `;
        const [row] = inserted;
        if (!row) {
          // Reachable only if reservations_insert_front_desk denied after the
          // Unit query allowed it, which would mean the two disagree.
          throw new ReservationRefusedError("that booking cannot be taken");
        }
        reservationId = row.id;
      } catch (error: unknown) {
        // The exclusion constraint refused: those nights are already allocated
        // on that Unit. The one refusal a front desk can act on — every other
        // one here is "you cannot".
        if (raised(error, EXCLUSION_VIOLATION)) {
          throw new UnitUnavailableError(
            "that Accommodation Unit is booked for those nights",
          );
        }
        // Somebody in house holds some of those nights (ADR 0033): refused at
        // the booking rather than at the desk on the day.
        if (raised(error, UNIT_OCCUPIED)) {
          throw new UnitHasOccupantError(
            "that Accommodation Unit has somebody staying over those nights",
          );
        }
        throw error;
      }

      // Nothing subscribes, like `stay.checked_in` before it. Published anyway
      // and for the same reason: an event that was never written cannot be
      // backfilled, and a confirmation nobody sent is exactly the handler this
      // will eventually carry (apps/worker/src/outbox/subscriptions.ts).
      //
      // Ids only. The queue is the one table a single process reads across
      // every Organization, so a Guest's name has no business in it.
      await publishWithin(tx, {
        organizationId: unit.organizationId,
        eventType: "reservation.created",
        payload: {
          reservationId,
          guestId: guest.guestId,
          propertyId: unit.propertyId,
          accommodationUnitId: booking.accommodationUnitId,
        },
      });

      await recordWithin(tx, {
        organizationId: unit.organizationId,
        actorId: userId,
        action: "reservation.created",
        subjectType: "reservation",
        subjectId: reservationId,
        context: {
          guestId: guest.guestId,
          guestCreated: guest.created,
          accommodationUnitId: booking.accommodationUnitId,
          startsOn,
          endsOn,
        },
      });

      return {
        reservationId,
        guestId: guest.guestId,
        guestCreated: guest.created,
      };
    });
  }

  /**
   * Ends a booking that will never become a Stay: cancelled, with a reason, or
   * a no-show once its first night has come.
   *
   * Both free the Unit, because `reservations_no_double_booking` holds only
   * confirmed Reservations — the dates stay exactly as they were and hold
   * nothing, which is the same shape a withdrawn check-in has. Nothing is
   * deleted.
   *
   * A no-show is refused before the first night: until then somebody may still
   * come, and saying they did not is a cancellation, which asks for a reason.
   * The status is the no-show's reason, so it asks for none.
   *
   * Nothing here checks whether the actor may do this. The update's policy asks
   * for `front_desk.cancel`, and `reservations_transition_is_drawn` decides
   * which statuses these may be reached from — requested or confirmed for a
   * cancellation, confirmed for a no-show — for every role.
   */
  async function endReservation(
    userId: string,
    reservationId: string,
    outcome: "cancelled" | "no_show",
    action: "reservation.cancelled" | "reservation.no_show",
    reason: string | null,
  ): Promise<ReservationEnded> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let ended: {
        organizationId: string;
        propertyId: string;
        unitId: string;
      }[];
      try {
        ended = await tx.$queryRaw<
          { organizationId: string; propertyId: string; unitId: string }[]
        >`
          update public.reservations
             set status = ${outcome},
                 updated_at = now()
           where id = ${reservationId}::uuid
             and status in ('requested', 'confirmed')
             and (${outcome} = 'cancelled'
                  or (status = 'confirmed'
                      and starts_on <= app.property_today(property_id)))
          returning organization_id       as "organizationId",
                    property_id           as "propertyId",
                    accommodation_unit_id as "unitId"
        `;
      } catch (error: unknown) {
        // A policy refusing the new status, or the transition trigger. Both
        // are "you cannot", which is the one message this command gives.
        if (raised(error, "42501") || raised(error, "23514")) {
          throw new ReservationEndError("that booking cannot be ended");
        }
        throw error;
      }

      const [row] = ended;
      if (!row) {
        throw new ReservationEndError("that booking cannot be ended");
      }

      // Ids only, like every event: the queue is read across Organizations.
      await publishWithin(tx, {
        organizationId: row.organizationId,
        eventType: action,
        payload: {
          reservationId,
          propertyId: row.propertyId,
          accommodationUnitId: row.unitId,
        },
      });

      await recordWithin(tx, {
        organizationId: row.organizationId,
        actorId: userId,
        action,
        subjectType: "reservation",
        subjectId: reservationId,
        ...(reason !== null ? { reason } : {}),
        context: { accommodationUnitId: row.unitId },
      });

      return { reservationId, status: outcome };
    });
  }

  /** Cancels a booking, with a reason (blueprint 4.4). */
  async function cancelReservation(
    userId: string,
    reservationId: string,
    reason: string,
  ): Promise<ReservationEnded> {
    const explanation = reason.trim();
    if (
      explanation.length < CANCELLATION_REASON.min ||
      explanation.length > CANCELLATION_REASON.max
    ) {
      throw new ReservationReasonError(
        `a reason must be between ${CANCELLATION_REASON.min} and ${CANCELLATION_REASON.max} characters`,
      );
    }
    return endReservation(
      userId,
      reservationId,
      "cancelled",
      "reservation.cancelled",
      explanation,
    );
  }

  /** Records that somebody booked for tonight or before never came. */
  async function markNoShow(
    userId: string,
    reservationId: string,
  ): Promise<ReservationEnded> {
    return endReservation(
      userId,
      reservationId,
      "no_show",
      "reservation.no_show",
      null,
    );
  }

  return {
    createReservation,
    listArrivals,
    listBookableUnits,
    listDepartures,
    listReservations,
    checkIn,
    checkOut,
    reverseCheckIn,
    cancelReservation,
    markNoShow,
  };
}

export type ReservationsModule = ReturnType<typeof createReservationsModule>;
