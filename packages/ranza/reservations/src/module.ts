import { withOrganizationContext } from "@ranza/db";
import { openFolioWithin } from "@ranza/folios";
import { recordWithin } from "@ranza/platform-audit";
import { publishWithin } from "@ranza/platform-outbox";
import {
  closeStayWithin,
  openStayWithin,
  StayWriteError,
  withdrawStayWithin,
} from "@ranza/stays";
import {
  CheckInError,
  CheckInReversalError,
  CheckOutError,
  FRONT_DESK_CAPABILITY,
  StayHasChargesError,
  UnitUnavailableError,
  type Arrival,
  type CheckedIn,
  type CheckedOut,
  type CheckInReversed,
  type Departure,
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
 * The audit column's own bounds. Checked here so a reason that is too short
 * fails before the Stay has been withdrawn rather than after, which would
 * produce a rollback and an error naming a field the caller never mentioned —
 * the same trap `@ranza/folios` documents finding the hard way.
 */
const REASON_MIN = 3;
const REASON_MAX = 2000;

/**
 * Raised by `stays_withdrawal_is_free_of_charges`. Deliberately not 42501: a
 * policy refusal is also 42501, and "money has been posted" is a different
 * answer from "you cannot".
 */
const NOT_WITHDRAWABLE = "55000";

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
   * `<=` today rather than `=` today, so somebody who should have arrived
   * yesterday and has not is still on the list. Check-in accepts a late arrival
   * — the Stay simply starts on the day they turned up — and a list that showed
   * only today would have made every one of those unreachable from the screen
   * that exists to handle them. The same reasoning as the departures list,
   * which shows the Guest who should have left on Tuesday.
   *
   * Cancelled and no-show Reservations are absent because they are not
   * arriving. Already checked-in ones stay, so the list still shows the day's
   * work after it has been done rather than emptying as it goes.
   *
   * Empty is the correct answer for a Property the viewer cannot reach, for one
   * whose Organization lost the Entitlement, and for a quiet day. Those are
   * different situations with deliberately identical answers.
   */
  async function listArrivals(
    userId: string,
    propertyId: string,
  ): Promise<Arrival[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<Arrival[]>`
        select
          reservation.id                                as "reservationId",
          reservation.guest_name                        as "guestName",
          reservation.stay_type                         as "stayType",
          reservation.status                            as "status",
          to_char(reservation.starts_on, 'YYYY-MM-DD')  as "startsOn",
          to_char(reservation.ends_on, 'YYYY-MM-DD')    as "endsOn",
          unit.id                                       as "unitId",
          unit.name                                     as "unitName",
          unit.unit_type                                as "unitType",
          reservation.status = 'confirmed'              as "canCheckIn"
        from public.reservations as reservation
        join public.properties as property
          on property.id = reservation.property_id
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        where reservation.property_id = ${propertyId}::uuid
          and reservation.starts_on
              <= (now() at time zone property.timezone)::date
          and reservation.status in ('requested', 'confirmed', 'checked_in')
          and app.can_use_capability(
            reservation.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
        order by unit.name, reservation.guest_name
      `,
    );
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
    // bounds are the audit column's own, so a reason that passes here cannot
    // fail after the Stay has already been withdrawn.
    if (explanation.length < REASON_MIN || explanation.length > REASON_MAX) {
      throw new CheckInReversalError(
        `a reason must be between ${REASON_MIN} and ${REASON_MAX} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let withdrawn;
      try {
        withdrawn = await withdrawStayWithin(tx, stayId);
      } catch (error: unknown) {
        // The one refusal a front desk can act on: money exists, so this is a
        // stay that happened and correcting it is a credit or a refund.
        if (raised(error, NOT_WITHDRAWABLE)) {
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
   * The Stays departing today at one Property, and any still in house past
   * their planned departure.
   *
   * The overdue ones are the point. A departures list that only showed today
   * would hide the Guest who should have left on Tuesday, which is the row a
   * front desk most needs to see — so the query asks for every current Stay
   * whose planned end has arrived or passed.
   */
  async function listDepartures(
    userId: string,
    propertyId: string,
  ): Promise<Departure[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<Departure[]>`
        select
          stay.id                               as "stayId",
          coalesce(reservation.guest_name, '')  as "guestName",
          stay.stay_type                        as "stayType",
          to_char(stay.ends_on, 'YYYY-MM-DD')   as "endsOn",
          unit.id                               as "unitId",
          unit.name                             as "unitName",
          unit.unit_type                        as "unitType",
          stay.ends_on < (now() at time zone property.timezone)::date
                                                as "overdue"
        from public.stays as stay
        join public.properties as property
          on property.id = stay.property_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.reservations as reservation
          on reservation.id = stay.reservation_id
        where stay.property_id = ${propertyId}::uuid
          and stay.status = 'in_house'
          and stay.ends_on is not null
          and stay.ends_on <= (now() at time zone property.timezone)::date
          and app.can_use_capability(
            stay.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
        order by stay.ends_on, unit.name
      `,
    );
  }

  /**
   * Checks a Stay out: it ends, the Unit becomes free, and the actor is
   * recorded.
   *
   * Two writes and a record in one transaction, for the same reason check-in is
   * one: a Unit released without a record, or a record of a departure that did
   * not happen, are each worse than the check-out not happening.
   *
   * What frees the Unit is the status moving out of the exclusion constraint's
   * partial index, so the same Unit can be let again the same day — which is
   * the whole reason a front desk asks for this before lunch.
   *
   * Nothing here checks whether the actor is allowed to do this. The update
   * returns no row when they are not, because the policy filtered it; and the
   * columns they could otherwise have changed are refused by a column-level
   * grant rather than by this module remembering not to.
   */
  async function checkOut(userId: string, stayId: string): Promise<CheckedOut> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // Today at the Property, decided by the database. A departure date taken
      // from the server's clock is the wrong day for half of every day at a
      // Property in another timezone.
      const [today] = await tx.$queryRaw<{ on: Date; onText: string }[]>`
        select (now() at time zone property.timezone)::date as "on",
               to_char((now() at time zone property.timezone)::date,
                       'YYYY-MM-DD') as "onText"
        from public.properties as property
        join public.stays as stay on stay.property_id = property.id
        where stay.id = ${stayId}::uuid
      `;
      if (!today) {
        // No readable Property for that Stay: out of reach, or no such Stay.
        throw new CheckOutError("that Stay cannot be checked out");
      }

      let closed;
      try {
        closed = await closeStayWithin(tx, stayId, today.on);
      } catch (error: unknown) {
        // Out of reach, already departed, cancelled, or never existed. One
        // message for all four: telling them apart would confirm that a Stay
        // the caller cannot see is there.
        //
        // Only that refusal is translated. A bare `catch` here also swallowed
        // a constraint violation and a lost connection, reporting both to the
        // front desk as "you cannot" and to the logs as nothing at all —
        // hiding which Stay exists is the point, hiding a real failure from
        // the people running the system is not.
        if (error instanceof StayWriteError) {
          throw new CheckOutError("that Stay cannot be checked out");
        }
        throw error;
      }

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
          // publishes. `toISOString()` on the Date beside it happens to be
          // right — the adapter hands back UTC midnight — but that is a
          // third-party parsing choice, and an upgrade that changed it to local
          // midnight would shift this by a day for every host east of UTC with
          // nothing failing. The string never leaves the Property's own day.
          departedOn: today.onText,
        },
      });

      await recordWithin(tx, {
        organizationId: closed.organizationId,
        actorId: userId,
        action: "stay.checked_out",
        subjectType: "stay",
        subjectId: stayId,
        context: { accommodationUnitId: closed.accommodationUnitId },
      });

      return { stayId };
    });
  }

  return { listArrivals, listDepartures, checkIn, checkOut, reverseCheckIn };
}

export type ReservationsModule = ReturnType<typeof createReservationsModule>;
