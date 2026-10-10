import { withOrganizationContext } from "@ranza/db";
import {
  closeEmptyFolioWithin,
  closeSettledFolioWithin,
  openFolioWithin,
} from "@ranza/folios";
import { identifyGuestWithin } from "@ranza/guests";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
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
  BookingChangedError,
  BookingChangeError,
  CANCELLATION_REASON,
  CHANGE_NOTE,
  ChangeNoteError,
  MOVE_REASONS,
  CheckInDayClosedError,
  StayMovedError,
  CheckInError,
  CheckInTooEarlyError,
  CheckInReversalError,
  CheckOutError,
  EarlyDepartureError,
  EXPECTED_ARRIVAL,
  ExpectedArrivalError,
  FolioChangedError,
  FRONT_DESK_CAPABILITY,
  ReservationEndError,
  ReservationPeriodError,
  ReservationReasonError,
  ReservationRefusedError,
  REVERSAL_REASON,
  StayHasChargesError,
  PriceChangedError,
  UnitHasOccupantError,
  UnitNotInServiceError,
  UnitNotReadyError,
  UnitUnavailableError,
  type AmendedBooking,
  type Arrival,
  type BookableUnit,
  type BookingChange,
  type ChangedDeparture,
  type ChangeOption,
  type ChangePreview,
  type DepartureChange,
  type DeparturePreview,
  type GuestMove,
  type MovedGuest,
  type MoveOption,
  type MovePreview,
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
  type UnitAvailability,
  ROOM_CALENDAR_LEAD_DAYS,
  type RoomCalendar,
  type RoomCalendarWindow,
} from "./contracts";
import type { ReservationsDeps } from "./ports";
import {
  buildRoomCalendar,
  calendarLength,
  type CalendarUnitRow,
} from "./room-calendar";

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
 * Raised by `stays_keep_closed_days` when a Stay would begin, end or be
 * withdrawn on a business day that is closed (ADR 0034). Ranza's own class,
 * because 55000 already means "money has been posted" on the withdrawal path.
 */
const BUSINESS_DAY_CLOSED = "RZ001";

/**
 * A caller the database will not let do this: raised by the room-night
 * posting at check-out for a Staff Member who may not check this Guest out,
 * and by the amend commands for every reason a change is not theirs to make.
 */
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * check_violation. From the amend commands, a date rule: an arrival before
 * today, a Guest booking without a departure, a period of no nights, or a
 * change that changes nothing. All four are about the dates the desk typed.
 */
const CHECK_VIOLATION = "23514";

/**
 * Raised by the amend commands when the booking changed after the dialog read
 * it: another revision landed, or its Unit moved (ADR 0039).
 */
const CHANGED_SINCE_READ = "RZ003";

/** Raised by `app.move_stay` for a room housekeeping has not made ready (AB-S3-03). */
const UNIT_NOT_READY = "RZ002";

/** Raised by `stay_may_be_withdrawn` for a Stay whose Guest has been moved. */
const STAY_MOVED = "RZ004";

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
  // Four-digit years PostgreSQL and a window after them can both hold: year
  // 0000 is refused by the date type, and a window opened late in 9999 would
  // run into a five-digit year.
  if (value < "1000-01-01" || value > "9998-12-31") return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * An expected arrival as the database wants it: a 24-hour `HH:MM`, or null for
 * none. The shape is checked here so a malformed time is the person's to fix
 * rather than a cast error from Postgres.
 */
