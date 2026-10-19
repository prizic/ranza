/**
 * The one computation under every analytics figure: an inclusive window of a
 * Property's business dates, read as per-day rows and summed over the days
 * that have closed.
 *
 * Trailing ranges (today, 7d, 30d) and calendar months both run through here,
 * so a figure cannot mean one thing on a range and another in a month.
 *
 * The rules that make a figure true, each stated once and held here:
 *
 * - A date is a business date. A line with no stored one is dated by
 *   `app.business_date(posted_at, the Property's zone, its cutoff)` — the only
 *   place a business date is computed (ADR 0021) — and never by casting
 *   `posted_at` to a date, which uses the database session's zone and no
 *   cutoff (AN-S2-11, AN-S2-12).
 * - Money counts only on a closed day. A room night is charged when its day
 *   closes, so the open day pairs a night with no charge and would drag ADR and
 *   RevPAR down until the close ran (AN-S2-05). Occupancy needs no charge, so
 *   it counts every day that has happened, closed or not, and today's is the
 *   figure Today shows (RANZ-52).
 * - Inventory is summed per day from the day each unit was created, never
 *   today's unit count times the days (AN-S2-08).
 * - A reversal of a room night belongs to the night it corrects; every other
 *   reversal belongs to the day it was posted (AN-S2-09, AN-S2-10).
 * - Payments are stored negative and their reversals positive; money
 *   collected is the negation, so it reads positive net of reversals
 *   (AN-S2-13).
 *
 * Every function takes a reader — the transaction the caller already opened —
 * so a report made of several queries can run them all on one snapshot.
 */

