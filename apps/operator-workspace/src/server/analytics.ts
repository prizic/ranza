import { withOrganizationContext } from "@ranza/db";
import { getComposition } from "./composition";

export type AnalyticsRange = "today" | "7d" | "30d" | "mtd";

export const VALID_RANGES: readonly AnalyticsRange[] = [
  "today",
  "7d",
  "30d",
  "mtd",
] as const;

export function parseRange(value?: string | null): AnalyticsRange {
  if (value && (VALID_RANGES as readonly string[]).includes(value)) {
    return value as AnalyticsRange;
  }
  return "7d";
}

export interface DailyMetric {
  date: string;
  occupiedUnits: number;
  availableUnits: number;
  occupancyRatePercent: number;
  roomRevenueMinor: number | null;
}

export interface PaymentMethodBreakdown {
  cashMinor: number;
  cardMinor: number;
  bankTransferMinor: number;
  otherMinor: number;
  totalMinor: number;
}

export interface PropertyAnalytics {
  propertyId: string;
  range: AnalyticsRange;
  startDate: string;
  endDate: string;
  today: string;
  currency: string;
  mayReadMoney: boolean;

  // Operational metrics
  totalSellableUnits: number;
  availableRoomNights: number;
  occupiedRoomNights: number;
  occupancyRatePercent: number;

  // Commercial / Financial metrics (null if !mayReadMoney)
  roomRevenueMinor: number | null;
  otherRevenueMinor: number | null;
  totalRevenueMinor: number | null;
  adrMinor: number | null;
  revParMinor: number | null;

  // Payments breakdown (null if !mayReadMoney)
  netPaymentsMinor: number | null;
  paymentsByMethod: PaymentMethodBreakdown | null;

  // Time-series breakdown
  dailySeries: DailyMetric[];
}

interface PropertyContextRow {
  propertyId: string;
  organizationId: string;
  today: string;
  currency: string;
  mayReadMoney: boolean;
  entitled: boolean;
}

interface WindowRow {
  startDate: string;
  endDate: string;
  dayCount: number;
}

interface DailyOccRow {
  day: string;
  occupiedCount: number;
}

interface DailyRevRow {
  day: string;
  roomRevenueMinor: string;
}

interface PaymentMethodRow {
  paymentMethod: string;
  netAmountMinor: string;
}

/**
 * Derives operational and financial analytics metrics for a Property in a given date range.
 *
 * All tenant queries run strictly under withOrganizationContext.
 * Financial figures are strictly masked (null) when the viewer lacks 'finance.manage_folio'.
 * Date ranges are evaluated relative to the Property's active business date (app.property_today).
 */
