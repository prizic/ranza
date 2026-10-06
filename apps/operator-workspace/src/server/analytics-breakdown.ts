/**
 * What explains a month's headline: its nights by unit type, the nights that
 * earned no charge and why, and the Stays of one day.
 *
 * Every figure here is the engine's, cut another way, so it can only agree
 * with the headline. The same Stays hold the same nights — a Stay on a leaf
 * unit, in house or departed, from `starts_on` until the night before it ended
 * or through today — and a night is charged when its Folio has a room night
 * line for its business date. The unit a night was slept in is
 * `app.stay_unit_segments` — the database's own account of a Guest moved from
 * one room to another (ADR 0039) — never the unit the Stay is in now. Each
 * query below names that lookup itself, because a tagged template cannot be
 * given a fragment of SQL to share.
 *
 * Why a night went uncharged is not decided here: it is the reason
 * `app.room_nights_due` gives, the function the close posts through and the
 * Close the day screen lists by. A Resident night is the one reason that
 * function does not name, because Residents are billed monthly and a Resident
 * night is not due at all (RT-S3-05).
 *
 * As in the engine, every function takes the caller's transaction, so a month
 * and its breakdown are read on one snapshot.
 */
import type { NightNotChargedReason } from "@ranza/business-day";
import type { PropertyContext, Reader } from "./analytics-engine";

export type UnitType = "room" | "suite" | "apartment" | "bed";

/** The order unit types are listed in. */
export const UNIT_TYPES: readonly UnitType[] = [
  "room",
  "suite",
  "apartment",
  "bed",
];

/**
 * Why a night has no charge. The close's own reasons, plus a Resident, and a
 * night that could be charged and has not been yet: the open day's, or a
 * closed day the close left with a night it could have posted.
 */
export type UnchargedReason =
  "resident" | NightNotChargedReason | "not_yet_charged";

/** The order reasons are listed in: the certain ones first. */
export const UNCHARGED_REASONS: readonly UnchargedReason[] = [
  "resident",
  "unpriced",
  "billing_unavailable",
  "no_folio",
  "folio_closed",
  "currency",
  "not_yet_charged",
];

// ---------------------------------------------------------------------------
// By unit type
// ---------------------------------------------------------------------------

/** One business date's nights of one unit type. Not money. */
export interface TypeNightsRow {
  date: string;
  unitType: UnitType;
  availableNights: number;
  guestNights: number;
  residentNights: number;
  chargedGuestNights: number;
}

/**
 * Every business date in [start, end] by unit type: inventory from the day
 * each unit was created, and the nights Stays held in it. The same inventory
 * and the same nights as `readNights`, which is what makes the rows sum to it.
 */
