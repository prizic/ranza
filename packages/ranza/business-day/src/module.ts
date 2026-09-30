import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import { publishWithin } from "@ranza/platform-outbox";
import { FRONT_DESK_CAPABILITY } from "@ranza/reservations";
import {
  BusinessDayCloseError,
  CLOSE_REASON,
  CloseInputError,
  CloseReasonRequiredError,
  DayAlreadyClosedError,
  type BusinessDayClosed,
  type ClosedDay,
  type CloseTheDay,
  type FolioLeftOpen,
  type NightNotCharged,
  type NightsToCharge,
  type OpenArrival,
  type OpenDeparture,
} from "./contracts";
import type { BusinessDayDeps } from "./ports";

/**
 * Closing a business day (blueprint 6.4, ADR 0034).
 *
 * Like every Ranza module this one owns no authorization logic and no rule the
 * database can hold. Which day may close, what was left open, what the day
 * counted and who closed it are decided by `app.business_day_close_is_stamped()`
 * and the table's policies, for a Staff Member here and for the worker alike.
 * This module reads the checklist and asks for the close.
 */

/** The day is already closed: `business_day_closes`' unique key. */
const UNIQUE_VIOLATION = "23505";

/** Items are open and no reason was given: `..._exceptions_need_a_reason`. */
const CHECK_VIOLATION = "23514";

/**
 * The one check violation that means "a reason is needed". Any other would be
 * a defect, and is not reported as the desk's to fix.
 */
const REASON_CONSTRAINT = "business_day_closes_exceptions_need_a_reason";

/** Whether the failure names `constraint`, wherever the driver put it. */
function names(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    JSON.stringify(error, Object.getOwnPropertyNames(error)).includes(
      constraint,
    )
  );
}

/** The day has not ended, or waits for the day before it. */
const NOT_IN_PREREQUISITE_STATE = "55000";

/** Not this caller's to close: the stamp's caller check, or the policy. */
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Whether a failure carries a particular SQLSTATE — the reservations module's
 * reasoning, repeated because a module's helpers are its own: the nested path
 * first, where Prisma keeps a raw query's real code, and the message as well,
 * because that path is Prisma's private arrangement and has moved once.
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

