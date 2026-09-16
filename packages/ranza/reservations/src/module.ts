import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  CheckInError,
  FRONT_DESK_CAPABILITY,
  UnitUnavailableError,
  type Arrival,
  type CheckedIn,
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
 * Whether a failure is the Unit already being taken.
 *
 * Read from the SQLSTATE rather than from the constraint's name, so renaming the
 * constraint cannot silently turn this into a generic failure.
 *
 * Prisma reports a raw-query failure as P2010 and carries the real code inside
 * `meta`, so that nested path is the first place to look. The message is checked
 * too, because the shape of `meta` is Prisma's private arrangement and has
 * already changed once — and the cost of being wrong is asymmetric. Missing the
 * code reports "that Unit is occupied" as an unexplained error; there is no
 * false positive, because nothing else in this transaction can raise 23P01.
 */
function isUnitTaken(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === EXCLUSION_VIOLATION ||
    (typeof message === "string" && message.includes(EXCLUSION_VIOLATION))
  );
}

interface MovedReservation {
  organizationId: string;
  propertyId: string;
  accommodationUnitId: string;
  stayType: string;
  startsOn: Date;
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
              = (now() at time zone property.timezone)::date
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
        returning
          organization_id       as "organizationId",
          property_id           as "propertyId",
          accommodation_unit_id as "accommodationUnitId",
          stay_type             as "stayType",
          starts_on             as "startsOn",
          ends_on               as "endsOn"
      `;

      const [reservation] = moved;
      if (!reservation) {
        // Out of reach, already checked in, cancelled, or never existed. One
        // message for all four: telling them apart would confirm that a
        // Reservation the caller cannot see is there.
        throw new CheckInError("that Reservation cannot be checked in");
      }

      // Every column comes from the row the update returned, never from the
      // caller. The composite foreign keys then prove what would otherwise be an
      // application promise: the Stay is in the same Property and Organization
      // as the Reservation it came from, and on a Unit that is in that Property.
      let created: { id: string }[];
      try {
        created = await tx.$queryRaw<{ id: string }[]>`
          insert into public.stays
            (organization_id, property_id, accommodation_unit_id, reservation_id,
             stay_type, status, starts_on, ends_on)
          values (
            ${reservation.organizationId}::uuid,
            ${reservation.propertyId}::uuid,
            ${reservation.accommodationUnitId}::uuid,
            ${reservationId}::uuid,
            ${reservation.stayType},
            'in_house',
            ${reservation.startsOn}::date,
            ${reservation.endsOn}::date
          )
          returning id
        `;
      } catch (error: unknown) {
        // The exclusion constraint refused: another current Stay holds this Unit
        // over these nights. Worth its own type because it is the one failure
        // here a front desk can act on — the others are all "you cannot".
        if (isUnitTaken(error)) {
          throw new UnitUnavailableError(
            "that Accommodation Unit is occupied for those nights",
          );
        }
        throw error;
      }

      const [stay] = created;
      if (!stay) {
        // Reachable only if the insert policy denied: the actor moved a
        // Reservation they may read but may not write a Stay for.
        throw new CheckInError("the Stay was not created");
      }

      // Same transaction as the two writes above, so an action that happened
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
          stayId: stay.id,
          accommodationUnitId: reservation.accommodationUnitId,
        },
      });

      return { reservationId, stayId: stay.id };
    });
  }

  return { listArrivals, checkIn };
}

export type ReservationsModule = ReturnType<typeof createReservationsModule>;