export async function readTypeNights(
  tx: Reader,
  context: PropertyContext,
  start: string,
  end: string,
): Promise<TypeNightsRow[]> {
  const { propertyId, today } = context;
  return tx.$queryRaw<TypeNightsRow[]>`
    with prop as (
      select timezone, business_date_cutoff as cutoff
        from public.properties
       where id = ${propertyId}::uuid
    ),
    days as (
      select d::date as day
        from generate_series(${start}::timestamp, ${end}::timestamp, interval '1 day') as d
    ),
    leaf as (
      select unit.id, unit.unit_type,
             app.business_date(unit.created_at, prop.timezone, prop.cutoff) as since
        from public.accommodation_units as unit
       cross join prop
       where unit.property_id = ${propertyId}::uuid
         and not exists (
           select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
         )
    ),
    held as (
      select days.day, stay.id as stay_id, stay.stay_type,
             coalesce(slept_in.unit_type, leaf.unit_type) as unit_type
        from days
        join public.stays as stay
          on stay.property_id = ${propertyId}::uuid
         and stay.status in ('in_house', 'departed')
         and stay.starts_on <= days.day
         and (
           stay.status = 'in_house'
           or (stay.ends_on is not null and stay.ends_on > days.day)
         )
        join leaf on leaf.id = stay.accommodation_unit_id
        left join lateral (
          select segment.accommodation_unit_id as unit_id
            from app.stay_unit_segments(stay.id) as segment
           where days.day >= segment.starts_on
             and (segment.ends_on is null or days.day < segment.ends_on)
           limit 1
        ) as slept on true
        left join public.accommodation_units as slept_in on slept_in.id = slept.unit_id
       where days.day <= ${today}::date
    ),
    types as (
      select unit_type from leaf
      union
      select unit_type from held
    )
    select to_char(days.day, 'YYYY-MM-DD') as "date",
           types.unit_type as "unitType",
           case when days.day > ${today}::date then 0
                else (select count(*) from leaf
                       where leaf.unit_type = types.unit_type and leaf.since <= days.day)
           end::int as "availableNights",
           (select count(*) from held
             where held.day = days.day and held.unit_type = types.unit_type
               and held.stay_type = 'guest')::int as "guestNights",
           (select count(*) from held
             where held.day = days.day and held.unit_type = types.unit_type
               and held.stay_type = 'resident')::int as "residentNights",
           (select count(*) from held
             where held.day = days.day and held.unit_type = types.unit_type
               and held.stay_type = 'guest'
               and exists (
                 select 1
                   from public.folios as folio
                   join public.folio_lines as line on line.folio_id = folio.id
                  where folio.stay_id = held.stay_id
                    and line.source = 'room_night'
                    and line.business_date = held.day
               ))::int as "chargedGuestNights"
      from days
     cross join types
     order by days.day, types.unit_type
  `;
}

/** One business date's room revenue of one unit type, in minor units. */
export interface TypeRoomMoneyRow {
  date: string;
  unitType: UnitType;
  grossMinor: number;
  /** Reversals of this date's room nights; zero or negative. */
  correctionsMinor: number;
}

interface TypeRoomMoneyQueryRow {
  date: string;
  unitType: UnitType;
  grossMinor: string;
  correctionsMinor: string;
}

/**
 * The room revenue of every business date in [start, end] by the unit type of
 * the night it was charged for: a room night line, its Folio, its Stay, the
 * unit the Stay slept in that night. A reversal is the night it reverses, in
 * that night's unit type and on that night's date, exactly as the headline
 * dates it (AN-S2-09).
 *
 * Every room night line reaches a type: a Folio names its Stay and a Stay its
 * unit, both required, so there is no revenue that belongs to no type and no
 * "not attributed" row to carry it.
 *
 * Called only for a viewer who may read money.
 */
export async function readTypeRoomMoney(
  tx: Reader,
  context: PropertyContext,
  start: string,
  end: string,
): Promise<TypeRoomMoneyRow[]> {
  const { propertyId } = context;
  const rows = await tx.$queryRaw<TypeRoomMoneyQueryRow[]>`
    with night as (
      select line.folio_id, line.business_date as day,
             line.amount_minor as gross, 0::bigint as correction
        from public.folio_lines as line
       where line.property_id = ${propertyId}::uuid
         and line.line_type = 'charge' and line.source = 'room_night'
         and line.business_date between ${start}::date and ${end}::date
      union all
      select original.folio_id, original.business_date, 0::bigint, line.amount_minor
        from public.folio_lines as line
        join public.folio_lines as original on original.id = line.reverses_line_id
       where line.property_id = ${propertyId}::uuid
         and line.line_type = 'reversal' and original.source = 'room_night'
         and original.business_date between ${start}::date and ${end}::date
    )
    select to_char(night.day, 'YYYY-MM-DD') as "date",
           coalesce(slept_in.unit_type, current_unit.unit_type) as "unitType",
           sum(night.gross)::text as "grossMinor",
           sum(night.correction)::text as "correctionsMinor"
      from night
      join public.folios as folio on folio.id = night.folio_id
      join public.stays as stay on stay.id = folio.stay_id
      join public.accommodation_units as current_unit
        on current_unit.id = stay.accommodation_unit_id
      left join lateral (
        select segment.accommodation_unit_id as unit_id
          from app.stay_unit_segments(stay.id) as segment
         where night.day >= segment.starts_on
           and (segment.ends_on is null or night.day < segment.ends_on)
         limit 1
      ) as slept on true
      left join public.accommodation_units as slept_in on slept_in.id = slept.unit_id
     group by 1, 2
  `;
  return rows.map((row) => ({
    date: row.date,
    unitType: row.unitType,
    grossMinor: Number(row.grossMinor),
    correctionsMinor: Number(row.correctionsMinor),
  }));
}