function expectedArrivalOf(value: string | null): string | null {
  if (value === null) return null;
  if (!EXPECTED_ARRIVAL.test(value)) {
    throw new ExpectedArrivalError("that is not a time of day");
  }
  return value;
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
  /**
   * Whether housekeeping says the room is ready, read in the same statement
   * that moves the Reservation, so the warning and the check-in cannot
   * disagree about a room somebody marked clean in between (HK-S2-17).
   */
  unitIsReady: boolean;
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
            -- A room out of order or blocked covers its beds (ADR 0032,
            -- MT-S2-06): a bed under it is no more in service than it is.
            case
              when room.status in ('out_of_service', 'blocked')
               and unit.status not in ('out_of_service', 'blocked')
              then room.status
              else unit.status
            end                                     as unit_status,
            room.name                               as room_name,
            stay.id                                 as stay_id,
            folio.id                                as folio_id,
            folio.currency                          as folio_currency,
            property.currency                       as property_currency,
            property.timezone                       as property_timezone,
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
          -- Housekeeping's answer (ADR 0029), not a blocker: a room that is
          -- not ready is asked about at check-in, never refused.
          app.unit_is_ready(accommodation_unit_id)    as "unitIsReady",
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
          to_char(expected_arrival_time, 'HH24:MI')   as "expectedArrival",
          -- The booking's own day and the Property's own clock, against the
          -- database's now(): a date and a time of day make a wall-clock time,
          -- and the timezone makes it an instant. Not for a booking already
          -- days late, whose time was for a day that has passed.
          (status = 'confirmed'
            and starts_on = today
            and expected_arrival_time is not null
            and (starts_on + expected_arrival_time)
                  at time zone property_timezone < now()
          )                                           as "expectedArrivalPassed",
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
            organization_id, 'front_desk.cancel')     as "mayCancel",
          status in ('requested', 'confirmed')
            and app.has_organization_permission(
                  organization_id, 'front_desk.amend') as "mayAmend"
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
    options: { readinessAcknowledged?: boolean } = {},
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
          ends_on                         as "endsOn",
          app.unit_is_ready(accommodation_unit_id) as "unitIsReady"
      `;

      const [reservation] = moved;
      if (!reservation) {
        // One early arrival is told apart (CI-S1-07): before the cutoff the
        // night is still yesterday's, so a booking from the new calendar day
        // starts on the next business date. Read under the caller's own
        // policies and gates, so it is answered only for a Reservation they
        // could check in once its day came — everything else is the one
        // refusal below.
        const [early] = await tx.$queryRaw<{ startsOn: string }[]>`
          select to_char(starts_on, 'YYYY-MM-DD') as "startsOn"
          from public.reservations
          where id = ${reservationId}::uuid
            and status = 'confirmed'
            and starts_on > app.property_today(property_id)
            and app.can_use_capability(
              property_id,
              ${FRONT_DESK_CAPABILITY.moduleKey},
              ${FRONT_DESK_CAPABILITY.capabilityKey}
            )
            and app.has_organization_permission(
              organization_id, 'front_desk.check_in')
        `;
        if (early) throw new CheckInTooEarlyError(early.startsOn);
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
        // Blocked or out of service, or a bed under a room that is (ADR 0032),
        // refused by stays_unit_is_in_service.
        if (raised(error, NOT_IN_PREREQUISITE_STATE)) {
          throw new UnitNotInServiceError(
            "that Accommodation Unit is not in service",
          );
        }
        // Begun before the cutoff and committing after the day closed: the
        // Stay would begin on a finalized day. Pressing again is a new
        // transaction on the new day, which is the whole remedy.
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new CheckInError("the business day closed during the check-in");
        }
        throw error;
      }

      // A room that is not ready is the desk's call, not a refusal: asked
      // once, and allowed after they say so (HK-S2-14, HK-S2-15). Asked only
      // once the Stay has been accepted, so every refusal nobody can override
      // — somebody in the room, the room out of service, the day closed — is
      // said first rather than after "check in anyway" (CI-S1-19). Thrown
      // before the Folio, the event and the record, and the throw rolls the
      // Stay and the Reservation back with it: the answer the desk gives is
      // to a check-in that has not half happened.
      if (!reservation.unitIsReady && !options.readinessAcknowledged) {
        throw new UnitNotReadyError();
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
        locationId: reservation.propertyId,
        action: "reservation.checked_in",
        subjectType: "reservation",
        subjectId: reservationId,
        context: {
          stayId: created.stayId,
          accommodationUnitId: reservation.accommodationUnitId,
          folioId: folio?.folioId ?? null,
          // Only when it was true when the check-in happened: an
          // acknowledgement for a room somebody cleaned in the meantime is not
          // a room checked into dirty (HK-S2-17).
          ...(reservation.unitIsReady ? {} : { roomWasNotReady: true }),
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

      // Then the business day, shared, before anything takes the Stay's lock:
      // the global order is Unit, day, Stay (ADR 0038). The withdrawal's own
      // triggers happen to take them in that order today only because of how
      // their names sort; this makes it the code's decision.
      await tx.$queryRaw`
        select pg_advisory_xact_lock_shared(3, hashtext(property_id::text))::text
        from public.stays
        where id = ${stayId}::uuid
      `;

      let withdrawn;
      try {
        withdrawn = await withdrawStayWithin(tx, stayId);
      } catch (error: unknown) {
        // The day it began on is closed: the Stay is history, and the desk
        // corrects it rather than taking it back.
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new CheckInDayClosedError(
            "the business day that check-in began on is closed",
          );
        }
        // stay_may_be_withdrawn: the Guest has been moved since (AB-S3-11).
        if (raised(error, STAY_MOVED)) throw new StayMovedError();
        // The other refusal a front desk can act on: money exists, so this is
        // a stay that happened and correcting it is a credit or a refund.
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
        locationId: withdrawn.propertyId,
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
   * How many Stays at a Property were checked out on its business date.
   *
   * The departures list reads Stays still in house, so it cannot say how many
   * have gone; the dashboard's "out of due" needs both halves. Dated by the
   * moment of departure in the Property's own business day (ADR 0021), so a
   * check-out at 01:00 before the cutoff counts towards the working day it
   * belongs to.
   */
  async function countDepartedToday(
    userId: string,
    propertyId: string,
  ): Promise<number> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<{ departed: number }[]>`
        select count(*)::int as "departed"
        from public.stays as stay
        join public.properties as property
          on property.id = stay.property_id
        where stay.property_id = ${propertyId}::uuid
          and stay.status = 'departed'
          and stay.departed_at is not null
          -- A business day is at most 25 hours of wall clock, so nothing that
          -- left earlier than this can fall on today; the bound spares the
          -- function call on every Stay the Property has ever ended.
          and stay.departed_at > now() - interval '26 hours'
          and app.business_date(
                stay.departed_at, property.timezone,
                property.business_date_cutoff)
              = app.property_today(property.id)
          and app.can_use_capability(
            stay.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `,
    );
    return rows[0]?.departed ?? 0;
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
          (Omit<
            Departure,
            "balanceMinor" | "pendingMinor" | "nightlyRateMinor"
          > & {
            balanceMinor: string;
            pendingMinor: string;
            nightlyRateMinor: string | null;
          })[]
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
          case
            when room.status in ('out_of_service', 'blocked')
             and unit.status not in ('out_of_service', 'blocked')
            then room.status
            else unit.status
          end                                         as "unitStatus",
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
          -- What a check-out today would charge (ADR 0038): the nights before
          -- today that can be charged and that no close has reached. The same
          -- function the check-out posts through, so the review and the
          -- posting cannot disagree about what a night is.
          pending.nights                              as "pendingNights",
          pending.amount::text                        as "pendingMinor",
          reservation.nightly_rate_minor::text        as "nightlyRateMinor",
          app.has_organization_permission(
            stay.organization_id, 'front_desk.check_out') as "mayCheckOut",
          stay.reservation_id is not null
            and app.has_organization_permission(
                  stay.organization_id, 'front_desk.amend') as "mayAmend"
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
        cross join lateral (
          select count(*)::int                           as nights,
                 coalesce(sum(due.amount_minor), 0)      as amount
            from app.room_nights_due(stay.property_id, stay.starts_on,
                                     today.day - 1, stay.id) as due
           where due.reason is null
             and not exists (
               select 1 from public.business_day_closes as close
                where close.property_id = stay.property_id
                  and close.business_date = due.business_date)
        ) as pending
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
      pendingMinor: Number(row.pendingMinor),
      nightlyRateMinor:
        row.nightlyRateMinor === null ? null : Number(row.nightlyRateMinor),
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
   * - the balance. A Folio with money on it cannot be settled here, whether
   *   the Guest owes or is owed (a payment is recorded on the Folio before
   *   this, PRE-01); the Guest is leaving regardless, so the desk leaves it
   *   open and says why, and the reason is the audit record's. A zero balance
   *   closes the Folio in the same transaction.
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
      // The Property's business day, shared, before the Stay (ADR 0038). The
      // close of a day holds it exclusive and then takes each Stay's lock to
      // charge its night; this used to take the Stay's lock first and the
      // day's second, inside the Stay's update, and the two deadlocked. Taken
      // through the Stay, so a Stay the viewer cannot read locks nothing.
      await tx.$queryRaw`
        select pg_advisory_xact_lock_shared(3, hashtext(property_id::text))::text
        from public.stays
        where id = ${stayId}::uuid
      `;

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

      // The nights no close has charged, charged now (ADR 0038, RT-S3-06).
      // What was charged must be what the desk was shown: a close that got
      // there first, or a business date that rolled over, is a changed bill.
      let charged;
      try {
        [charged] = await tx.$queryRaw<{ posted: number; amount: string }[]>`
          select posted, amount::text
            from app.post_room_nights_for_departure(${stayId}::uuid)
        `;
      } catch (error: unknown) {
        // Checked in house under the lock a moment ago, so this is the caller:
        // they may not check this Guest out. The same message as every other
        // refusal.
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new CheckOutError("that Stay cannot be checked out");
        }
        throw error;
      }
      if (
        !charged ||
        charged.posted !== confirmation.pendingNights ||
        charged.amount !== String(confirmation.pendingMinor)
      ) {
        throw new FolioChangedError("the bill changed since it was reviewed");
      }
      if (charged.posted > 0) {
        const [after] = await tx.$queryRaw<{ balanceMinor: string }[]>`
          select coalesce(sum(line.amount_minor), 0)::text as "balanceMinor"
            from public.folio_lines as line
           where line.folio_id = ${review.folioId}::uuid
        `;
        review.balanceMinor = after?.balanceMinor ?? review.balanceMinor;
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
        // Begun before the cutoff and committing after the day closed: the
        // departure would land on a finalized day. Pressing again is a new
        // transaction on the new day.
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new CheckOutError(
            "the business day closed during the check-out",
          );
        }
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
        locationId: closed.propertyId,
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
          // The nights this check-out charged, which no close had reached.
          nightsCharged: charged.posted,
        },
      });

      return { stayId, folioClosed: folio !== null };
    });
  }

  /**
   * The Property's business date, `YYYY-MM-DD`: the first night a booking may
   * start on, which the booking form marks as today (RG-S1-10).
   *
   * Not the calendar date in the Property's timezone. Between midnight and the
   * cutoff the night still belongs to yesterday's date (ADR 0021), and a form
   * that marked the calendar date would offer the wrong first night.
   *
   * Null for a Property the viewer cannot book at — out of reach, unentitled,
   * or with the front desk off — like every read here, so it says nothing
   * about a Property they cannot see.
   */
  async function bookingDay(
    userId: string,
    propertyId: string,
  ): Promise<string | null> {
    const [row] = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<{ day: string }[]>`
        select to_char(app.property_today(property.id), 'YYYY-MM-DD') as day
        from public.properties as property
        where property.id = ${propertyId}::uuid
          and app.can_use_capability(
            property.id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `,
    );
    return row?.day ?? null;
  }

  /**
   * The Units in a Property that cannot take a booking over these nights.
   *
   * For the booking dialog to mark, not to decide: the exclusion constraint
   * still refuses a clash at saving, and a booking landing between this read
   * and the press is that refusal's to give. It is the same two questions
   * `previewChange` asks of every Unit for a booking being moved — another
   * confirmed booking over those nights, or somebody in house over them (ADR
   * 0033, ADR 0039) — asked for a booking that does not exist yet, so there is
   * no booking of its own to leave out.
   *
   * Only the Units with a blocker are returned. An open-ended booking, which
   * only a Resident may have, is asked about as `[start, ∞)`, so any later
   * confirmed booking on a Unit marks it, which is what the constraint would
   * say too.
   *
   * Gated by the same capability as every front-desk read: a viewer with reach
   * but the front desk switched off learns nothing about how full a Property
   * is.
   */
  async function listUnavailableUnits(
    userId: string,
    propertyId: string,
    startsOnInput: string,
    endsOnInput: string | null,
  ): Promise<UnitAvailability[]> {
    const startsOn = calendarDay(startsOnInput);
    const endsOn = endsOnInput === null ? null : calendarDay(endsOnInput);
    if (!startsOn || (endsOnInput !== null && !endsOn)) {
      throw new ReservationPeriodError("those are not calendar dates");
    }
    if (endsOn !== null && endsOn <= startsOn) {
      throw new ReservationPeriodError(
        "a Reservation covers at least one night",
      );
    }

    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<UnitAvailability[]>`
        with wanted as (
          select daterange(${startsOn}::date, ${endsOn}::date, '[)') as nights,
                 app.property_today(${propertyId}::uuid)             as today
        )
        select
          unit.id as "unitId",
          case
            when conflict.reference is not null then 'booked'
            else 'occupied'
          end     as "blocker"
        from public.accommodation_units as unit
        cross join wanted
        left join lateral (
          select other.reference
            from public.reservations as other
           where other.accommodation_unit_id = unit.id
             and other.status = 'confirmed'
             and daterange(other.starts_on, other.ends_on, '[)') && wanted.nights
           limit 1
        ) as conflict on true
        left join lateral (
          select stay.id
            from public.stays as stay
           where stay.accommodation_unit_id = unit.id
             and stay.status in ('reserved', 'in_house')
             and app.stay_holds(stay.status, stay.starts_on, stay.ends_on,
                                wanted.today) && wanted.nights
           limit 1
        ) as occupant on true
        where unit.property_id = ${propertyId}::uuid
          and app.can_use_capability(
            unit.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
          and (conflict.reference is not null or occupant.id is not null)
        order by unit.id
      `,
    );
  }

  /**
   * Every Unit in the Property a booking may be placed on.
   *
   * In service, not free. Which are taken over particular nights is
   * `listUnavailableUnits`, asked as the dates are chosen: an answer that is
   * true when read and may be false by the time somebody presses the button,
   * which is why the dialog marks with it and never removes a Unit, and why
   * `reservations_no_double_booking` still decides at saving.
   *
   * Empty for a Property the viewer cannot reach and for one whose Organization
   * lost the Entitlement, which are deliberately the same answer.
   */
  async function listBookableUnits(
    userId: string,
    propertyId: string,
  ): Promise<BookableUnit[]> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          (Omit<BookableUnit, "nightlyRateMinor"> & {
            nightlyRateMinor: string | null;
          })[]
        >`
        select
          unit.id                     as "unitId",
          unit.name                   as "unitName",
          room.name                   as "roomName",
          unit.unit_type              as "unitType",
          -- The price the stamp would read now: this kind's, and only while it
          -- is stated in the Property's currency (ADR 0038).
          rate.amount_minor::text     as "nightlyRateMinor",
          trim(rate.currency)         as "rateCurrency"
        from public.accommodation_units as unit
        join public.properties as property
          on property.id = unit.property_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        left join public.property_rates as rate
          on rate.property_id = unit.property_id
         and rate.unit_type = unit.unit_type
         and rate.amount_minor is not null
         and rate.currency = property.currency
        where unit.property_id = ${propertyId}::uuid
          and unit.status not in ('out_of_service', 'blocked')
          -- A room out of order or blocked covers its beds (ADR 0032,
          -- MT-S2-06).
          and (room.status is null
               or room.status not in ('out_of_service', 'blocked'))
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
    return rows.map((row) => ({
      ...row,
      nightlyRateMinor:
        row.nightlyRateMinor === null ? null : Number(row.nightlyRateMinor),
    }));
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
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          (Omit<ReservationRow, "nightlyRateMinor" | "totalMinor"> & {
            nightlyRateMinor: string | null;
            totalMinor: string | null;
          })[]
        >`
        select
          reservation.id                                as "reservationId",
          reservation.reference                         as "reference",
          guest.id                                      as "guestId",
          guest.full_name                               as "guestName",
          guest.email                                   as "guestEmail",
          guest.phone                                   as "guestPhone",
          reservation.stay_type                         as "stayType",
          reservation.status                            as "status",
          to_char(reservation.starts_on, 'YYYY-MM-DD')  as "startsOn",
          to_char(reservation.ends_on, 'YYYY-MM-DD')    as "endsOn",
          to_char(reservation.expected_arrival_time, 'HH24:MI')
                                                        as "expectedArrival",
          unit.id                                       as "unitId",
          unit.name                                     as "unitName",
          room.name                                     as "roomName",
          unit.unit_type                                as "unitType",
          reservation.nightly_rate_minor::text          as "nightlyRateMinor",
          trim(reservation.rate_currency)               as "rateCurrency",
          reservation.status in ('requested', 'confirmed')
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.cancel')
                                                        as "mayCancel",
          reservation.status = 'confirmed'
            and reservation.starts_on <= today.day
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.cancel')
                                                        as "mayMarkNoShow",
          reservation.status in ('requested', 'confirmed')
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.amend')
                                                        as "mayAmend",
          -- checkIn's own predicate: a confirmed booking whose nights have all
          -- passed is listed (so it can be marked a no-show) but is refused.
          reservation.status = 'confirmed'
            and reservation.starts_on <= today.day
            and (reservation.ends_on is null
                 or reservation.ends_on > today.day)
            and unit_now.status not in ('blocked', 'out_of_service')
            and occupant.id is null
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.check_in')
                                                        as "mayCheckIn",
          -- Arrivals' own answer, in the order a desk would fix them.
          case
            when reservation.status not in ('requested', 'confirmed')
              or reservation.starts_on > today.day
              or (reservation.ends_on is not null
                  and reservation.ends_on <= today.day)
                                                  then null
            when reservation.status = 'requested' then 'not_confirmed'
            when unit_now.status = 'blocked'      then 'unit_blocked'
            when unit_now.status = 'out_of_service'
                                                  then 'unit_out_of_service'
            when occupant.id is not null          then 'unit_occupied'
          end                                     as "checkInBlocker",
          coalesce(stay.status = 'in_house', false)
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.amend')
                                                        as "mayChangeStay",
          coalesce(stay.status = 'in_house', false)
            and stay.starts_on = today.day
            and app.has_organization_permission(
                  reservation.organization_id, 'front_desk.check_in')
                                                        as "mayUndoCheckIn",
          case when stay.status = 'in_house' then stay.id end
                                                        as "stayId",
          case when stay.status = 'in_house'
               then to_char(stay.starts_on, 'YYYY-MM-DD') end
                                                        as "stayStartsOn",
          folio.id                                      as "folioId",
          nights.count                                  as "stayNights",
          (nights.count * reservation.nightly_rate_minor)::text
                                                        as "totalMinor"
        from public.reservations as reservation
        join public.guests as guest
          on guest.id = reservation.guest_id
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        -- A room out of order or blocked covers its beds (ADR 0032).
        cross join lateral (
          select case
                   when room.status in ('out_of_service', 'blocked')
                    and unit.status not in ('out_of_service', 'blocked')
                     then room.status
                   else unit.status
                 end as status
        ) as unit_now
        -- Somebody else in the Unit: at most one, one in-house Stay per Unit
        -- being unique (ADR 0033).
        left join public.stays as occupant
          on occupant.accommodation_unit_id = reservation.accommodation_unit_id
         and occupant.status = 'in_house'
         and occupant.reservation_id is distinct from reservation.id
        left join public.stays as stay
          on stay.reservation_id = reservation.id
         and stay.status in ('in_house', 'departed')
        left join public.folios as folio
          on folio.stay_id = stay.id
         and folio.status = 'open'
         and stay.status = 'in_house'
        cross join lateral (
          select case
                   when reservation.status in ('cancelled', 'no_show')
                     then null
                   else (coalesce(stay.ends_on, reservation.ends_on)
                         - coalesce(stay.starts_on, reservation.starts_on))
                 end as count
        ) as nights
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
    return rows.map((row) => ({
      ...row,
      nightlyRateMinor:
        row.nightlyRateMinor === null ? null : Number(row.nightlyRateMinor),
      totalMinor: row.totalMinor === null ? null : Number(row.totalMinor),
    }));
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
    // An open-ended booking is the Resident's case (RG-S1-11): a short-term
    // Guest always has a planned departure, and an open-ended priced one would
    // hold the Unit and be charged a night every night until somebody noticed
    // (ADR 0038). `reservations_guest_has_a_departure` refuses the same row for
    // every writer; this is what names the field.
    if (endsOn === null && booking.stayType === "guest") {
      throw new ReservationPeriodError(
        "a Guest booking needs a departure date",
      );
    }

    const expectedArrival = expectedArrivalOf(booking.expectedArrival ?? null);

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
          and not exists (
            select 1 from public.accommodation_units as room
            where room.id = unit.parent_id
              and room.status in ('out_of_service', 'blocked')
          )
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
      let price: {
        nightlyRateMinor: number | null;
        rateCurrency: string | null;
      };
      try {
        const inserted = await tx.$queryRaw<
          {
            id: string;
            nightlyRateMinor: string | null;
            rateCurrency: string | null;
          }[]
        >`
          insert into public.reservations
            (organization_id, property_id, accommodation_unit_id,
             guest_id, stay_type, status, starts_on, ends_on,
             expected_arrival_time)
          values (
            ${unit.organizationId}::uuid,
            ${unit.propertyId}::uuid,
            ${booking.accommodationUnitId}::uuid,
            ${guest.guestId}::uuid,
            ${booking.stayType},
            'confirmed',
            ${startsOn}::date,
            ${endsOn}::date,
            ${expectedArrival}::time
          )
          returning id,
                    nightly_rate_minor::text as "nightlyRateMinor",
                    trim(rate_currency)      as "rateCurrency"
        `;
        const [row] = inserted;
        if (!row) {
          // Reachable only if reservations_insert_front_desk denied after the
          // Unit query allowed it, which would mean the two disagree.
          throw new ReservationRefusedError("that booking cannot be taken");
        }
        reservationId = row.id;
        // Stamped by the database from the price list (ADR 0038); nothing
        // here chose it, and nothing could.
        price = {
          nightlyRateMinor:
            row.nightlyRateMinor === null ? null : Number(row.nightlyRateMinor),
          rateCurrency: row.rateCurrency,
        };
        // The price the Guest was quoted is the price they are charged: a
        // stamp that is not the quote — changed, cleared or gone stale while
        // the dialog was open — refuses the booking, and the throw rolls the
        // Guest and the Reservation back with it (RT-S2-12), as a check-out
        // that would charge nights it did not show is refused (RT-S3-07).
        if (
          price.nightlyRateMinor !== booking.quotedRateMinor ||
          price.rateCurrency !== booking.quotedCurrency
        ) {
          throw new PriceChangedError(
            "the price changed while the booking was taken",
          );
        }
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
        // Begun before the cutoff and committing after the day closed:
        // `reservations_want_an_open_day` refuses a booking that would start
        // on a finalized day (RG-S1-08). The dates are the thing to fix, and
        // pressing again measures them against the new business date.
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new ReservationPeriodError(
            "the business day closed while the booking was taken",
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
        locationId: unit.propertyId,
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
          // What the Guest was quoted, as the booking now holds it.
          amountMinor: price.nightlyRateMinor,
          currency: price.rateCurrency,
        },
      });

      return {
        reservationId,
        guestId: guest.guestId,
        guestCreated: guest.created,
        ...price,
      };
    });
  }

  /**
   * What changing a booking to these nights would do, on every Unit it could
   * move to (blueprint 18.6, AB-S1-07, AB-S1-08).
   *
   * A read, never a promise: the constraints and triggers decide on save, and
   * the integration suite saves every kind of option to show the two agree. It
   * asks for reach and not for `front_desk.amend`, because seeing what a change
   * would do is not making it; `mayAmend` on the lists says who may save.
   *
   * Each blocker mirrors a refusal: `booked` is `reservations_no_double_booking`
   * and `occupied` is `app.unit_holds_one_occupancy`, read with the same
   * `app.stay_holds` so an overstaying Guest blocks the nights they are still
   * in. Units out of service and rooms let by the bed are absent, as they are
   * from the booking dialog, because saving onto them is refused outright —
   * all but the booking's own, which the command lets change its dates, and
   * which is listed with `takesBookings` false.
   *
   * For a `requested` booking both blockers are stricter than saving, which
   * neither the constraint nor the trigger checks until it is confirmed. Kept:
   * the booking would be refused at confirmation for the same nights.
   */
  async function previewChange(
    userId: string,
    reservationId: string,
    startsOnInput: string,
    endsOnInput: string | null,
  ): Promise<ChangePreview> {
    const startsOn = calendarDay(startsOnInput);
    const endsOn = endsOnInput === null ? null : calendarDay(endsOnInput);
    if (!startsOn || (endsOnInput !== null && !endsOn)) {
      throw new ReservationPeriodError("those are not calendar dates");
    }
    if (endsOn !== null && endsOn <= startsOn) {
      throw new ReservationPeriodError(
        "a Reservation covers at least one night",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [booking] = await tx.$queryRaw<
        (Omit<ChangePreview, "nightlyRateMinor" | "options"> & {
          nightlyRateMinor: string | null;
          propertyId: string;
          unitType: string;
        })[]
      >`
        select
          reservation.id                                 as "reservationId",
          reservation.reference                          as "reference",
          reservation.stay_type                          as "stayType",
          to_char(reservation.starts_on, 'YYYY-MM-DD')   as "startsOn",
          to_char(reservation.ends_on, 'YYYY-MM-DD')     as "endsOn",
          to_char(reservation.expected_arrival_time, 'HH24:MI')
                                                         as "expectedArrival",
          reservation.accommodation_unit_id              as "unitId",
          reservation.nightly_rate_minor::text           as "nightlyRateMinor",
          trim(reservation.rate_currency)                as "rateCurrency",
          reservation.property_id                        as "propertyId",
          unit.unit_type                                 as "unitType",
          to_char(app.property_today(reservation.property_id),
                  'YYYY-MM-DD')                          as "today",
          (select count(*)::int from public.reservation_changes as change
            where change.reservation_id = reservation.id) as "version"
        from public.reservations as reservation
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        where reservation.id = ${reservationId}::uuid
          and reservation.status in ('requested', 'confirmed')
          and app.can_use_capability(
            reservation.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;
      if (!booking) {
        throw new BookingChangeError("that booking cannot be changed");
      }

      const options = await tx.$queryRaw<
        (Omit<ChangeOption, "nightlyRateMinor"> & {
          nightlyRateMinor: string | null;
        })[]
      >`
        with wanted as (
          select daterange(${startsOn}::date, ${endsOn}::date, '[)') as nights,
                 app.property_today(${booking.propertyId}::uuid)     as today
        )
        select
          unit.id                                  as "unitId",
          unit.name                                as "unitName",
          room.name                                as "roomName",
          unit.unit_type                           as "unitType",
          unit.unit_type = ${booking.unitType}     as "sameKind",
          unit.id = ${booking.unitId}::uuid         as "current",
          unit.status not in ('out_of_service', 'blocked')
            and (room.status is null
                 or room.status not in ('out_of_service', 'blocked'))
            and not exists (
              select 1 from public.accommodation_units as child
              where child.parent_id = unit.id
            )                                      as "takesBookings",
          case
            when conflict.reference is not null then 'booked'
            when occupant.id is not null        then 'occupied'
          end                                      as "blocker",
          conflict.reference                       as "conflictReference",
          case
            when unit.unit_type = ${booking.unitType}
              then ${booking.nightlyRateMinor}::bigint
            when ${booking.stayType} = 'guest' then rate.amount_minor
          end::text                                as "nightlyRateMinor",
          case
            when unit.unit_type = ${booking.unitType} then ${booking.rateCurrency}
            when ${booking.stayType} = 'guest' then trim(rate.currency)
          end                                      as "rateCurrency"
        from public.accommodation_units as unit
        cross join wanted
        join public.properties as property
          on property.id = unit.property_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        left join public.property_rates as rate
          on rate.property_id = unit.property_id
         and rate.unit_type = unit.unit_type
         and rate.amount_minor is not null
         and rate.currency = property.currency
        left join lateral (
          select other.reference
            from public.reservations as other
           where other.accommodation_unit_id = unit.id
             and other.status = 'confirmed'
             and other.id <> ${reservationId}::uuid
             and daterange(other.starts_on, other.ends_on, '[)') && wanted.nights
           order by other.starts_on
           limit 1
        ) as conflict on true
        left join lateral (
          select stay.id
            from public.stays as stay
           where stay.accommodation_unit_id = unit.id
             and stay.status in ('reserved', 'in_house')
             and stay.reservation_id is distinct from ${reservationId}::uuid
             and app.stay_holds(stay.status, stay.starts_on, stay.ends_on,
                                wanted.today) && wanted.nights
           limit 1
        ) as occupant on true
        where unit.property_id = ${booking.propertyId}::uuid
          and (
            unit.id = ${booking.unitId}::uuid
            or (
              unit.status not in ('out_of_service', 'blocked')
              and (room.status is null
                   or room.status not in ('out_of_service', 'blocked'))
              and not exists (
                select 1 from public.accommodation_units as child
                where child.parent_id = unit.id
              )
            )
          )
        order by
          conflict.reference is null and occupant.id is null desc,
          unit.unit_type = ${booking.unitType} desc,
          coalesce(room.name, unit.name), unit.name
      `;

      const minor = (value: string | null) =>
        value === null ? null : Number(value);
      return {
        reservationId: booking.reservationId,
        reference: booking.reference,
        stayType: booking.stayType,
        startsOn: booking.startsOn,
        endsOn: booking.endsOn,
        expectedArrival: booking.expectedArrival,
        unitId: booking.unitId,
        nightlyRateMinor: minor(booking.nightlyRateMinor),
        rateCurrency: booking.rateCurrency,
        today: booking.today,
        version: booking.version,
        options: options.map((option) => ({
          ...option,
          nightlyRateMinor: minor(option.nightlyRateMinor),
        })),
      };
    });
  }

  /**
   * Changes a booking that has not arrived: its nights, its Unit, its expected
   * arrival, or any of them (ADR 0039, amend-booking slice 1).
   *
   * The nights and the Unit are one call to `app.amend_reservation()`, which
   * checks the caller's gates and `front_desk.amend`, takes the locks, refuses
   * a stale version and writes the revision. ranza_app holds no grant on the
   * dates or the Unit, so there is no other way to make this change — the
   * module adds only what a database cannot say in a sentence: the quote
   * comparison, the event and the audit record.
   *
   * The expected arrival is a second command, `app.change_expected_arrival()`,
   * for a reason of locks and revisions: a time takes no night, so the Unit
   * locks of the first protect nothing it changes, and each change is its own
   * revision. When one save asks for both they share this transaction, the
   * nights first, and the time is sent against the version the nights left.
   * A save that asks for neither is still sent to `amend_reservation()`, which
   * refuses it as changing nothing.
   *
   * The price comes back from the row the command wrote. Only another kind of
   * Unit changes it; when it is not what the dialog quoted, the throw rolls the
   * change and its revision back together (AB-S1-03, RT-S2-12).
   */
  async function amendBooking(
    userId: string,
    change: BookingChange,
  ): Promise<AmendedBooking> {
    const startsOn = calendarDay(change.startsOn);
    const endsOn = change.endsOn === null ? null : calendarDay(change.endsOn);
    if (!startsOn || (change.endsOn !== null && !endsOn)) {
      throw new ReservationPeriodError("those are not calendar dates");
    }
    if (endsOn !== null && endsOn <= startsOn) {
      throw new ReservationPeriodError(
        "a Reservation covers at least one night",
      );
    }
    const expectedArrival =
      change.expectedArrival === undefined
        ? undefined
        : expectedArrivalOf(change.expectedArrival);
    const note = change.note?.trim() || null;
    // Counted in characters, as the audit record's check counts them: a
    // string's length counts UTF-16 units, and two emoji would read as four.
    const noteLength = note === null ? 0 : [...note].length;
    if (
      note !== null &&
      (noteLength < CHANGE_NOTE.min || noteLength > CHANGE_NOTE.max)
    ) {
      throw new ChangeNoteError(
        `a note is between ${CHANGE_NOTE.min} and ${CHANGE_NOTE.max} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [current] = await tx.$queryRaw<
        {
          startsOn: string;
          endsOn: string | null;
          unitId: string;
          expectedArrival: string | null;
          nightlyRateMinor: string | null;
          rateCurrency: string | null;
        }[]
      >`
        select to_char(reservation.starts_on, 'YYYY-MM-DD') as "startsOn",
               to_char(reservation.ends_on, 'YYYY-MM-DD')   as "endsOn",
               reservation.accommodation_unit_id            as "unitId",
               to_char(reservation.expected_arrival_time, 'HH24:MI')
                                                            as "expectedArrival",
               reservation.nightly_rate_minor::text         as "nightlyRateMinor",
               trim(reservation.rate_currency)              as "rateCurrency"
          from public.reservations as reservation
         where reservation.id = ${change.reservationId}::uuid
      `;
      if (!current) {
        throw new BookingChangeError("that booking cannot be changed");
      }

      const nightsChange =
        startsOn !== current.startsOn ||
        endsOn !== current.endsOn ||
        change.accommodationUnitId !== current.unitId;
      const timeChange =
        expectedArrival !== undefined &&
        expectedArrival !== current.expectedArrival;

      if (!timeChange) {
        return amendNightsWithin(tx, userId, change, startsOn, endsOn, note);
      }
      const nights = nightsChange
        ? await amendNightsWithin(tx, userId, change, startsOn, endsOn, note)
        : null;
      const revision = await changeExpectedArrivalWithin(tx, userId, {
        reservationId: change.reservationId,
        expectedArrival,
        version: change.version + (nights === null ? 0 : 1),
        note,
      });
      return (
        nights ?? {
          reservationId: change.reservationId,
          changeId: revision.changeId,
          nightlyRateMinor:
            current.nightlyRateMinor === null
              ? null
              : Number(current.nightlyRateMinor),
          rateCurrency: current.rateCurrency,
        }
      );
    });
  }

  /**
   * The nights and Unit half of `amendBooking`: one call to
   * `app.amend_reservation()`, the quote comparison, the event and the audit
   * record.
   */
  async function amendNightsWithin(
    tx: AuditClient,
    userId: string,
    change: BookingChange,
    startsOn: string,
    endsOn: string | null,
    note: string | null,
  ): Promise<AmendedBooking> {
    let amended: {
      changeId: string;
      organizationId: string;
      propertyId: string;
      fromUnitId: string;
      toUnitId: string;
      nightlyRateMinor: string | null;
      rateCurrency: string | null;
    };
    try {
      const [row] = await tx.$queryRaw<(typeof amended)[]>`
        select change_id              as "changeId",
               change_organization_id as "organizationId",
               change_property_id     as "propertyId",
               previous_unit_id       as "fromUnitId",
               current_unit_id        as "toUnitId",
               current_rate_minor     as "nightlyRateMinor",
               trim(current_rate_currency) as "rateCurrency"
          from app.amend_reservation(
            ${change.reservationId}::uuid,
            ${startsOn}::date,
            ${endsOn}::date,
            ${change.accommodationUnitId}::uuid,
            ${change.version}::int,
            ${note}
          )
      `;
      if (!row) {
        throw new BookingChangeError("that booking cannot be changed");
      }
      amended = row;
    } catch (error: unknown) {
      if (raised(error, CHANGED_SINCE_READ)) throw new BookingChangedError();
      if (raised(error, EXCLUSION_VIOLATION)) {
        throw new UnitUnavailableError(
          "that Accommodation Unit is booked for those nights",
        );
      }
      if (raised(error, UNIT_OCCUPIED)) {
        throw new UnitHasOccupantError(
          "that Accommodation Unit has somebody staying over those nights",
        );
      }
      if (raised(error, NOT_IN_PREREQUISITE_STATE)) {
        throw new UnitNotInServiceError(
          "that Accommodation Unit cannot take this booking",
        );
      }
      if (raised(error, CHECK_VIOLATION)) {
        throw new ReservationPeriodError(
          "those dates cannot be given to this booking",
        );
      }
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new BookingChangeError("that booking cannot be changed");
      }
      throw error;
    }

    const price = {
      nightlyRateMinor:
        amended.nightlyRateMinor === null
          ? null
          : Number(amended.nightlyRateMinor),
      rateCurrency: amended.rateCurrency,
    };
    if (
      price.nightlyRateMinor !== change.quotedRateMinor ||
      price.rateCurrency !== change.quotedCurrency
    ) {
      throw new PriceChangedError(
        "the price changed while the booking was changed",
      );
    }

    // Ids only, like reservation.created, and nothing subscribes yet: a
    // confirmation of the new dates is the handler this will carry.
    await publishWithin(tx, {
      organizationId: amended.organizationId,
      eventType: "reservation.amended",
      payload: {
        reservationId: change.reservationId,
        changeId: amended.changeId,
        propertyId: amended.propertyId,
        accommodationUnitId: amended.toUnitId,
      },
    });

    const [revision] = await tx.$queryRaw<
      {
        fromStartsOn: string;
        toStartsOn: string;
        fromEndsOn: string | null;
        toEndsOn: string | null;
        fromRateMinor: string | null;
      }[]
    >`
      select to_char(from_starts_on, 'YYYY-MM-DD') as "fromStartsOn",
             to_char(to_starts_on, 'YYYY-MM-DD')   as "toStartsOn",
             to_char(from_ends_on, 'YYYY-MM-DD')   as "fromEndsOn",
             to_char(to_ends_on, 'YYYY-MM-DD')     as "toEndsOn",
             from_rate_minor::text                 as "fromRateMinor"
        from public.reservation_changes
       where id = ${amended.changeId}::uuid
    `;

    await recordWithin(tx, {
      organizationId: amended.organizationId,
      locationId: amended.propertyId,
      actorId: userId,
      action: "reservation.amended",
      subjectType: "reservation",
      subjectId: change.reservationId,
      ...(note === null ? {} : { reason: note }),
      context: {
        changeId: amended.changeId,
        fromStartsOn: revision?.fromStartsOn ?? null,
        toStartsOn: revision?.toStartsOn ?? null,
        fromEndsOn: revision?.fromEndsOn ?? null,
        toEndsOn: revision?.toEndsOn ?? null,
        fromUnitId: amended.fromUnitId,
        toUnitId: amended.toUnitId,
        fromAmountMinor:
          revision?.fromRateMinor == null
            ? null
            : Number(revision.fromRateMinor),
        amountMinor: price.nightlyRateMinor,
        currency: price.rateCurrency,
      },
    });

    return {
      reservationId: change.reservationId,
      changeId: amended.changeId,
      ...price,
    };
  }

  /**
   * The expected arrival half of `amendBooking`: one call to
   * `app.change_expected_arrival()` and the audit record of what was changed.
   * `expectedArrival` null clears the time.
   */
  async function changeExpectedArrivalWithin(
    tx: AuditClient,
    userId: string,
    change: {
      reservationId: string;
      expectedArrival: string | null;
      version: number;
      note: string | null;
    },
  ): Promise<{ changeId: string }> {
    let revised: {
      changeId: string;
      organizationId: string;
      propertyId: string;
    };
    try {
      const [row] = await tx.$queryRaw<(typeof revised)[]>`
        select change_id              as "changeId",
               change_organization_id as "organizationId",
               change_property_id     as "propertyId"
          from app.change_expected_arrival(
            ${change.reservationId}::uuid,
            ${change.expectedArrival}::time,
            ${change.version}::int,
            ${change.note}
          )
      `;
      if (!row) {
        throw new BookingChangeError("that booking cannot be changed");
      }
      revised = row;
    } catch (error: unknown) {
      // A no-op can only be reached by a race: somebody saved the same time
      // after this change was read, and the desk reads the booking again.
      if (raised(error, CHANGED_SINCE_READ) || raised(error, CHECK_VIOLATION)) {
        throw new BookingChangedError();
      }
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new BookingChangeError("that booking cannot be changed");
      }
      throw error;
    }

    const [revision] = await tx.$queryRaw<
      { fromTime: string | null; toTime: string | null }[]
    >`
      select to_char(from_expected_arrival_time, 'HH24:MI') as "fromTime",
             to_char(to_expected_arrival_time, 'HH24:MI')   as "toTime"
        from public.reservation_changes
       where id = ${revised.changeId}::uuid
    `;

    await recordWithin(tx, {
      organizationId: revised.organizationId,
      locationId: revised.propertyId,
      actorId: userId,
      action: "reservation.arrival_time_changed",
      subjectType: "reservation",
      subjectId: change.reservationId,
      ...(change.note === null ? {} : { reason: change.note }),
      context: {
        changeId: revised.changeId,
        fromTime: revision?.fromTime ?? null,
        toTime: revision?.toTime ?? null,
      },
    });

    return { changeId: revised.changeId };
  }

  /**
   * What changing an in-house Guest's departure to `endsOnInput` would do
   * (amend-booking slice 2): whether a confirmed booking holds a night it would
   * add, read as `app.unit_holds_one_occupancy` reads it — the Stay's nights
   * from `app.stay_holds`, so an overdue Guest holds tonight — and what a
   * night costs, which is the booking's own price.
   *
   * A read, never a promise: the trigger decides on save. Reach alone, like
   * `previewChange`; `mayAmend` on the departures list says who may save.
   */
  async function previewDeparture(
    userId: string,
    stayId: string,
    endsOnInput: string | null,
  ): Promise<DeparturePreview> {
    const endsOn = endsOnInput === null ? null : calendarDay(endsOnInput);
    if (endsOnInput !== null && !endsOn) {
      throw new ReservationPeriodError("that is not a calendar date");
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<
        (Omit<DeparturePreview, "nightlyRateMinor"> & {
          nightlyRateMinor: string | null;
        })[]
      >`
        select
          stay.id                                        as "stayId",
          reservation.reference                          as "reference",
          stay.stay_type                                 as "stayType",
          to_char(stay.starts_on, 'YYYY-MM-DD')          as "startsOn",
          to_char(stay.ends_on, 'YYYY-MM-DD')            as "endsOn",
          stay.accommodation_unit_id                     as "unitId",
          reservation.nightly_rate_minor::text           as "nightlyRateMinor",
          trim(reservation.rate_currency)                as "rateCurrency",
          to_char(today.day, 'YYYY-MM-DD')               as "today",
          (select count(*)::int from public.reservation_changes as change
            where change.reservation_id = reservation.id) as "version",
          case when conflict.reference is not null then 'booked' end
                                                         as "blocker",
          conflict.reference                             as "conflictReference"
        from public.stays as stay
        join public.reservations as reservation
          on reservation.id = stay.reservation_id
        cross join lateral (
          select app.property_today(stay.property_id) as day
        ) as today
        left join lateral (
          select other.reference
            from public.reservations as other
           where other.accommodation_unit_id = stay.accommodation_unit_id
             and other.status = 'confirmed'
             and other.id <> reservation.id
             and daterange(other.starts_on, other.ends_on, '[)')
                 && app.stay_holds('in_house', stay.starts_on,
                                   ${endsOn}::date, today.day)
           order by other.starts_on
           limit 1
        ) as conflict on true
        where stay.id = ${stayId}::uuid
          and stay.status = 'in_house'
          and app.can_use_capability(
            stay.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;
      if (!row) throw new BookingChangeError("that Stay cannot be changed");
      return {
        ...row,
        nightlyRateMinor:
          row.nightlyRateMinor === null ? null : Number(row.nightlyRateMinor),
      };
    });
  }

  /**
   * Changes an in-house Guest's planned departure, and their booking's with it
   * (ADR 0039, amend-booking slice 2).
   *
   * One call to `app.change_departure()`, which checks the caller, takes the
   * Unit, day and Stay locks in check-out's order, refuses a stale version and
   * writes the revision. No price is compared: nothing here re-prices, and the
   * extra nights are charged at the booking's own price as each one closes.
   */
  async function changeDeparture(
    userId: string,
    change: DepartureChange,
  ): Promise<ChangedDeparture> {
    const endsOn = change.endsOn === null ? null : calendarDay(change.endsOn);
    if (change.endsOn !== null && !endsOn) {
      throw new ReservationPeriodError("that is not a calendar date");
    }
    const note = change.note?.trim() || null;
    const noteLength = note === null ? 0 : [...note].length;
    if (
      note !== null &&
      (noteLength < CHANGE_NOTE.min || noteLength > CHANGE_NOTE.max)
    ) {
      throw new ChangeNoteError(
        `a note is between ${CHANGE_NOTE.min} and ${CHANGE_NOTE.max} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: {
        changeId: string;
        organizationId: string;
        propertyId: string;
        reservationId: string;
        unitId: string;
      };
      try {
        const [row] = await tx.$queryRaw<(typeof changed)[]>`
          select change_id              as "changeId",
                 change_organization_id as "organizationId",
                 change_property_id     as "propertyId",
                 change_reservation_id  as "reservationId",
                 change_unit_id         as "unitId"
            from app.change_departure(
              ${change.stayId}::uuid,
              ${endsOn}::date,
              ${change.version}::int,
              ${note}
            )
        `;
        if (!row) throw new BookingChangeError("that Stay cannot be changed");
        changed = row;
      } catch (error: unknown) {
        if (raised(error, CHANGED_SINCE_READ)) throw new BookingChangedError();
        if (raised(error, UNIT_OCCUPIED)) {
          throw new UnitHasOccupantError(
            "that Accommodation Unit is promised to another booking over those nights",
          );
        }
        if (raised(error, CHECK_VIOLATION)) {
          throw new ReservationPeriodError(
            "a departure is tomorrow or later, and a Guest's Stay has one",
          );
        }
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new BookingChangeError("that Stay cannot be changed");
        }
        throw error;
      }

      // Ids only. Nothing subscribes: housekeeping reads the planned end when
      // it plans the day, and a confirmation to the Guest is a later handler.
      await publishWithin(tx, {
        organizationId: changed.organizationId,
        eventType: "stay.departure_changed",
        payload: {
          stayId: change.stayId,
          reservationId: changed.reservationId,
          changeId: changed.changeId,
          propertyId: changed.propertyId,
        },
      });

      const [revision] = await tx.$queryRaw<
        { fromEndsOn: string | null; toEndsOn: string | null }[]
      >`
        select to_char(from_ends_on, 'YYYY-MM-DD') as "fromEndsOn",
               to_char(to_ends_on, 'YYYY-MM-DD')   as "toEndsOn"
          from public.reservation_changes
         where id = ${changed.changeId}::uuid
      `;

      await recordWithin(tx, {
        organizationId: changed.organizationId,
        locationId: changed.propertyId,
        actorId: userId,
        action: "stay.departure_changed",
        subjectType: "stay",
        subjectId: change.stayId,
        ...(note === null ? {} : { reason: note }),
        context: {
          changeId: changed.changeId,
          reservationId: changed.reservationId,
          fromEndsOn: revision?.fromEndsOn ?? null,
          toEndsOn: revision?.toEndsOn ?? null,
        },
      });

      return { stayId: change.stayId, changeId: changed.changeId };
    });
  }

  /**
   * Where an in-house Guest could be moved (amend-booking slice 3): every Unit
   * of the Property that takes a Stay, with what would refuse the move there.
   *
   * Each blocker mirrors a refusal: `booked` is `app.unit_holds_one_occupancy`,
   * which compares the Stay's whole plan — `app.stay_holds` from its first
   * night — with the confirmed bookings on the new Unit; `occupied` is
   * `stays_no_double_booking`, somebody else in house there. `ready` is
   * `app.unit_is_ready`, which the command asks too. Out-of-service Units and
   * rooms let by the bed are absent, as from every other picker.
   */
  async function previewMove(
    userId: string,
    stayId: string,
  ): Promise<MovePreview> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [stay] = await tx.$queryRaw<
        (Omit<MovePreview, "nightlyRateMinor" | "options"> & {
          nightlyRateMinor: string | null;
          propertyId: string;
        })[]
      >`
        select
          stay.id                                        as "stayId",
          reservation.reference                          as "reference",
          stay.accommodation_unit_id                     as "unitId",
          unit.unit_type                                 as "unitType",
          to_char(stay.starts_on, 'YYYY-MM-DD')          as "startsOn",
          to_char(stay.ends_on, 'YYYY-MM-DD')            as "endsOn",
          reservation.nightly_rate_minor::text           as "nightlyRateMinor",
          trim(reservation.rate_currency)                as "rateCurrency",
          stay.property_id                               as "propertyId",
          (select count(*)::int from public.reservation_changes as change
            where change.reservation_id = reservation.id) as "version"
        from public.stays as stay
        join public.reservations as reservation
          on reservation.id = stay.reservation_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        where stay.id = ${stayId}::uuid
          and stay.status = 'in_house'
          and app.can_use_capability(
            stay.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;
      if (!stay) throw new BookingChangeError("that Stay cannot be changed");

      const options = await tx.$queryRaw<MoveOption[]>`
        with moving as (
          select stay.id, stay.reservation_id,
                 app.stay_holds(stay.status, stay.starts_on, stay.ends_on,
                                app.property_today(stay.property_id)) as nights
            from public.stays as stay
           where stay.id = ${stayId}::uuid
        )
        select
          unit.id                                  as "unitId",
          unit.name                                as "unitName",
          room.name                                as "roomName",
          unit.unit_type                           as "unitType",
          unit.unit_type = ${stay.unitType}        as "sameKind",
          case
            when occupant.id is not null        then 'occupied'
            when conflict.reference is not null then 'booked'
          end                                      as "blocker",
          conflict.reference                       as "conflictReference",
          app.unit_is_ready(unit.id)               as "ready"
        from public.accommodation_units as unit
        cross join moving
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        left join lateral (
          select other.reference
            from public.reservations as other
           where other.accommodation_unit_id = unit.id
             and other.status = 'confirmed'
             and other.id is distinct from moving.reservation_id
             and daterange(other.starts_on, other.ends_on, '[)') && moving.nights
           order by other.starts_on
           limit 1
        ) as conflict on true
        left join lateral (
          select other.id
            from public.stays as other
           where other.accommodation_unit_id = unit.id
             and other.status = 'in_house'
             and other.id <> moving.id
           limit 1
        ) as occupant on true
        where unit.property_id = ${stay.propertyId}::uuid
          and unit.id <> ${stay.unitId}::uuid
          and unit.status not in ('out_of_service', 'blocked')
          and (room.status is null
               or room.status not in ('out_of_service', 'blocked'))
          and not exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )
        order by
          occupant.id is null and conflict.reference is null
            and app.unit_is_ready(unit.id) desc,
          unit.unit_type = ${stay.unitType} desc,
          coalesce(room.name, unit.name), unit.name
      `;

      return {
        stayId: stay.stayId,
        reference: stay.reference,
        unitId: stay.unitId,
        unitType: stay.unitType,
        startsOn: stay.startsOn,
        endsOn: stay.endsOn,
        nightlyRateMinor:
          stay.nightlyRateMinor === null ? null : Number(stay.nightlyRateMinor),
        rateCurrency: stay.rateCurrency,
        version: stay.version,
        options,
      };
    });
  }

  /**
   * Moves an in-house Guest to another Unit (ADR 0039, amend-booking slice 3).
   *
   * One call to `app.move_stay()`, which checks the caller, takes both Units'
   * locks in hashed order, refuses a stale version and a room not ready, and
   * writes the revision; the Stay, its Folio and its price go with the Guest.
   * `stay.moved` names the revision, and the worker reads which room was left
   * from it to mark the room dirty (AB-S3-08).
   */
  async function moveGuest(
    userId: string,
    move: GuestMove,
  ): Promise<MovedGuest> {
    if (!(MOVE_REASONS as readonly string[]).includes(move.reason)) {
      throw new BookingChangeError("a move says why");
    }
    const note = move.note?.trim() || null;
    const noteLength = note === null ? 0 : [...note].length;
    if (
      (move.reason === "other" && note === null) ||
      (note !== null &&
        (noteLength < CHANGE_NOTE.min || noteLength > CHANGE_NOTE.max))
    ) {
      throw new ChangeNoteError(
        `a note is between ${CHANGE_NOTE.min} and ${CHANGE_NOTE.max} characters, and "other" needs one`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let moved: {
        changeId: string;
        organizationId: string;
        propertyId: string;
        reservationId: string;
        fromUnitId: string;
        toUnitId: string;
      };
      try {
        const [row] = await tx.$queryRaw<(typeof moved)[]>`
          select change_id              as "changeId",
                 change_organization_id as "organizationId",
                 change_property_id     as "propertyId",
                 change_reservation_id  as "reservationId",
                 previous_unit_id       as "fromUnitId",
                 current_unit_id        as "toUnitId"
            from app.move_stay(
              ${move.stayId}::uuid,
              ${move.accommodationUnitId}::uuid,
              ${move.reason},
              ${note},
              ${move.version}::int
            )
        `;
        if (!row) throw new BookingChangeError("that Stay cannot be changed");
        moved = row;
      } catch (error: unknown) {
        if (raised(error, CHANGED_SINCE_READ)) throw new BookingChangedError();
        if (raised(error, UNIT_NOT_READY)) throw new UnitNotReadyError();
        if (raised(error, UNIT_OCCUPIED)) {
          throw new UnitUnavailableError(
            "that Accommodation Unit is promised to another booking over those nights",
          );
        }
        // stays_no_double_booking, or the one-in-house index: somebody else
        // is staying there.
        if (
          raised(error, EXCLUSION_VIOLATION) ||
          raised(error, UNIQUE_VIOLATION)
        ) {
          throw new UnitHasOccupantError(
            "that Accommodation Unit has somebody staying in it",
          );
        }
        if (raised(error, NOT_IN_PREREQUISITE_STATE)) {
          throw new UnitNotInServiceError(
            "that Accommodation Unit cannot take this Guest",
          );
        }
        if (
          raised(error, INSUFFICIENT_PRIVILEGE) ||
          raised(error, CHECK_VIOLATION)
        ) {
          throw new BookingChangeError("that Guest cannot be moved there");
        }
        throw error;
      }

      // Ids only; the worker reads the revision, never a room from here.
      await publishWithin(tx, {
        organizationId: moved.organizationId,
        eventType: "stay.moved",
        payload: {
          stayId: move.stayId,
          reservationId: moved.reservationId,
          changeId: moved.changeId,
          propertyId: moved.propertyId,
        },
      });

      await recordWithin(tx, {
        organizationId: moved.organizationId,
        locationId: moved.propertyId,
        actorId: userId,
        action: "stay.moved",
        subjectType: "stay",
        subjectId: move.stayId,
        reason: note === null ? move.reason : `${move.reason}: ${note}`,
        context: {
          changeId: moved.changeId,
          reservationId: moved.reservationId,
          fromUnitId: moved.fromUnitId,
          toUnitId: moved.toUnitId,
          reasonKind: move.reason,
        },
      });

      return { stayId: move.stayId, changeId: moved.changeId };
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
        // Filed at its Property, like every Reservation record (ADR 0031).
        locationId: row.propertyId,
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

  /**
   * The room calendar: every Unit at a Property against a window of days, with
   * each booking and Stay as a bar (RANZ-25).
   *
   * One statement, deliberately. The transaction is READ COMMITTED, so reading
   * the Units and then the bars as two statements could straddle a check-in and
   * draw its Guest twice or not at all (RC-S1-02) — the reason `listUnits` is
   * one statement too. `mayAmend` is a second, separate read: it is the
   * viewer's permission, not a fact about any bar, so it needs no snapshot in
   * common with them.
   *
   * What it shows and does not hide:
   * - A checked-in Reservation is drawn once, as its Stay. The Reservation
   *   predicate is an allow-list of requested and confirmed, so whatever
   *   status a Reservation moves to after check-in draws nothing of its own.
   * - The nights a Stay holds are `app.stay_holds`: its plan, through tonight
   *   once it is overdue because the Guest is still in the Unit (RC-S1-15),
   *   and without end while open-ended. One leaving today ends today
   *   (RC-S1-16).
   * - Overlaps. `unit_holds_one_occupancy` now refuses a booking over a Guest
   *   in house, so one can no longer be made. It still arises when an in-house
   *   Guest stays past their date into a night already booked — the day passing
   *   writes nothing a trigger could refuse — and in rows written before that
   *   trigger. Both bars come back and the overlap is marked, never filtered.
   * - Readiness is housekeeping's (`app.unit_housekeeping_state`) and is not
   *   drawn: a room waiting to be cleaned is still free to book tonight.
   *
   * Days are `app.property_today` — the business date (ADR 0021) — and
   * nothing else is asked what day it is.
   *
   * The commercial gates are in the predicate; reach is the policies'. A
   * Property the caller cannot reach, or one whose Organization lost the
   * Entitlement, returns no Units rather than a refusal (RC-S1-42, RC-S1-43).
   */
  async function listRoomCalendar(
    userId: string,
    propertyId: string,
    window: RoomCalendarWindow,
  ): Promise<RoomCalendar> {
    const from = window.from === null ? null : calendarDay(window.from);
    const days = calendarLength(window.days);
    const { rows, may } = await withOrganizationContext(
      deps.db,
      { userId },
      async (tx) => {
        const rows = await tx.$queryRaw<CalendarUnitRow[]>`
        select
          unit.id                               as "unitId",
          unit.parent_id                        as "parentId",
          unit.name                             as "name",
          unit.unit_type                        as "unitType",
          unit.building                         as "building",
          unit.floor                            as "floor",
          -- A room out of order or blocked covers its beds (ADR 0032,
          -- MT-S2-06), as on Arrivals and in what may be booked.
          case
            when room.status in ('out_of_service', 'blocked')
             and unit.status not in ('out_of_service', 'blocked')
            then room.status
            else unit.status
          end                                   as "status",
          case
            when room.status in ('out_of_service', 'blocked')
             and unit.status not in ('out_of_service', 'blocked')
            then room.status_reason
            else unit.status_reason
          end                                   as "statusReason",
          exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )                                     as "hasChildren",
          to_char(win.today, 'YYYY-MM-DD')      as "today",
          to_char(win.first_day, 'YYYY-MM-DD')  as "firstDay",
          coalesce(bars.list, '[]'::json)       as "bars"
        from public.accommodation_units as unit
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        cross join (
          select day.today, first.day as first_day,
                 first.day + ${days}::int as end_day
          from (
            select app.property_today(${propertyId}::uuid) as today
          ) as day
          cross join lateral (
            select coalesce(
              ${from}::date,
              day.today - ${ROOM_CALENDAR_LEAD_DAYS}::int
            ) as day
          ) as first
        ) as win
        left join lateral (
          select json_agg(bar order by bar."startsOn") as list
          from (
            select
              'reservation'                               as kind,
              reservation.id                              as "reservationId",
              null::uuid                                  as "stayId",
              reservation.status::text                    as status,
              reservation.stay_type::text                 as "stayType",
              guest.full_name                             as "guestName",
              to_char(reservation.starts_on, 'YYYY-MM-DD') as "startsOn",
              to_char(reservation.ends_on, 'YYYY-MM-DD')  as "endsOn",
              to_char(reservation.ends_on, 'YYYY-MM-DD')  as "heldUntil",
              false                                       as overdue,
              null::text                                  as "bookedStartsOn",
              null::text                                  as "bookedEndsOn",
              null::int                                   as "balanceMinor",
              null::text                                  as currency,
              null::boolean                               as "folioClosed",
              null::boolean                               as current,
              null::text                                  as "arrivedOn"
            from public.reservations as reservation
            join public.guests as guest
              on guest.id = reservation.guest_id
            where reservation.accommodation_unit_id = unit.id
              and reservation.status in ('requested', 'confirmed')
              and daterange(reservation.starts_on, reservation.ends_on, '[)')
                  && daterange(win.first_day, win.end_day, '[)')
            union all
            -- One bar per stretch of a Stay in this Unit (AB-S3-06): a Guest
            -- moved from here has their nights before the move drawn here,
            -- ended as a departure is, and the rest on the Unit they are in.
            -- A Stay never moved is one stretch, drawn exactly as before.
            select
              'stay',
              stay.reservation_id,
              stay.id,
              (case when seg.is_last then stay.status else 'departed' end)::text,
              stay.stay_type::text,
              guest.full_name,
              to_char(seg.starts_on, 'YYYY-MM-DD'),
              to_char(seg.ends_on, 'YYYY-MM-DD'),
              to_char(upper(held.nights), 'YYYY-MM-DD'),
              -- Coalesced: with no end date the comparison is null, and a
              -- Stay with no end date is never overdue.
              coalesce(seg.is_last and stay.status = 'in_house'
                       and stay.ends_on < win.today, false),
              case when seg.is_last then to_char(reservation.starts_on, 'YYYY-MM-DD') end,
              case when seg.is_last then to_char(reservation.ends_on, 'YYYY-MM-DD') end,
              case when folio.id is null or not seg.is_last then null else coalesce(
                (
                  select sum(line.amount_minor)
                  from public.folio_lines as line
                  where line.folio_id = folio.id
                ),
                0
              )::int end,
              case when seg.is_last then folio.currency::text end,
              case when seg.is_last then folio.status = 'closed' end,
              seg.is_last,
              to_char(stay.starts_on, 'YYYY-MM-DD')
            from public.stays as stay
            cross join lateral app.stay_unit_segments(stay.id) as seg
            -- Left, because a Stay that began without a Reservation has no
            -- Guest recorded anywhere; it is drawn without a name (RC-S1-22).
            left join public.reservations as reservation
              on reservation.id = stay.reservation_id
            left join public.guests as guest
              on guest.id = reservation.guest_id
            left join public.folios as folio
              on folio.stay_id = stay.id
            -- The nights a Stay holds are the database's to say, not this
            -- read's: app.stay_holds is what unit_holds_one_occupancy refuses
            -- bookings against, so the calendar and the refusal agree.
            cross join lateral (
              select app.stay_holds(
                case when seg.is_last then stay.status else 'departed' end,
                seg.starts_on, seg.ends_on, win.today
              ) as nights
            ) as held
            -- The Stays ever in this Unit: those in it now, and those moved
            -- out of it, each found by its own index rather than one OR that
            -- can use neither. Then only those whose nights can reach the
            -- window, before any is cut into stretches: a departed Stay's
            -- stretches all lie inside its own dates.
            where stay.id in (
                    -- Split by status so each half matches a partial index on
                    -- stays; with no status the Unit alone matches none.
                    select current.id from public.stays as current
                     where current.accommodation_unit_id = unit.id
                       and current.status = 'in_house'
                    union all
                    select departed.id from public.stays as departed
                     where departed.accommodation_unit_id = unit.id
                       and departed.status = 'departed'
                       and departed.ends_on > win.first_day
                    union
                    select change.stay_id from public.reservation_changes as change
                     where change.kind = 'moved'
                       and change.from_unit_id = unit.id
                  )
              and stay.starts_on < win.end_day
              and (stay.status = 'in_house' or stay.ends_on > win.first_day)
              and seg.accommodation_unit_id = unit.id
              and stay.status in ('in_house', 'departed')
              -- The range itself, never one rebuilt from its bounds: a same-day
              -- check-out is the empty range [d,d), whose upper bound reads as
              -- null — which rebuilt would be a Stay without end. Empty
              -- overlaps nothing, so it is not drawn (RC-S1-19).
              and held.nights && daterange(win.first_day, win.end_day, '[)')
          ) as bar
        ) as bars on true
        where unit.property_id = ${propertyId}::uuid
          and app.can_use_capability(
            unit.property_id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;
        // Whether the drawer offers to change a Guest's departure: one
        // Organization's permission, not a property of any bar.
        const may = await tx.$queryRaw<{ mayAmend: boolean }[]>`
          select app.has_organization_permission(
                   property.organization_id, 'front_desk.amend') as "mayAmend"
            from public.properties as property
           where property.id = ${propertyId}::uuid
        `;
        return { rows, may };
      },
    );
    return {
      ...buildRoomCalendar(rows, { from, days }),
      mayAmend: may[0]?.mayAmend ?? false,
    };
  }

  return {
    amendBooking,
    changeDeparture,
    createReservation,
    listArrivals,
    bookingDay,
    listBookableUnits,
    listUnavailableUnits,
    listDepartures,
    countDepartedToday,
    listReservations,
    moveGuest,
    previewChange,
    previewDeparture,
    previewMove,
    listRoomCalendar,
    checkIn,
    checkOut,
    reverseCheckIn,
    cancelReservation,
    markNoShow,
  };
}

export type ReservationsModule = ReturnType<typeof createReservationsModule>;
