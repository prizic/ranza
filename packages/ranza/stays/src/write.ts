import type { TenantClient } from "@ranza/db";
import type { StayType } from "./contracts";

/**
 * The two ways a Stay changes, for a caller that owns the transaction.
 *
 * This module owns the `stays` table, and the tier rule is that no other module
 * writes to it. Front Office needs to — a check-in creates a Stay and a
 * check-out ends one — so it goes through these rather than issuing its own SQL,
 * which is what keeps the rule true rather than merely stated.
 *
 * They take the transaction instead of opening one, for the same reason
 * `recordWithin` in the audit module does: a check-in creates the Stay, moves
 * the Reservation and records the actor, and those three have to share one
 * fate. A function that opened its own transaction could not be part of that.
 *
 * The caller is responsible for the request context. Without one the policies
 * see a null acting user and deny, which is the safe direction.
 */

/** The transaction surface these statements need. */
export interface StayWriteClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export class StayWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StayWriteError";
  }
}

export interface OpenStay {
  organizationId: string;
  propertyId: string;
  accommodationUnitId: string;
  /** The Reservation this came from, when there was one. */
  reservationId: string | null;
  stayType: StayType;
  startsOn: Date;
  endsOn: Date | null;
}

/**
 * Puts somebody in a Unit.
 *
 * `stays_no_double_booking` decides whether this is allowed, not a check here:
 * two concurrent callers both reading "free" and both inserting is exactly the
 * race an exclusion constraint has no window for.
 */
export async function openStayWithin(
  tx: StayWriteClient,
  stay: OpenStay,
): Promise<{ stayId: string }> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    values (
      ${stay.organizationId}::uuid,
      ${stay.propertyId}::uuid,
      ${stay.accommodationUnitId}::uuid,
      ${stay.reservationId}::uuid,
      ${stay.stayType},
      'in_house',
      ${stay.startsOn}::date,
      ${stay.endsOn}::date
    )
    returning id
  `;

  const [row] = rows;
  if (!row) {
    // Reachable only if the insert policy denied: the actor cannot write a Stay
    // into that Property.
    throw new StayWriteError("the Stay was not created");
  }
  return { stayId: row.id };
}

/**
 * Ends a Stay, and with it the Unit's occupancy.
 *
 * `ends_on` is set to the departure date rather than left at the planned one. A
 * long-term Resident's Stay is open-ended, so without this a departed Stay
 * would never record when it ended; and a Guest who leaves early did leave
 * early. The planned period is the Reservation's, which is unchanged.
 *
 * Only `in_house` moves. A Stay that is already departed stays departed, and
 * the caller learns that from the absent row rather than from a second read —
 * the predicate is re-evaluated after any concurrent transaction holding the
 * row lock commits, so two people pressing the button produce one departure.
 */
export async function closeStayWithin(
  tx: StayWriteClient,
  stayId: string,
  departedOn: Date,
): Promise<{
  organizationId: string;
  propertyId: string;
  accommodationUnitId: string;
}> {
  const rows = await tx.$queryRaw<
    {
      organizationId: string;
      propertyId: string;
      accommodationUnitId: string;
    }[]
  >`
    update public.stays
       set status = 'departed',
           ends_on = ${departedOn}::date,
           updated_at = now()
     where id = ${stayId}::uuid
       and status = 'in_house'
    returning
      organization_id       as "organizationId",
      property_id           as "propertyId",
      accommodation_unit_id as "accommodationUnitId"
  `;

  const [row] = rows;
  if (!row) {
    throw new StayWriteError("that Stay cannot be checked out");
  }
  return row;
}

/**
 * Withdraws a Stay that should never have started.
 *
 * `cancelled` rather than back to `reserved`, and never a delete. A Stay that
 * was in house and is now reserved is indistinguishable from one that was never
 * checked in, so the mistake would become unobservable and the audit trail would
 * be the only evidence it happened — which makes the tables and the trail
 * disagree (ADR 0022).
 *
 * The Unit is freed by the status alone: `stays_no_double_booking` is partial on
 * it, so the dates stay exactly as they were and hold nothing. Nothing is
 * removed, which is the point.
 *
 * Only `in_house` moves, and only while nothing has been posted to the Stay's
 * Folio — the second is enforced by `stays_withdrawal_is_free_of_charges` and
 * raises `55000` rather than returning no row, because "money has been posted"
 * is a different answer from "you cannot" and is the one worth telling a front
 * desk.
 */
export async function withdrawStayWithin(
  tx: StayWriteClient,
  stayId: string,
): Promise<{
  organizationId: string;
  propertyId: string;
  accommodationUnitId: string;
  reservationId: string | null;
}> {
  const rows = await tx.$queryRaw<
    {
      organizationId: string;
      propertyId: string;
      accommodationUnitId: string;
      reservationId: string | null;
    }[]
  >`
    update public.stays
       set status = 'cancelled',
           updated_at = now()
     where id = ${stayId}::uuid
       and status = 'in_house'
    returning
      organization_id       as "organizationId",
      property_id           as "propertyId",
      accommodation_unit_id as "accommodationUnitId",
      reservation_id        as "reservationId"
  `;

  const [row] = rows;
  if (!row) {
    throw new StayWriteError("that Stay cannot be withdrawn");
  }
  return row;
}