/** One unit type's nights and room revenue over the closed days of a month. */
export interface UnitTypeTotals {
  unitType: UnitType;
  availableNights: number;
  guestNights: number;
  residentNights: number;
  chargedGuestNights: number;
  /** Net room revenue; null when the viewer may not read money. */
  roomNetMinor: number | null;
}

/**
 * The closed days among `closedDates`, summed by unit type, in the order unit
 * types are listed. As in every month figure, an open or future day adds
 * nothing. A type with no inventory, no nights and no revenue over those days
 * has no row: a suite the Property bought after the month is not a zero.
 */
export function unitTypeTotalsOf(
  closedDates: ReadonlySet<string>,
  nights: readonly TypeNightsRow[],
  money: readonly TypeRoomMoneyRow[] | null,
): UnitTypeTotals[] {
  const totals = new Map<UnitType, UnitTypeTotals>();
  const totalFor = (unitType: UnitType): UnitTypeTotals => {
    const existing = totals.get(unitType);
    if (existing) return existing;
    const created: UnitTypeTotals = {
      unitType,
      availableNights: 0,
      guestNights: 0,
      residentNights: 0,
      chargedGuestNights: 0,
      roomNetMinor: money ? 0 : null,
    };
    totals.set(unitType, created);
    return created;
  };

  for (const row of nights) {
    if (!closedDates.has(row.date)) continue;
    const total = totalFor(row.unitType);
    total.availableNights += row.availableNights;
    total.guestNights += row.guestNights;
    total.residentNights += row.residentNights;
    total.chargedGuestNights += row.chargedGuestNights;
  }
  for (const row of money ?? []) {
    if (!closedDates.has(row.date)) continue;
    const total = totalFor(row.unitType);
    total.roomNetMinor =
      (total.roomNetMinor ?? 0) + row.grossMinor + row.correctionsMinor;
  }

  return UNIT_TYPES.flatMap((unitType) => {
    const total = totals.get(unitType);
    if (!total) return [];
    const empty =
      total.availableNights === 0 &&
      total.guestNights + total.residentNights === 0 &&
      (total.roomNetMinor ?? 0) === 0;
    return empty ? [] : [total];
  });
}

// ---------------------------------------------------------------------------
// Nights that earned no charge
// ---------------------------------------------------------------------------

/** How many nights of one date went uncharged for one reason. */
export interface UnchargedRow {
  date: string;
  reason: UnchargedReason;
  nights: number;
}

/**
 * The nights of [start, end] that have no charge, by date and reason. A night
 * is uncharged when it is a Resident's, or a Guest's with no room night line;
 * the reason a Guest's is, is `app.room_nights_due`'s, or "not yet charged"
 * when that function finds nothing in the way.
 */