/** What the engine needs of a transaction: tagged-template raw queries. */
export interface Reader {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

export type DayState = "closed" | "open" | "future";

export interface PropertyContext {
  propertyId: string;
  /** The Property's business date today. */
  today: string;
  currency: string;
  mayReadMoney: boolean;
  /**
   * How many business days wait for the front desk to close them, counted as
   * the Close the day screen counts them: from the day after the last close,
   * or just yesterday when none has ever been made.
   */
  daysWaiting: number;
  /** Whether the viewer may close the day, which is where those days are cleared. */
  mayCloseDay: boolean;
}

/** One business date's nights. Not money. */
export interface NightsDay {
  date: string;
  state: DayState;
  /** Units the Property had on that date, whatever state they are in. */
  unitCount: number;
  /**
   * The units that can be let that night. For a day that has gone, every unit
   * the Property then had; for today, those not blocked or out of order — the
   * count Today's occupancy is made of (RANZ-52). Nothing records a block on a
   * past date, so a past day is not told one it never had.
   */
  availableNights: number;
  guestNights: number;
  residentNights: number;
  /** Guest nights that have a room night charge. */
  chargedGuestNights: number;
}

export interface PaymentsByMethod {
  cashMinor: number;
  cardMinor: number;
  bankTransferMinor: number;
  otherMinor: number;
}

/** One business date's money, each part already attributed to its date. */
export interface MoneyDay {
  roomGrossMinor: number;
  /** Reversals of this date's room nights; zero or negative. */
  roomCorrectionsMinor: number;
  /** Charges other than room nights, net of their reversals. */
  otherMinor: number;
  /** Money collected, positive, net of reversals. */
  collected: PaymentsByMethod;
}

/** The nights of some days, split by who slept them. */
export interface NightTotals {
  availableNights: number;
  occupiedNights: number;
  guestNights: number;
  residentNights: number;
}

export interface Totals {
  /** Days that have closed. */
  daysClosed: number;
  /** Days that have happened and not closed: today, and any the close has not reached. */
  daysOpen: number;
  /**
   * Every day that has happened, closed or not: what occupancy is counted
   * over, because a night slept is a night slept before anyone charges it.
   */
  elapsed: NightTotals;
  /** The closed days alone: what a charge exists for, so what revenue is divided by. */
  closed: NightTotals & { chargedGuestNights: number };
  /** Over the closed days. Null when the viewer may not read money. */
  money: {
    roomGrossMinor: number;
    roomCorrectionsMinor: number;
    roomNetMinor: number;
    otherMinor: number;
    totalMinor: number;
    collected: PaymentsByMethod & { totalMinor: number };
  } | null;
}

interface ContextRow {
  propertyId: string;
  today: string;
  currency: string;
  mayReadMoney: boolean;
  entitled: boolean;
  daysWaiting: number;
  mayCloseDay: boolean;
}

/**
 * The Property as the viewer reaches it, or null when they do not reach it or
 * the Organization has not bought analytics for it (AN-S2-16, AN-S2-17).
 *
 * The row is read through the Property's own policy, so another Organization's
 * Property, or one in this Organization the viewer is not assigned to, is no
 * row at all — not found, which is different from an empty month.
 */
export async function readContext(
  tx: Reader,
  propertyId: string,
): Promise<PropertyContext | null> {
  const rows = await tx.$queryRaw<ContextRow[]>`
    select property.id::text as "propertyId",
           to_char(app.property_today(property.id), 'YYYY-MM-DD') as "today",
           trim(property.currency)::text as "currency",
           app.has_organization_permission(property.organization_id, 'finance.manage_folio') as "mayReadMoney",
           app.can_use_capability(property.id, 'analytics', 'analytics') as "entitled",
           -- The Close the day screen's own count (business-day module,
           -- getCloseTheDay): the days after the last close, or yesterday when
           -- nothing has ever closed. An integration test holds the two equal.
           coalesce(
             app.property_today(property.id) - (
               select case
                        when last_close.day is null
                          then app.property_today(property.id) - 1
                        when last_close.day + 1 < app.property_today(property.id)
                          then last_close.day + 1
                      end
                 from (select max(close.business_date) as day
                         from public.business_day_closes as close
                        where close.property_id = property.id) as last_close),
             0)::int as "daysWaiting",
           app.can_use_capability(property.id, 'front_office', 'front_desk')
             and app.has_organization_permission(property.organization_id, 'front_desk.close_day') as "mayCloseDay"
      from public.properties as property
     where property.id = ${propertyId}::uuid
  `;
  const row = rows[0];
  if (!row || !row.entitled) return null;
  return {
    propertyId: row.propertyId,
    today: row.today,
    currency: row.currency,
    mayReadMoney: row.mayReadMoney,
    daysWaiting: row.daysWaiting,
    mayCloseDay: row.mayCloseDay,
  };
}

interface NightsRow {
  day: string;
  closed: boolean;
  unitCount: number;
  availableNights: number;
  guestNights: number;
  residentNights: number;
  chargedGuestNights: number;
}

/**
 * Every business date in [start, end], with its nights.
 *
 * A Stay occupies a night from `starts_on`: a departed one until the night
 * before `ends_on`, the check-out date; one still in house through today and no
 * further, whatever departure was planned. Only leaf units are inventory — a
 * room divided into beds is its beds (ADR 0025) — and a unit is inventory from
 * the business date it was created. Dates after today have no nights and no
 * inventory: they have not happened.
 */
export async function readNights(
  tx: Reader,
  context: PropertyContext,
  start: string,
  end: string,
): Promise<NightsDay[]> {
  const { propertyId, today } = context;
  const rows = await tx.$queryRaw<NightsRow[]>`
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
      select unit.id,
             app.business_date(unit.created_at, prop.timezone, prop.cutoff) as since,
             -- Blocked or out of order tonight, with nobody in it: the room
             -- is not one that can be let, as the Rooms read counts it (a
             -- Guest in a blocked room still holds it, and a room out of
             -- order covers its beds).
             (
               (unit.status in ('blocked', 'out_of_service')
                or coalesce(room.status = 'out_of_service', false))
               and not exists (
                 select 1 from public.stays as occupant
                  where occupant.accommodation_unit_id = unit.id
                    and occupant.status = 'in_house'
               )
             ) as unavailable_now
        from public.accommodation_units as unit
        left join public.accommodation_units as room on room.id = unit.parent_id
       cross join prop
       where unit.property_id = ${propertyId}::uuid
         and not exists (
           select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
         )
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
        join leaf on leaf.id = stay.accommodation_unit_id
       where days.day <= ${today}::date
    ),
    closed as (
      select close.business_date as day
        from public.business_day_closes as close
       where close.property_id = ${propertyId}::uuid
         and close.business_date between ${start}::date and ${end}::date
    )
    select to_char(days.day, 'YYYY-MM-DD') as "day",
           exists (select 1 from closed where closed.day = days.day) as "closed",
           case when days.day > ${today}::date then 0
                else (select count(*) from leaf where leaf.since <= days.day)
           end::int as "unitCount",
           case when days.day > ${today}::date then 0
                when days.day = ${today}::date
                  then (select count(*) from leaf
                         where leaf.since <= days.day and not leaf.unavailable_now)
                else (select count(*) from leaf where leaf.since <= days.day)
           end::int as "availableNights",
           (select count(*) from held
             where held.day = days.day and held.stay_type = 'guest')::int as "guestNights",
           (select count(*) from held
             where held.day = days.day and held.stay_type = 'resident')::int as "residentNights",
           (select count(*) from held
             where held.day = days.day
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
     order by days.day
  `;
  return rows.map((row) => ({
    date: row.day,
    state: row.closed ? "closed" : row.day <= today ? "open" : "future",
    unitCount: row.unitCount,
    availableNights: row.availableNights,
    guestNights: row.guestNights,
    residentNights: row.residentNights,
    chargedGuestNights: row.chargedGuestNights,
  }));
}

interface MoneyRow {
  day: string;
  kind: "room_gross" | "room_correction" | "other" | "payment";
  method: string | null;
  amountMinor: string;
}

const NO_PAYMENTS: PaymentsByMethod = {
  cashMinor: 0,
  cardMinor: 0,
  bankTransferMinor: 0,
  otherMinor: 0,
};

function emptyMoneyDay(): MoneyDay {
  return {
    roomGrossMinor: 0,
    roomCorrectionsMinor: 0,
    otherMinor: 0,
    collected: { ...NO_PAYMENTS },
  };
}

/**
 * The money of every business date in [start, end], keyed by date. Only dates
 * that have any appear; the caller treats an absent date as zero.
 *
 * Called only for a viewer who may read money. A viewer who may not never
 * reaches this function, so the amounts are not computed and then hidden: they
 * are not read (AN-S2-15).
 */
export async function readMoney(
  tx: Reader,
  context: PropertyContext,
  start: string,
  end: string,
): Promise<Map<string, MoneyDay>> {
  const { propertyId } = context;
  const rows = await tx.$queryRaw<MoneyRow[]>`
    with prop as (
      select timezone, business_date_cutoff as cutoff
        from public.properties
       where id = ${propertyId}::uuid
    ),
    dated as (
      select line.id, line.line_type, line.amount_minor, line.payment_method,
             line.source, line.reverses_line_id,
             coalesce(
               line.business_date,
               app.business_date(line.posted_at, prop.timezone, prop.cutoff)
             ) as day
        from public.folio_lines as line
       cross join prop
       where line.property_id = ${propertyId}::uuid
    ),
    attributed as (
      select line.day, 'room_gross' as kind, null::text as method,
             line.amount_minor as amount
        from dated as line
       where line.line_type = 'charge' and line.source = 'room_night'
      union all
      select original.day, 'room_correction', null::text, line.amount_minor
        from dated as line
        join dated as original on original.id = line.reverses_line_id
       where line.line_type = 'reversal' and original.source = 'room_night'
      union all
      select line.day, 'other', null::text, line.amount_minor
        from dated as line
       where line.line_type = 'charge' and line.source is null
      union all
      select line.day, 'other', null::text, line.amount_minor
        from dated as line
        join dated as original on original.id = line.reverses_line_id
       where line.line_type = 'reversal'
         and original.line_type = 'charge' and original.source is null
      union all
      select line.day, 'payment', line.payment_method, -line.amount_minor
        from dated as line
       where line.line_type = 'payment'
      union all
      select line.day, 'payment', original.payment_method, -line.amount_minor
        from dated as line
        join dated as original on original.id = line.reverses_line_id
       where line.line_type = 'reversal' and original.line_type = 'payment'
    )
    select to_char(attributed.day, 'YYYY-MM-DD') as "day",
           attributed.kind as "kind",
           attributed.method as "method",
           sum(attributed.amount)::text as "amountMinor"
      from attributed
     where attributed.day between ${start}::date and ${end}::date
     group by 1, 2, 3
  `;

  const byDay = new Map<string, MoneyDay>();
  for (const row of rows) {
    const day = byDay.get(row.day) ?? emptyMoneyDay();
    byDay.set(row.day, day);
    const amount = Number(row.amountMinor);
    switch (row.kind) {
      case "room_gross":
        day.roomGrossMinor += amount;
        break;
      case "room_correction":
        day.roomCorrectionsMinor += amount;
        break;
      case "other":
        day.otherMinor += amount;
        break;
      case "payment":
        addPayment(day.collected, row.method, amount);
        break;
    }
  }
  return byDay;
}

function addPayment(
  into: PaymentsByMethod,
  method: string | null,
  amount: number,
): void {
  switch (method) {
    case "cash":
      into.cashMinor += amount;
      break;
    case "card":
      into.cardMinor += amount;
      break;
    case "bank_transfer":
      into.bankTransferMinor += amount;
      break;
    default:
      into.otherMinor += amount;
  }
}

/** A room's net revenue on one date: what was charged, less what was corrected. */
export function roomNetOf(day: MoneyDay | undefined): number {
  return day ? day.roomGrossMinor + day.roomCorrectionsMinor : 0;
}

/**
 * The totals of `days`, in the two senses a figure needs.
 *
 * `elapsed` is every day that has happened. `closed`, and the money, are the
 * closed days only: an open day adds no revenue and no charged night, so every
 * ratio of money pairs a charge with the nights it could have come from. A day
 * to come adds nothing to either.
 *
 * `money` is null for a viewer who may not read it, and so are the totals'.
 */
export function totalsOf(
  days: readonly NightsDay[],
  money: ReadonlyMap<string, MoneyDay> | null,
): Totals {
  const nights = (): NightTotals => ({
    availableNights: 0,
    occupiedNights: 0,
    guestNights: 0,
    residentNights: 0,
  });
  const add = (into: NightTotals, day: NightsDay): void => {
    into.availableNights += day.availableNights;
    into.guestNights += day.guestNights;
    into.residentNights += day.residentNights;
    into.occupiedNights += day.guestNights + day.residentNights;
  };

  const totals: Totals = {
    daysClosed: 0,
    daysOpen: 0,
    elapsed: nights(),
    closed: { ...nights(), chargedGuestNights: 0 },
    money: money
      ? {
          roomGrossMinor: 0,
          roomCorrectionsMinor: 0,
          roomNetMinor: 0,
          otherMinor: 0,
          totalMinor: 0,
          collected: { ...NO_PAYMENTS, totalMinor: 0 },
        }
      : null,
  };

  for (const day of days) {
    if (day.state === "future") continue;
    add(totals.elapsed, day);
    if (day.state !== "closed") {
      totals.daysOpen += 1;
      continue;
    }
    totals.daysClosed += 1;
    add(totals.closed, day);
    totals.closed.chargedGuestNights += day.chargedGuestNights;

    const dayMoney = money?.get(day.date);
    if (!totals.money || !dayMoney) continue;
    totals.money.roomGrossMinor += dayMoney.roomGrossMinor;
    totals.money.roomCorrectionsMinor += dayMoney.roomCorrectionsMinor;
    totals.money.otherMinor += dayMoney.otherMinor;
    totals.money.collected.cashMinor += dayMoney.collected.cashMinor;
    totals.money.collected.cardMinor += dayMoney.collected.cardMinor;
    totals.money.collected.bankTransferMinor +=
      dayMoney.collected.bankTransferMinor;
    totals.money.collected.otherMinor += dayMoney.collected.otherMinor;
  }

  if (totals.money) {
    const { money: sums } = totals;
    sums.roomNetMinor = sums.roomGrossMinor + sums.roomCorrectionsMinor;
    sums.totalMinor = sums.roomNetMinor + sums.otherMinor;
    sums.collected.totalMinor =
      sums.collected.cashMinor +
      sums.collected.cardMinor +
      sums.collected.bankTransferMinor +
      sums.collected.otherMinor;
  }
  return totals;
}

/** The business date of the first night anyone slept at the Property, or null. */
export async function readFirstActivity(
  tx: Reader,
  propertyId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ firstActivityOn: string | null }[]>`
    select to_char(min(stay.starts_on), 'YYYY-MM-DD') as "firstActivityOn"
      from public.stays as stay
     where stay.property_id = ${propertyId}::uuid
       and stay.status in ('in_house', 'departed')
  `;
  return rows[0]?.firstActivityOn ?? null;
}