/** `YYYY-MM-DD` that names a day that exists, or null. */
function calendarDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function createBusinessDayModule(deps: BusinessDayDeps) {
  /**
   * The Close the day screen for one Property, or null when the viewer cannot
   * reach it with the front desk — the same answer for a Property that does not
   * exist, a lapsed Subscription, and one the viewer is not assigned to.
   *
   * The day to close is the oldest one waiting: the day after the last close,
   * or yesterday when nothing has been closed yet. The checklist is for that
   * day, or for today while nothing waits, so the night shift can clear what
   * would otherwise hold the close up at the cutoff.
   *
   * What is open mirrors the stamp exactly — a booking whose first night has
   * come and nobody arrived, a Guest in house past their departure — so what the
   * screen lists is what the close records. The integration suite compares the
   * two.
   */
  async function getCloseTheDay(
    userId: string,
    propertyId: string,
  ): Promise<CloseTheDay | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [head] = await tx.$queryRaw<
        {
          today: string;
          cutoff: string;
          dayToClose: string | null;
          waiting: number;
          mayClose: boolean;
          mayCancel: boolean;
          mayReadMoney: boolean;
          currency: string;
        }[]
      >`
        select to_char(today.day, 'YYYY-MM-DD')                   as "today",
               to_char(property.business_date_cutoff, 'HH24:MI')  as "cutoff",
               to_char(due.day, 'YYYY-MM-DD')                     as "dayToClose",
               coalesce(today.day - due.day, 0)::int              as "waiting",
               app.has_organization_permission(
                 property.organization_id, 'front_desk.close_day') as "mayClose",
               app.has_organization_permission(
                 property.organization_id, 'front_desk.cancel')    as "mayCancel",
               -- Money on this screen follows the Today screen's rule: a
               -- day's room revenue is for whoever manages Folios.
               app.has_organization_permission(
                 property.organization_id, 'finance.manage_folio') as "mayReadMoney",
               trim(property.currency)                            as "currency"
        from public.properties as property
        cross join lateral (
          select app.property_today(property.id) as day
        ) as today
        cross join lateral (
          select max(close.business_date) as day
          from public.business_day_closes as close
          where close.property_id = property.id
        ) as last_close
        cross join lateral (
          select case
                   when last_close.day is null then today.day - 1
                   when last_close.day + 1 < today.day then last_close.day + 1
                 end as day
        ) as due
        where property.id = ${propertyId}::uuid
          and app.can_use_capability(
            property.id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
      `;
      if (!head) return null;

      const checklistDay = head.dayToClose ?? head.today;

      const arrivals = await tx.$queryRaw<
        Omit<OpenArrival, "mayMarkNoShow" | "mayCancel">[]
      >`
        select reservation.id                              as "reservationId",
               reservation.reference                       as "reference",
               guest.full_name                             as "guestName",
               reservation.status                          as "status",
               to_char(reservation.starts_on, 'YYYY-MM-DD') as "startsOn",
               to_char(reservation.ends_on, 'YYYY-MM-DD')  as "endsOn",
               unit.name                                   as "unitName",
               room.name                                   as "roomName",
               reservation.status = 'confirmed'
                 and (reservation.ends_on is null
                      or reservation.ends_on > ${head.today}::date) as "arrivable"
        from public.reservations as reservation
        join public.guests as guest on guest.id = reservation.guest_id
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        left join public.accommodation_units as room on room.id = unit.parent_id
        where reservation.property_id = ${propertyId}::uuid
          and reservation.status in ('requested', 'confirmed')
          and reservation.starts_on <= ${checklistDay}::date
        order by reservation.starts_on, coalesce(room.name, unit.name),
                 unit.name, guest.full_name
      `;

      const departures = await tx.$queryRaw<OpenDeparture[]>`
        select stay.id                              as "stayId",
               reservation.reference                as "reference",
               guest.full_name                      as "guestName",
               to_char(stay.starts_on, 'YYYY-MM-DD') as "startsOn",
               to_char(stay.ends_on, 'YYYY-MM-DD')  as "endsOn",
               unit.name                            as "unitName",
               room.name                            as "roomName",
               stay.reservation_id is not null
                 and app.has_organization_permission(
                       stay.organization_id, 'front_desk.amend') as "mayAmend"
        from public.stays as stay
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.accommodation_units as room on room.id = unit.parent_id
        left join public.reservations as reservation
          on reservation.id = stay.reservation_id
        left join public.guests as guest on guest.id = reservation.guest_id
        where stay.property_id = ${propertyId}::uuid
          and stay.status = 'in_house'
          and stay.ends_on <= ${checklistDay}::date
        order by stay.ends_on, coalesce(room.name, unit.name), unit.name
      `;

      const folios = await tx.$queryRaw<
        (Omit<FolioLeftOpen, "balanceMinor"> & { balanceMinor: string })[]
      >`
        select stay.id                              as "stayId",
               folio.id                             as "folioId",
               guest.full_name                      as "guestName",
               to_char(stay.ends_on, 'YYYY-MM-DD')  as "departedOn",
               unit.name                            as "unitName",
               room.name                            as "roomName",
               -- Text, as the Folio module reads it: a sum of bigints can
               -- overflow ::int.
               coalesce((select sum(line.amount_minor)
                           from public.folio_lines as line
                          where line.folio_id = folio.id), 0)::text as "balanceMinor",
               trim(folio.currency)                 as "currency"
        from public.folios as folio
        join public.stays as stay on stay.id = folio.stay_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.accommodation_units as room on room.id = unit.parent_id
        left join public.reservations as reservation
          on reservation.id = stay.reservation_id
        left join public.guests as guest on guest.id = reservation.guest_id
        where folio.property_id = ${propertyId}::uuid
          and folio.status = 'open'
          and stay.status = 'departed'
          and stay.ends_on <= ${checklistDay}::date
        order by stay.ends_on, coalesce(room.name, unit.name), unit.name
      `;

      // What the close of the waiting day will charge, from the same function
      // it posts through, so the preview and the close cannot disagree about a
      // night. Nothing while no day waits: today's nights are charged only
      // once today has ended.
      let nightsToCharge: NightsToCharge | null = null;
      let nightsNotCharged: NightNotCharged[] = [];
      if (head.dayToClose) {
        const [charge] = await tx.$queryRaw<
          { nights: number; amountMinor: string }[]
        >`
          select count(*)::int                              as "nights",
                 coalesce(sum(due.amount_minor), 0)::text   as "amountMinor"
            from app.room_nights_due(${propertyId}::uuid,
                                     ${head.dayToClose}::date,
                                     ${head.dayToClose}::date) as due
           where due.reason is null or due.reason = 'already_posted'
        `;
        nightsToCharge = {
          nights: charge?.nights ?? 0,
          amountMinor: head.mayReadMoney
            ? Number(charge?.amountMinor ?? 0)
            : null,
          currency: head.currency,
        };
        nightsNotCharged = await tx.$queryRaw<NightNotCharged[]>`
          select due.stay_id                           as "stayId",
                 guest.full_name                       as "guestName",
                 unit.name                             as "unitName",
                 room.name                             as "roomName",
                 due.reason                            as "reason"
            from app.room_nights_due(${propertyId}::uuid,
                                     ${head.dayToClose}::date,
                                     ${head.dayToClose}::date) as due
            join public.stays as stay on stay.id = due.stay_id
            join public.accommodation_units as unit
              on unit.id = stay.accommodation_unit_id
            left join public.accommodation_units as room
              on room.id = unit.parent_id
            left join public.reservations as reservation
              on reservation.id = stay.reservation_id
            left join public.guests as guest
              on guest.id = reservation.guest_id
           where due.reason is not null
             and due.reason <> 'already_posted'
           order by due.reason, coalesce(room.name, unit.name), unit.name
        `;
      }

      const recent = await tx.$queryRaw<
        (Omit<ClosedDay, "roomRevenueMinor"> & {
          roomRevenueMinor: string;
        })[]
      >`
        select close.id                                    as "closeId",
               to_char(close.business_date, 'YYYY-MM-DD')  as "businessDate",
               close.closed_at                             as "closedAt",
               account.email                               as "closedBy",
               close.closed_by is null                     as "automatic",
               close.arrived                               as "arrived",
               close.departed                              as "departed",
               close.nights_occupied                       as "nightsOccupied",
               close.folios_left_open                      as "foliosLeftOpen",
               jsonb_array_length(close.exceptions)        as "leftOpen",
               close.reason                                as "reason",
               close.room_nights_posted                    as "roomNightsCharged",
               close.room_revenue_minor::text              as "roomRevenueMinor",
               trim(close.room_revenue_currency)           as "roomRevenueCurrency",
               close.room_nights_unposted                  as "roomNightsNotCharged"
        from public.business_day_closes as close
        left join public.users as account on account.id = close.closed_by
        where close.property_id = ${propertyId}::uuid
        order by close.business_date desc
        limit 7
      `;

      return {
        propertyId,
        today: head.today,
        cutoff: head.cutoff,
        dayToClose: head.dayToClose,
        waiting: head.waiting,
        checklistDay,
        notArrived: arrivals.map((row) => ({
          ...row,
          mayMarkNoShow: row.status === "confirmed" && head.mayCancel,
          mayCancel: head.mayCancel,
        })),
        notDeparted: departures,
        foliosLeftOpen: folios.map((row) => ({
          ...row,
          balanceMinor: Number(row.balanceMinor),
        })),
        nightsToCharge,
        nightsNotCharged,
        mayClose: head.mayClose,
        recent: recent.map((row) => ({
          ...row,
          roomRevenueMinor: head.mayReadMoney
            ? Number(row.roomRevenueMinor)
            : null,
        })),
      };
    });
  }

  /**
   * Closes one business day, with a reason when anything was left open.
   *
   * The insert is the whole of it. The stamp refuses a day that has not ended
   * or waits for an earlier one, names the closer and counts the day; the
   * unique key refuses a day already closed, by another desk or by the worker;
   * the policy asks for the capability and `front_desk.close_day`. None of it is
   * asked here first, because an answer given here would be the weaker copy.
   *
   * The Organization is read from the Property rather than taken from the
   * caller, so a close cannot be filed under another Organization, and a
   * Property the viewer cannot read inserts nothing.
   */
  async function closeDay(
    userId: string,
    propertyId: string,
    businessDate: string,
    reason: string | null,
  ): Promise<BusinessDayClosed> {
    const day = calendarDay(businessDate);
    if (!day) throw new CloseInputError("that is not a calendar day");
    const explanation = reason?.trim() || null;
    // Characters, as the table's char_length counts them — not UTF-16 units,
    // or two characters outside the basic plane would pass here and fail
    // there, reported as the wrong refusal.
    const length = explanation === null ? 0 : [...explanation].length;
    if (
      explanation !== null &&
      (length < CLOSE_REASON.min || length > CLOSE_REASON.max)
    ) {
      throw new CloseInputError(
        `a reason must be between ${CLOSE_REASON.min} and ${CLOSE_REASON.max} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let closed: {
        closeId: string;
        organizationId: string;
        roomNightsCharged: number;
        roomRevenueMinor: string;
        roomRevenueCurrency: string | null;
        roomNightsNotCharged: number;
      }[];
      try {
        closed = await tx.$queryRaw`
          insert into public.business_day_closes
            (organization_id, property_id, business_date, reason)
          select property.organization_id, property.id, ${day}::date,
                 ${explanation}
          from public.properties as property
          where property.id = ${propertyId}::uuid
          returning id                          as "closeId",
                    organization_id             as "organizationId",
                    room_nights_posted          as "roomNightsCharged",
                    room_revenue_minor::text    as "roomRevenueMinor",
                    trim(room_revenue_currency) as "roomRevenueCurrency",
                    room_nights_unposted        as "roomNightsNotCharged"
        `;
      } catch (error: unknown) {
        if (raised(error, UNIQUE_VIOLATION)) {
          throw new DayAlreadyClosedError(
            "that business day is already closed",
          );
        }
        if (raised(error, CHECK_VIOLATION) && names(error, REASON_CONSTRAINT)) {
          throw new CloseReasonRequiredError(
            "items are left open, so closing needs a reason",
          );
        }
        if (
          raised(error, NOT_IN_PREREQUISITE_STATE) ||
          raised(error, INSUFFICIENT_PRIVILEGE)
        ) {
          throw new BusinessDayCloseError("that business day cannot be closed");
        }
        throw error;
      }

      const [row] = closed;
      if (!row) {
        throw new BusinessDayCloseError("that business day cannot be closed");
      }

      // Ids and a date, like every event: the queue is read across
      // Organizations. The worker's close publishes the same payload.
      await publishWithin(tx, {
        organizationId: row.organizationId,
        eventType: "business_day.closed",
        payload: { closeId: row.closeId, propertyId, businessDate: day },
      });

      // Filed at the Property (ADR 0031), so a reader assigned to it sees the
      // close and a reader of another Property does not.
      await recordWithin(tx, {
        organizationId: row.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "business_day.closed",
        subjectType: "business_day_close",
        subjectId: row.closeId,
        ...(explanation !== null ? { reason: explanation } : {}),
        context: {
          propertyId,
          businessDate: day,
          // What the day charged (ADR 0038): every room night dated it, and
          // the Guest nights it could not charge.
          roomNightsCharged: row.roomNightsCharged,
          amountMinor: Number(row.roomRevenueMinor),
          currency: row.roomRevenueCurrency,
          roomNightsNotCharged: row.roomNightsNotCharged,
        },
      });

      return {
        closeId: row.closeId,
        businessDate: day,
        roomNightsCharged: row.roomNightsCharged,
        roomNightsNotCharged: row.roomNightsNotCharged,
      };
    });
  }

  return { getCloseTheDay, closeDay };
}

export type BusinessDayModule = ReturnType<typeof createBusinessDayModule>;