export async function readUnchargedNights(
  tx: Reader,
  context: PropertyContext,
  start: string,
  end: string,
): Promise<UnchargedRow[]> {
  const { propertyId, today } = context;
  return tx.$queryRaw<UnchargedRow[]>`
    with days as (
      select d::date as day
        from generate_series(${start}::timestamp, ${end}::timestamp, interval '1 day') as d
    ),
    held as (
      select days.day, stay.id as stay_id, stay.stay_type
        from days
        join public.stays as stay
          on stay.property_id = ${propertyId}::uuid
         and stay.status in ('in_house', 'departed')
         and stay.starts_on <= days.day
         and (
           stay.status = 'in_house'
           or (stay.ends_on is not null and stay.ends_on > days.day)
         )
       where days.day <= ${today}::date
         and not exists (
           select 1 from public.accommodation_units as child
            where child.parent_id = stay.accommodation_unit_id
         )
    ),
    reasoned as (
      select held.day,
             case
               when held.stay_type = 'resident' then 'resident'
               when exists (
                 select 1
                   from public.folios as folio
                   join public.folio_lines as line on line.folio_id = folio.id
                  where folio.stay_id = held.stay_id
                    and line.source = 'room_night'
                    and line.business_date = held.day
               ) then null
               else coalesce(due.reason, 'not_yet_charged')
             end as reason
        from held
        left join lateral (
          select night.reason
            from app.room_nights_due(
                   ${propertyId}::uuid, held.day, held.day, held.stay_id) as night
           limit 1
        ) as due on true
    )
    select to_char(reasoned.day, 'YYYY-MM-DD') as "date",
           reasoned.reason as "reason",
           count(*)::int as "nights"
      from reasoned
     where reasoned.reason is not null
     group by 1, 2
     order by 1, 2
  `;
}

/**
 * The reasons over the closed days among `closedDates`, in the order reasons
 * are listed, each with its nights. A reason with none is absent.
 */
export function unchargedTotalsOf(
  closedDates: ReadonlySet<string>,
  rows: readonly UnchargedRow[],
): { reason: UnchargedReason; nights: number }[] {
  const nights = new Map<UnchargedReason, number>();
  for (const row of rows) {
    if (!closedDates.has(row.date)) continue;
    nights.set(row.reason, (nights.get(row.reason) ?? 0) + row.nights);
  }
  return UNCHARGED_REASONS.flatMap((reason) => {
    const count = nights.get(reason);
    return count ? [{ reason, nights: count }] : [];
  });
}

// ---------------------------------------------------------------------------
// One day
// ---------------------------------------------------------------------------

/** What one Stay's night was: charged, or why it was not. */
export type NightOutcome = "charged" | UnchargedReason;

export interface DayStayRow {
  stayId: string;
  unitName: string;
  /** The room a bed is in; null for a unit that is not inside another. */
  roomName: string | null;
  unitType: UnitType;
  stayType: "guest" | "resident";
  /** The Guest's name as the viewer's own policies let them read it. */
  displayName: string | null;
  night: NightOutcome;
  /** Null for a viewer who may not read money, and for a night not charged. */
  chargeMinor: number | null;
}

interface DayStayQueryRow extends Omit<DayStayRow, "chargeMinor"> {
  chargeMinor: string | null;
}

/**
 * The Stays that held a unit on one business date, with the unit each slept
 * in that night and what became of the night.
 *
 * The amount is read only when the viewer may read money: the query is given
 * the answer and returns null otherwise, so a charge is not fetched to be
 * hidden afterwards (AN-S3-05).
 */
