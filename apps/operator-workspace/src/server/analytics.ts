import { withOrganizationContext } from "@ranza/db";
import {
  readContext,
  readFirstActivity,
  readMoney,
  readNights,
  roomNetOf,
  totalsOf,
  type DayState,
  type NightsDay,
  type PaymentsByMethod,
  type Reader,
  type Totals,
} from "./analytics-engine";
import {
  addDays,
  daysInMonth,
  monthEnd,
  monthOf,
  monthStart,
  parseMonth,
  percentChange,
  pointChange,
  resolveMonth,
  shiftMonth,
} from "./analytics-months";
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

/** What the analytics screen is asked to show. */
export type AnalyticsView =
  | { kind: "month"; month: string | null }
  | { kind: "range"; range: Exclude<AnalyticsRange, "mtd"> };

/**
 * Which view a request opens. A month in the URL wins; a bookmarked
 * `?range=mtd` opens the current month, which is the same figure (AN-S2-19);
 * so does a request with neither (AN-S2-01). Today, 7d and 30d stay trailing
 * windows, and a range nobody knows falls back to 7d (AN-S1-14). A null month
 * is the current one.
 */
export function resolveAnalyticsView(request: {
  range?: string | null;
  month?: string | null;
}): AnalyticsView {
  if (request.month) {
    return { kind: "month", month: parseMonth(request.month) };
  }
  if (!request.range) return { kind: "month", month: null };
  const range = parseRange(request.range);
  if (range === "mtd") return { kind: "month", month: null };
  return { kind: "range", range };
}

// ---------------------------------------------------------------------------
// A trailing window
// ---------------------------------------------------------------------------