export async function getPropertyAnalytics(
  userId: string,
  propertyId: string,
  rangeInput?: string | null,
): Promise<PropertyAnalytics | null> {
  const range = parseRange(rangeInput);
  const db = getComposition().db;

  return withOrganizationContext(db, { userId }, async (tx) => {
    // 1. Resolve property, timezone/today, entitlement, and permission context
    const propRows = await tx.$queryRaw<PropertyContextRow[]>`
      select property.id::text as "propertyId",
             property.organization_id::text as "organizationId",
             to_char(app.property_today(property.id), 'YYYY-MM-DD') as "today",
             trim(property.currency)::text as "currency",
             app.has_organization_permission(property.organization_id, 'finance.manage_folio') as "mayReadMoney",
             app.can_use_capability(property.id, 'analytics', 'analytics') as "entitled"
      from public.properties as property
      where property.id = ${propertyId}::uuid
    `;

    const prop = propRows[0];
    if (!prop || !prop.entitled) {
      return null;
    }

    const today = prop.today;
    const mayReadMoney = prop.mayReadMoney;
    const currency = prop.currency;

    // 2. Compute date window boundaries in the Property's business calendar
    const windowRows = await tx.$queryRaw<WindowRow[]>`
      select
        case
          when ${range} = 'today' then ${today}::date
          when ${range} = '7d' then (${today}::date - interval '6 days')::date
          when ${range} = '30d' then (${today}::date - interval '29 days')::date
          when ${range} = 'mtd' then date_trunc('month', ${today}::date)::date
          else (${today}::date - interval '6 days')::date
        end::text as "startDate",
        ${today}::text as "endDate",
        case
          when ${range} = 'today' then 1
          when ${range} = '7d' then 7
          when ${range} = '30d' then 30
          when ${range} = 'mtd' then (${today}::date - date_trunc('month', ${today}::date)::date + 1)
          else 7
        end::int as "dayCount"
    `;

    const win = windowRows[0] ?? {
      startDate: today,
      endDate: today,
      dayCount: 1,
    };
    const startDate = win.startDate;
    const endDate = win.endDate;
    const dayCount = win.dayCount;

    // 3. Count sellable units at this Property (units without children, ADR 0025)
    const unitRows = await tx.$queryRaw<{ totalSellableUnits: number }[]>`
      select count(*)::int as "totalSellableUnits"
      from public.accommodation_units as unit
      where unit.property_id = ${propertyId}::uuid
        and not exists (
          select 1 from public.accommodation_units as child
          where child.parent_id = unit.id
        )
    `;
    const totalSellableUnits = unitRows[0]?.totalSellableUnits ?? 0;
    const availableRoomNights = totalSellableUnits * dayCount;

    // 4. Query daily occupancy counts
    const occRows = await tx.$queryRaw<DailyOccRow[]>`
      with days as (
        select d::date as day
        from generate_series(${startDate}::date, ${endDate}::date, interval '1 day') as d
      ),
      daily_occ as (
        select
          days.day,
          count(distinct stay.accommodation_unit_id)::int as occupied_count
        from days
        left join public.stays as stay
          on stay.property_id = ${propertyId}::uuid
         and stay.status in ('in_house', 'departed')
         and stay.starts_on <= days.day
         and (
           (stay.status = 'in_house' and days.day <= ${today}::date)
           or (stay.ends_on is not null and stay.ends_on > days.day)
         )
         and exists (
           select 1 from public.accommodation_units as u
           where u.id = stay.accommodation_unit_id
             and u.property_id = ${propertyId}::uuid
             and not exists (
               select 1 from public.accommodation_units as child
               where child.parent_id = u.id
             )
         )
        group by days.day
      )
      select to_char(day, 'YYYY-MM-DD') as "day",
             occupied_count as "occupiedCount"
      from daily_occ
      order by day asc
    `;

    const occupiedByDay = new Map<string, number>();
    let totalOccupiedRoomNights = 0;
    for (const row of occRows) {
      occupiedByDay.set(row.day, row.occupiedCount);
      totalOccupiedRoomNights += row.occupiedCount;
    }

    const occupancyRatePercent =
      availableRoomNights > 0
        ? Math.round((totalOccupiedRoomNights / availableRoomNights) * 1000) /
          10
        : 0;

    // 5. Commercial and financial metrics (strictly gated by mayReadMoney)
    let roomRevenueMinor: number | null = null;
    let otherRevenueMinor: number | null = null;
    let totalRevenueMinor: number | null = null;
    let adrMinor: number | null = null;
    let revParMinor: number | null = null;
    let netPaymentsMinor: number | null = null;
    let paymentsByMethod: PaymentMethodBreakdown | null = null;
    const roomRevByDay = new Map<string, number>();

    if (mayReadMoney) {
      // Daily room night revenue (charges + reversals)
      const dailyRevRows = await tx.$queryRaw<DailyRevRow[]>`
        with days as (
          select d::date as day
          from generate_series(${startDate}::date, ${endDate}::date, interval '1 day') as d
        ),
        daily_rev as (
          select
            coalesce(line.business_date, line.posted_at::date) as day,
            coalesce(sum(line.amount_minor), 0)::bigint as room_rev_minor
          from public.folio_lines as line
          where line.property_id = ${propertyId}::uuid
            and (
              (line.source = 'room_night' and line.line_type = 'charge')
              or
              (line.line_type = 'reversal' and exists (
                 select 1 from public.folio_lines as orig
                 where orig.id = line.reverses_line_id
                   and orig.source = 'room_night'
              ))
            )
            and coalesce(line.business_date, line.posted_at::date) between ${startDate}::date and ${endDate}::date
          group by coalesce(line.business_date, line.posted_at::date)
        )
        select to_char(days.day, 'YYYY-MM-DD') as "day",
               coalesce(daily_rev.room_rev_minor, 0)::text as "roomRevenueMinor"
        from days
        left join daily_rev on daily_rev.day = days.day
        order by days.day asc
      `;

      let sumRoomRev = 0;
      for (const row of dailyRevRows) {
        const val = Number(row.roomRevenueMinor);
        roomRevByDay.set(row.day, val);
        sumRoomRev += val;
      }
      roomRevenueMinor = sumRoomRev;

      // Other incidental revenue (charges + reversals)
      const otherRevRows = await tx.$queryRaw<{ otherRevenueMinor: string }[]>`
        select
          coalesce(sum(line.amount_minor), 0)::text as "otherRevenueMinor"
        from public.folio_lines as line
        where line.property_id = ${propertyId}::uuid
          and line.posted_at::date between ${startDate}::date and ${endDate}::date
          and (
            (line.line_type = 'charge' and (line.source is null or line.source <> 'room_night'))
            or
            (line.line_type = 'reversal' and exists (
               select 1 from public.folio_lines as orig
               where orig.id = line.reverses_line_id
                 and orig.line_type = 'charge'
                 and (orig.source is null or orig.source <> 'room_night')
            ))
          )
      `;
      otherRevenueMinor = Number(otherRevRows[0]?.otherRevenueMinor ?? 0);
      totalRevenueMinor = roomRevenueMinor + otherRevenueMinor;

      // ADR = Room Revenue / Occupied Room Nights
      adrMinor =
        totalOccupiedRoomNights > 0
          ? Math.round(roomRevenueMinor / totalOccupiedRoomNights)
          : 0;

      // RevPAR = Room Revenue / Available Room Nights
      revParMinor =
        availableRoomNights > 0
          ? Math.round(roomRevenueMinor / availableRoomNights)
          : 0;

      // Payments by method
      const paymentRows = await tx.$queryRaw<PaymentMethodRow[]>`
        select
          coalesce(
            case
              when line.line_type = 'payment' then line.payment_method
              when line.line_type = 'reversal' then (
                select orig.payment_method from public.folio_lines as orig
                where orig.id = line.reverses_line_id
              )
            end,
            'other'
          ) as "paymentMethod",
          coalesce(sum(line.amount_minor), 0)::text as "netAmountMinor"
        from public.folio_lines as line
        where line.property_id = ${propertyId}::uuid
          and line.posted_at::date between ${startDate}::date and ${endDate}::date
          and (
            line.line_type = 'payment'
            or
            (line.line_type = 'reversal' and exists (
              select 1 from public.folio_lines as orig
              where orig.id = line.reverses_line_id
                and orig.line_type = 'payment'
            ))
          )
        group by 1
      `;

      let cashMinor = 0;
      let cardMinor = 0;
      let bankTransferMinor = 0;
      let otherMinor = 0;

      for (const row of paymentRows) {
        const val = Number(row.netAmountMinor);
        switch (row.paymentMethod) {
          case "cash":
            cashMinor += val;
            break;
          case "card":
            cardMinor += val;
            break;
          case "bank_transfer":
            bankTransferMinor += val;
            break;
          default:
            otherMinor += val;
            break;
        }
      }

      const totalPayments =
        cashMinor + cardMinor + bankTransferMinor + otherMinor;
      netPaymentsMinor = totalPayments;
      paymentsByMethod = {
        cashMinor,
        cardMinor,
        bankTransferMinor,
        otherMinor,
        totalMinor: totalPayments,
      };
    }

    // 6. Assemble daily breakdown series
    const dailySeries: DailyMetric[] = occRows.map((row) => {
      const occ = row.occupiedCount;
      const rate =
        totalSellableUnits > 0
          ? Math.round((occ / totalSellableUnits) * 1000) / 10
          : 0;
      return {
        date: row.day,
        occupiedUnits: occ,
        availableUnits: totalSellableUnits,
        occupancyRatePercent: rate,
        roomRevenueMinor: mayReadMoney
          ? (roomRevByDay.get(row.day) ?? 0)
          : null,
      };
    });

    return {
      propertyId,
      range,
      startDate,
      endDate,
      today,
      currency,
      mayReadMoney,
      totalSellableUnits,
      availableRoomNights,
      occupiedRoomNights: totalOccupiedRoomNights,
      occupancyRatePercent,
      roomRevenueMinor,
      otherRevenueMinor,
      totalRevenueMinor,
      adrMinor,
      revParMinor,
      netPaymentsMinor,
      paymentsByMethod,
      dailySeries,
    };
  });
}