export async function readDayStays(
  tx: Reader,
  context: PropertyContext,
  date: string,
): Promise<DayStayRow[]> {
  const { propertyId, today, mayReadMoney } = context;
  const rows = await tx.$queryRaw<DayStayQueryRow[]>`
    select stay.id::text as "stayId",
           unit.name as "unitName",
           room.name as "roomName",
           unit.unit_type as "unitType",
           stay.stay_type as "stayType",
           guest.full_name as "displayName",
           case
             when stay.stay_type = 'resident' then 'resident'
             when charge.line_id is not null then 'charged'
             else coalesce(due.reason, 'not_yet_charged')
           end as "night",
           case when ${mayReadMoney}::boolean then charge.amount_minor::text end as "chargeMinor"
      from public.stays as stay
      left join lateral (
        select segment.accommodation_unit_id as unit_id
          from app.stay_unit_segments(stay.id) as segment
         where ${date}::date >= segment.starts_on
           and (segment.ends_on is null or ${date}::date < segment.ends_on)
         limit 1
      ) as slept on true
      join public.accommodation_units as unit
        on unit.id = coalesce(slept.unit_id, stay.accommodation_unit_id)
      left join public.accommodation_units as room on room.id = unit.parent_id
      left join public.reservations as reservation on reservation.id = stay.reservation_id
      left join public.guests as guest on guest.id = reservation.guest_id
      left join lateral (
        select line.id as line_id, line.amount_minor
          from public.folios as folio
          join public.folio_lines as line on line.folio_id = folio.id
         where folio.stay_id = stay.id
           and line.line_type = 'charge'
           and line.source = 'room_night'
           and line.business_date = ${date}::date
         limit 1
      ) as charge on true
      left join lateral (
        select night.reason
          from app.room_nights_due(
                 ${propertyId}::uuid, ${date}::date, ${date}::date, stay.id) as night
         limit 1
      ) as due on true
     where stay.property_id = ${propertyId}::uuid
       and stay.status in ('in_house', 'departed')
       and stay.starts_on <= ${date}::date
       and (
         stay.status = 'in_house'
         or (stay.ends_on is not null and stay.ends_on > ${date}::date)
       )
       and ${date}::date <= ${today}::date
       and not exists (
         select 1 from public.accommodation_units as child
          where child.parent_id = stay.accommodation_unit_id
       )
     order by coalesce(room.name, unit.name), unit.name, stay.id
  `;
  return rows.map(({ chargeMinor, ...row }) => ({
    ...row,
    chargeMinor: chargeMinor === null ? null : Number(chargeMinor),
  }));
}

/** A reversal of one of the day's room nights. */
export interface DayCorrectionRow {
  stayId: string;
  unitName: string;
  roomName: string | null;
  unitType: UnitType;
  /** The business date the correction was posted on. */
  postedOn: string;
  /** Negative. */
  amountMinor: number;
}

interface DayCorrectionQueryRow extends Omit<DayCorrectionRow, "amountMinor"> {
  amountMinor: string;
}

/**
 * The corrections to the day's room nights. A correction belongs to the night
 * it corrects and not to the day it was posted, as the month table dates it
 * (AN-S2-09), so the day's charges and these add up to the day's revenue.
 *
 * Called only for a viewer who may read money.
 */
export async function readDayCorrections(
  tx: Reader,
  context: PropertyContext,
  date: string,
): Promise<DayCorrectionRow[]> {
  const { propertyId } = context;
  const rows = await tx.$queryRaw<DayCorrectionQueryRow[]>`
    with prop as (
      select timezone, business_date_cutoff as cutoff
        from public.properties
       where id = ${propertyId}::uuid
    )
    select stay.id::text as "stayId",
           unit.name as "unitName",
           room.name as "roomName",
           unit.unit_type as "unitType",
           to_char(
             app.business_date(line.posted_at, prop.timezone, prop.cutoff),
             'YYYY-MM-DD') as "postedOn",
           line.amount_minor::text as "amountMinor"
      from public.folio_lines as line
     cross join prop
      join public.folio_lines as original on original.id = line.reverses_line_id
      join public.folios as folio on folio.id = original.folio_id
      join public.stays as stay on stay.id = folio.stay_id
      left join lateral (
        select segment.accommodation_unit_id as unit_id
          from app.stay_unit_segments(stay.id) as segment
         where ${date}::date >= segment.starts_on
           and (segment.ends_on is null or ${date}::date < segment.ends_on)
         limit 1
      ) as slept on true
      join public.accommodation_units as unit
        on unit.id = coalesce(slept.unit_id, stay.accommodation_unit_id)
      left join public.accommodation_units as room on room.id = unit.parent_id
     where line.property_id = ${propertyId}::uuid
       and line.line_type = 'reversal'
       and original.source = 'room_night'
       and original.business_date = ${date}::date
     order by coalesce(room.name, unit.name), unit.name, line.posted_at, line.id
  `;
  return rows.map((row) => ({ ...row, amountMinor: Number(row.amountMinor) }));
}