export interface DailyMetric {
  date: string;
  /** Whether the day counts toward the window's figures: only a closed day does. */
  state: DayState;
  occupiedUnits: number;
  availableUnits: number;
  occupancyRatePercent: number;
  /** Null when the viewer may not read money, and for a day not yet closed. */
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
  /** Days of the window that have closed. Every figure below covers these only. */
  daysClosed: number;

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

function trailingWindow(
  range: AnalyticsRange,
  today: string,
): { start: string; end: string } {
  switch (range) {
    case "today":
      return { start: today, end: today };
    case "30d":
      return { start: addDays(today, -29), end: today };
    case "mtd":
      return { start: monthStart(monthOf(today)), end: today };
    case "7d":
      return { start: addDays(today, -6), end: today };
  }
}

function ratioPercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/**
 * Derives operational and financial analytics metrics for a Property over a
 * trailing window of its business dates.
 *
 * Every query runs under withOrganizationContext on one snapshot. Money is
 * null, and never read, when the viewer lacks 'finance.manage_folio'. The
 * window ends at the Property's business date (app.property_today) and its
 * figures cover the days that have closed.
 *
 * A trailing window that holds no closed night reports zero, not a dash: a
 * Property with no stays has zero occupancy, ADR and RevPAR without dividing
 * by zero (AN-S1-03, AN-S1-04). The month report is the one that says "nothing
 * happened" instead.
 */
export async function getPropertyAnalytics(
  userId: string,
  propertyId: string,
  rangeInput?: string | null,
): Promise<PropertyAnalytics | null> {
  const range = parseRange(rangeInput);
  const db = getComposition().db;

  return withOrganizationContext(
    db,
    { userId },
    async (tx) => {
      const context = await readContext(tx, propertyId);
      if (!context) return null;

      const { start, end } = trailingWindow(range, context.today);
      const days = await readNights(tx, context, start, end);
      const money = context.mayReadMoney
        ? await readMoney(tx, context, start, end)
        : null;
      const totals = totalsOf(days, money);
      const sums = totals.money;

      const rate = ratioPercent(totals.occupiedNights, totals.availableNights);
      return {
        propertyId,
        range,
        startDate: start,
        endDate: end,
        today: context.today,
        currency: context.currency,
        mayReadMoney: context.mayReadMoney,
        daysClosed: totals.daysClosed,
        totalSellableUnits:
          days.find((day) => day.date === context.today)?.availableNights ?? 0,
        availableRoomNights: totals.availableNights,
        occupiedRoomNights: totals.occupiedNights,
        occupancyRatePercent: rate ?? 0,
        roomRevenueMinor: sums ? sums.roomNetMinor : null,
        otherRevenueMinor: sums ? sums.otherMinor : null,
        totalRevenueMinor: sums ? sums.totalMinor : null,
        adrMinor: sums
          ? totals.chargedGuestNights > 0
            ? Math.round(sums.roomNetMinor / totals.chargedGuestNights)
            : 0
          : null,
        revParMinor: sums
          ? totals.availableNights > 0
            ? Math.round(sums.roomNetMinor / totals.availableNights)
            : 0
          : null,
        netPaymentsMinor: sums ? sums.collected.totalMinor : null,
        paymentsByMethod: sums ? { ...sums.collected } : null,
        dailySeries: days.map((day) =>
          dailyMetric(day, money?.get(day.date), context.mayReadMoney),
        ),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

function dailyMetric(
  day: NightsDay,
  money: Parameters<typeof roomNetOf>[0],
  mayReadMoney: boolean,
): DailyMetric {
  const occupied = day.guestNights + day.residentNights;
  return {
    date: day.date,
    state: day.state,
    occupiedUnits: occupied,
    availableUnits: day.availableNights,
    occupancyRatePercent: ratioPercent(occupied, day.availableNights) ?? 0,
    roomRevenueMinor:
      mayReadMoney && day.state === "closed" ? roomNetOf(money) : null,
  };
}

// ---------------------------------------------------------------------------
// A month
// ---------------------------------------------------------------------------

export type MonthState = "open" | "closed" | "no_activity";

export interface RoomRevenue {
  grossMinor: number;
  /** Reversals of this period's room nights; zero or negative. */
  correctionsMinor: number;
  netMinor: number;
}

export interface PaymentsCollected extends PaymentsByMethod {
  totalMinor: number;
}

/**
 * One month's headline, summed over its closed days. A rate is null when its
 * denominator is zero — a dash on screen, never zero and never infinity.
 * Every money field is null when the viewer may not read money.
 */
export interface Figures {
  availableNights: number;
  occupiedNights: number;
  guestNights: number;
  residentNights: number;
  /** Guest nights that have a room night charge: ADR's denominator. */
  chargedGuestNights: number;
  occupancyPercent: number | null;
  roomRevenue: RoomRevenue | null;
  otherRevenueMinor: number | null;
  totalRevenueMinor: number | null;
  adrMinor: number | null;
  revParMinor: number | null;
  collectedMinor: number | null;
  payments: PaymentsCollected | null;
  /** Room and other revenue, net: what was booked. */
  revenueBookedMinor: number | null;
  /** Booked less collected: the change in what Guests owe. */
  differenceMinor: number | null;
}

/**
 * The change from the prior month's figure, null where it reads as a dash:
 * no figure to compare, or a prior of zero. Occupancy is in points, money in
 * percent of the prior.
 */
export interface FigureChanges {
  occupancyPoints: number | null;
  roomRevenuePercent: number | null;
  otherRevenuePercent: number | null;
  totalRevenuePercent: number | null;
  adrPercent: number | null;
  revParPercent: number | null;
  collectedPercent: number | null;
}

export interface PriorMonth {
  month: string;
  /** Null when there is nothing to compare: the prior had no activity. */
  figures: Figures | null;
  /** True when the month is open, so the prior covers only the same elapsed days. */
  sameElapsedDays: boolean;
  changes: FigureChanges | null;
}

export interface DayRow {
  date: string;
  state: DayState;
  occupiedNights: number;
  availableNights: number;
  /** Null for a future day, a day with no inventory and a month with no activity. */
  occupancyPercent: number | null;
  /** Net. Null when the viewer may not read money, and for a day not closed. */
  roomRevenueMinor: number | null;
}

export interface MonthReport {
  propertyId: string;
  currency: string;
  mayReadMoney: boolean;
  /** The Property's business date today. */
  today: string;
  /** `YYYY-MM`. */
  month: string;
  state: MonthState;
  daysInMonth: number;
  daysClosed: number;
  /** The last closed business date in the month, or null when none has. */
  closedThrough: string | null;
  /** Null for a month with no activity: nothing happened is not zero. */
  figures: Figures | null;
  prior: PriorMonth | null;
  /** Every day of the month, closed or not. */
  days: DayRow[];
  previousMonth: string | null;
  nextMonth: string | null;
}

function figuresOf(totals: Totals): Figures {
  const money = totals.money;
  return {
    availableNights: totals.availableNights,
    occupiedNights: totals.occupiedNights,
    guestNights: totals.guestNights,
    residentNights: totals.residentNights,
    chargedGuestNights: totals.chargedGuestNights,
    occupancyPercent: ratioPercent(
      totals.occupiedNights,
      totals.availableNights,
    ),
    roomRevenue: money
      ? {
          grossMinor: money.roomGrossMinor,
          correctionsMinor: money.roomCorrectionsMinor,
          netMinor: money.roomNetMinor,
        }
      : null,
    otherRevenueMinor: money ? money.otherMinor : null,
    totalRevenueMinor: money ? money.totalMinor : null,
    adrMinor:
      money && totals.chargedGuestNights > 0
        ? Math.round(money.roomNetMinor / totals.chargedGuestNights)
        : null,
    revParMinor:
      money && totals.availableNights > 0
        ? Math.round(money.roomNetMinor / totals.availableNights)
        : null,
    collectedMinor: money ? money.collected.totalMinor : null,
    payments: money ? { ...money.collected } : null,
    revenueBookedMinor: money ? money.totalMinor : null,
    differenceMinor: money
      ? money.totalMinor - money.collected.totalMinor
      : null,
  };
}

function changesOf(current: Figures, prior: Figures): FigureChanges {
  return {
    occupancyPoints: pointChange(
      current.occupancyPercent,
      prior.occupancyPercent,
    ),
    roomRevenuePercent: percentChange(
      current.roomRevenue?.netMinor ?? null,
      prior.roomRevenue?.netMinor ?? null,
    ),
    otherRevenuePercent: percentChange(
      current.otherRevenueMinor,
      prior.otherRevenueMinor,
    ),
    totalRevenuePercent: percentChange(
      current.totalRevenueMinor,
      prior.totalRevenueMinor,
    ),
    adrPercent: percentChange(current.adrMinor, prior.adrMinor),
    revParPercent: percentChange(current.revParMinor, prior.revParMinor),
    collectedPercent: percentChange(
      current.collectedMinor,
      prior.collectedMinor,
    ),
  };
}

function dayRowOf(
  day: NightsDay,
  money: Parameters<typeof roomNetOf>[0],
  mayReadMoney: boolean,
  hasActivity: boolean,
): DayRow {
  const occupied = day.guestNights + day.residentNights;
  return {
    date: day.date,
    state: day.state,
    occupiedNights: occupied,
    availableNights: day.availableNights,
    occupancyPercent:
      hasActivity && day.state !== "future"
        ? ratioPercent(occupied, day.availableNights)
        : null,
    roomRevenueMinor:
      mayReadMoney && hasActivity && day.state === "closed"
        ? roomNetOf(money)
        : null,
  };
}

/**
 * One calendar month of a Property's business calendar, explained.
 *
 * Null when the viewer does not reach the Property, or it has not bought
 * analytics: the screen shows its not-found state, not an empty month. An
 * unknown, malformed or future month is the current month (AN-S2-02).
 *
 * Every query runs in one REPEATABLE READ transaction, so the headline, the
 * day table and the comparison are read from one snapshot: a night charged
 * while the report is assembled cannot appear in one and not another
 * (AN-S2-18).
 */
export async function getMonthReport(
  userId: string,
  propertyId: string,
  monthInput?: string | null,
): Promise<MonthReport | null> {
  return withOrganizationContext(
    getComposition().db,
    { userId },
    (tx) => buildMonthReport(tx, propertyId, monthInput),
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * The report, built on a transaction the caller opened. Exported so a test can
 * hand it a transaction whose snapshot it controls; the route calls
 * `getMonthReport`.
 */
export async function buildMonthReport(
  tx: Reader,
  propertyId: string,
  monthInput?: string | null,
): Promise<MonthReport | null> {
  const context = await readContext(tx, propertyId);
  if (!context) return null;

  const month = resolveMonth(parseMonth(monthInput), context.today);
  const priorMonth = shiftMonth(month, -1);
  const start = monthStart(month);
  const end = monthEnd(month);
  const windowStart = monthStart(priorMonth);

  // One read covers the month and the one before it, so the comparison is made
  // from the same rows as the headline.
  const window = await readNights(tx, context, windowStart, end);
  const money = context.mayReadMoney
    ? await readMoney(tx, context, windowStart, end)
    : null;
  const firstActivity = await readFirstActivity(tx, propertyId);

  const monthDays = window.filter((day) => day.date >= start);
  const priorDays = window.filter((day) => day.date < start);
  const hasActivity = firstActivity !== null && end >= firstActivity;

  const closedDays = monthDays.filter((day) => day.state === "closed");
  const closedThrough = closedDays.at(-1)?.date ?? null;
  const state: MonthState = !hasActivity
    ? "no_activity"
    : closedDays.length === monthDays.length
      ? "closed"
      : "open";

  const figures = hasActivity ? figuresOf(totalsOf(monthDays, money)) : null;

  return {
    propertyId,
    currency: context.currency,
    mayReadMoney: context.mayReadMoney,
    today: context.today,
    month,
    state,
    daysInMonth: daysInMonth(month),
    daysClosed: closedDays.length,
    closedThrough,
    figures,
    prior: figures
      ? priorMonthOf({
          month: priorMonth,
          priorDays,
          money,
          figures,
          open: state === "open",
          elapsed: closedThrough ? Number(closedThrough.slice(8, 10)) : 0,
          firstActivity,
        })
      : null,
    days: monthDays.map((day) =>
      dayRowOf(day, money?.get(day.date), context.mayReadMoney, hasActivity),
    ),
    previousMonth: hasActivity ? priorMonth : null,
    nextMonth: month < monthOf(context.today) ? shiftMonth(month, 1) : null,
  };
}

/**
 * The prior month to set beside this one. An open month is compared with the
 * same number of elapsed days of the prior, never with all of it: ten days of
 * this month against thirty of the last would call every open month a decline
 * (AN-S2-06). A prior with nothing in the compared days has no figures and
 * reads as a dash (AN-S2-07).
 */
function priorMonthOf(input: {
  month: string;
  priorDays: readonly NightsDay[];
  money: Parameters<typeof totalsOf>[1];
  figures: Figures;
  open: boolean;
  elapsed: number;
  firstActivity: string | null;
}): PriorMonth {
  const compared = input.open
    ? input.priorDays.filter(
        (day) => Number(day.date.slice(8, 10)) <= input.elapsed,
      )
    : input.priorDays;
  const totals = totalsOf(compared, input.money);
  const comparedEnd = compared.at(-1)?.date;
  const hasActivity =
    totals.daysClosed > 0 &&
    comparedEnd !== undefined &&
    input.firstActivity !== null &&
    comparedEnd >= input.firstActivity;
  const figures = hasActivity ? figuresOf(totals) : null;
  return {
    month: input.month,
    figures,
    sameElapsedDays: input.open,
    changes: figures ? changesOf(input.figures, figures) : null,
  };
}
