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
  type PropertyContext,
  type Reader,
  type Totals,
} from "./analytics-engine";
import {
  readDayCorrections,
  readDayStays,
  readTypeNights,
  readTypeRoomMoney,
  readUnchargedNights,
  unchargedTotalsOf,
  unitTypeTotalsOf,
  type DayCorrectionRow,
  type DayStayRow,
  type UnchargedReason,
  type UnitType,
  type UnitTypeTotals,
} from "./analytics-breakdown";
import {
  addDays,
  daysInMonth,
  isBusinessDate,
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

function trailingWindow(
  range: Exclude<AnalyticsRange, "mtd">,
  today: string,
): { start: string; end: string } {
  switch (range) {
    case "today":
      return { start: today, end: today };
    case "30d":
      return { start: addDays(today, -29), end: today };
    case "7d":
      return { start: addDays(today, -6), end: today };
  }
}

function ratioPercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

// ---------------------------------------------------------------------------
// A period: a month, or a trailing window
// ---------------------------------------------------------------------------

/**
 * How settled a period is.
 *
 * - `no_activity`: nobody has slept at the Property by the end of it.
 * - `closed`: every day since the Property had a unit has closed.
 * - `in_progress`: a month that is not over, or a window, which always ends
 *   today and today is never closed.
 * - `incomplete`: a month that is over with days that were never closed, so
 *   its revenue covers fewer days than it has.
 */
export type PeriodState =
  "no_activity" | "closed" | "in_progress" | "incomplete";

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
 * A period's headline.
 *
 * Occupancy and the nights behind it are counted over every day that has
 * happened, closed or not: a night slept needs no charge to have been slept
 * (RANZ-52). Revenue, and the rates that divide it, are counted over the
 * closed days only, because that is where a night has been charged.
 *
 * A rate is null when its denominator is zero — a dash on screen, never zero
 * and never infinity. Every money field is null when the viewer may not read
 * money, and while no day of the period has closed.
 */
export interface Figures {
  /** Over every day that has happened. */
  availableNights: number;
  occupiedNights: number;
  guestNights: number;
  residentNights: number;
  occupancyPercent: number | null;
  /** Over the closed days: the nights revenue is divided by and charged against. */
  closedAvailableNights: number;
  closedGuestNights: number;
  /** Guest nights that have a room night charge: ADR's denominator. */
  chargedGuestNights: number;
  /** Guest nights of the closed days that earned no room night charge. */
  unchargedGuestNights: number;
  /**
   * Guest nights were slept on the closed days and none was charged, so there
   * is no room revenue to speak of — not a revenue of zero. Money figures that
   * would read zero are a dash that says so.
   */
  roomRevenueUnknown: boolean;
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

export interface DayRow {
  date: string;
  state: DayState;
  /** The Property had no unit yet: the day is before it opened. */
  beforeOpening: boolean;
  occupiedNights: number;
  availableNights: number;
  /** Null for a future day, a day with no inventory and a period with no activity. */
  occupancyPercent: number | null;
  /** Net. Null when the viewer may not read money, and for a day not closed. */
  roomRevenueMinor: number | null;
}

/** The nights of one unit type over the days that have happened, which add up to the headline. */
export interface UnitTypeRow {
  unitType: UnitType;
  availableNights: number;
  occupiedNights: number;
  guestNights: number;
  residentNights: number;
  /** Guest nights that have a room night charge, over the closed days: ADR's denominator. */
  chargedGuestNights: number;
  occupancyPercent: number | null;
  /** Net, over the closed days. Null when the viewer may not read money. */
  roomRevenueMinor: number | null;
  adrMinor: number | null;
}

/** Occupied nights that earned no charge, and why: operational, never money. */
export interface UnchargedNights {
  reason: UnchargedReason;
  nights: number;
}

/** What a month and a trailing window say alike: the same figures, the same rules. */
export interface PeriodReport {
  propertyId: string;
  currency: string;
  mayReadMoney: boolean;
  /** The Property's business date today. */
  today: string;
  state: PeriodState;
  /** Days of the period that have happened since the Property had a unit. */
  daysCounted: number;
  daysClosed: number;
  /** Days that have happened before the Property had a unit. */
  daysBeforeOpening: number;
  /** The last closed business date in the period, or null when none has. */
  closedThrough: string | null;
  /** Days waiting for the front desk to close them, as Close the day counts them. */
  daysWaiting: number;
  /** Whether the viewer may close the day, which is where those days clear. */
  mayCloseDay: boolean;
  /** Null for a period with no activity: nothing happened is not zero. */
  figures: Figures | null;
  /** Every day of the period, closed or not. */
  days: DayRow[];
  /** One row per unit type the Property has; empty for a period with no activity. */
  byUnitType: UnitTypeRow[];
  /** Over the closed days, by reason; a reason with no nights is absent. */
  unchargedNights: UnchargedNights[];
}

export interface WindowReport extends PeriodReport {
  range: Exclude<AnalyticsRange, "mtd">;
  startDate: string;
  endDate: string;
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
  /** Null when there is nothing to compare: the prior had no activity in the days compared. */
  figures: Figures | null;
  /** True when the month is not over, so the prior covers only the same elapsed days. */
  sameElapsedDays: boolean;
  changes: FigureChanges | null;
}

export interface MonthReport extends PeriodReport {
  /** `YYYY-MM`. */
  month: string;
  daysInMonth: number;
  prior: PriorMonth | null;
  previousMonth: string | null;
  nextMonth: string | null;
}

/**
 * Totals into a headline. Occupancy is read from `totals`; revenue and the
 * rates that divide it from `closedTotals`, which is the same totals for a
 * period and a narrower span of the prior month it is compared with.
 */
function figuresOf(totals: Totals, closedTotals: Totals = totals): Figures {
  // No day has closed: no night has been charged and no payment is counted, so
  // there is no revenue to show — which is not a revenue of zero (ANALYTICS-02).
  const money = closedTotals.daysClosed > 0 ? closedTotals.money : null;
  const closed = closedTotals.closed;
  const unchargedGuestNights = Math.max(
    0,
    closed.guestNights - closed.chargedGuestNights,
  );
  const roomRevenueUnknown =
    closed.guestNights > 0 && closed.chargedGuestNights === 0;
  return {
    availableNights: totals.elapsed.availableNights,
    occupiedNights: totals.elapsed.occupiedNights,
    guestNights: totals.elapsed.guestNights,
    residentNights: totals.elapsed.residentNights,
    occupancyPercent: ratioPercent(
      totals.elapsed.occupiedNights,
      totals.elapsed.availableNights,
    ),
    closedAvailableNights: closed.availableNights,
    closedGuestNights: closed.guestNights,
    chargedGuestNights: closed.chargedGuestNights,
    unchargedGuestNights,
    roomRevenueUnknown,
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
      money && closed.chargedGuestNights > 0
        ? Math.round(money.roomNetMinor / closed.chargedGuestNights)
        : null,
    revParMinor:
      money && !roomRevenueUnknown && closed.availableNights > 0
        ? Math.round(money.roomNetMinor / closed.availableNights)
        : null,
    collectedMinor: money ? money.collected.totalMinor : null,
    payments: money ? { ...money.collected } : null,
    revenueBookedMinor: money ? money.totalMinor : null,
    differenceMinor: money
      ? money.totalMinor - money.collected.totalMinor
      : null,
  };
}

function unitTypeRowOf(total: UnitTypeTotals): UnitTypeRow {
  const occupied = total.guestNights + total.residentNights;
  const net = total.roomNetMinor;
  return {
    unitType: total.unitType,
    availableNights: total.availableNights,
    occupiedNights: occupied,
    guestNights: total.guestNights,
    residentNights: total.residentNights,
    chargedGuestNights: total.chargedGuestNights,
    occupancyPercent: ratioPercent(occupied, total.availableNights),
    roomRevenueMinor: net,
    adrMinor:
      net !== null && total.chargedGuestNights > 0
        ? Math.round(net / total.chargedGuestNights)
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
    beforeOpening: day.state !== "future" && day.unitCount === 0,
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
 * What the Close the day screen and the Today figure also say of the days: the
 * counts that decide how settled a period is, taken from the days themselves.
 */
function settledOf(
  days: readonly NightsDay[],
  hasActivity: boolean,
  current: boolean,
): {
  state: PeriodState;
  daysCounted: number;
  daysBeforeOpening: number;
} {
  const happened = days.filter((day) => day.state !== "future");
  const sinceOpening = happened.filter((day) => day.unitCount > 0);
  const unclosed = sinceOpening.filter((day) => day.state === "open");
  const state: PeriodState = !hasActivity
    ? "no_activity"
    : current
      ? "in_progress"
      : unclosed.length > 0
        ? "incomplete"
        : "closed";
  return {
    state,
    daysCounted: sinceOpening.length,
    daysBeforeOpening: happened.length - sinceOpening.length,
  };
}

interface PeriodRead {
  report: PeriodReport;
  /** The days of the period, and the days before it that were read beside them. */
  days: NightsDay[];
  before: NightsDay[];
  money: Awaited<ReturnType<typeof readMoney>> | null;
  firstActivity: string | null;
}

/**
 * Everything a period of days says, read on the caller's transaction. `readFrom`
 * is where the read starts when more than the period is wanted — a month is
 * read with the one before it, so the comparison comes from the same rows as
 * the headline.
 */
async function readPeriod(
  tx: Reader,
  context: PropertyContext,
  period: { start: string; end: string; current: boolean },
  readFrom: string,
): Promise<PeriodRead> {
  const { start, end } = period;
  const rows = await readNights(tx, context, readFrom, end);
  const money = context.mayReadMoney
    ? await readMoney(tx, context, readFrom, end)
    : null;
  const firstActivity = await readFirstActivity(tx, context.propertyId);

  const days = rows.filter((day) => day.date >= start);
  const before = rows.filter((day) => day.date < start);
  const hasActivity = firstActivity !== null && end >= firstActivity;

  const closedDays = days.filter((day) => day.state === "closed");
  const elapsedDates: ReadonlySet<string> = new Set(
    days.filter((day) => day.state !== "future").map((day) => day.date),
  );
  const closedDates: ReadonlySet<string> = new Set(
    closedDays.map((day) => day.date),
  );
  const [typeNights, typeMoney, uncharged] = hasActivity
    ? [
        await readTypeNights(tx, context, start, end),
        // No day closed: no night has been charged, and a revenue of zero by
        // unit type would be the same unknown shown as zero (ANALYTICS-02).
        context.mayReadMoney && closedDays.length > 0
          ? await readTypeRoomMoney(tx, context, start, end)
          : null,
        await readUnchargedNights(tx, context, start, end),
      ]
    : [[], null, []];

  const settled = settledOf(days, hasActivity, period.current);
  return {
    days,
    before,
    money,
    firstActivity,
    report: {
      propertyId: context.propertyId,
      currency: context.currency,
      mayReadMoney: context.mayReadMoney,
      today: context.today,
      state: settled.state,
      daysCounted: settled.daysCounted,
      daysClosed: closedDays.length,
      daysBeforeOpening: settled.daysBeforeOpening,
      closedThrough: closedDays.at(-1)?.date ?? null,
      daysWaiting: context.daysWaiting,
      mayCloseDay: context.mayCloseDay,
      figures: hasActivity ? figuresOf(totalsOf(days, money)) : null,
      days: days.map((day) =>
        dayRowOf(day, money?.get(day.date), context.mayReadMoney, hasActivity),
      ),
      byUnitType: unitTypeTotalsOf(
        elapsedDates,
        closedDates,
        typeNights,
        typeMoney,
      ).map(unitTypeRowOf),
      unchargedNights: unchargedTotalsOf(closedDates, uncharged),
    },
  };
}

/**
 * A trailing window of a Property's business dates — today, the last seven days
 * or the last thirty — explained exactly as a month is: the same headline, the
 * same rules, the same sections (ANALYTICS-09). It ends today, so it is always
 * in progress and never has a prior to be compared with.
 *
 * Null when the viewer does not reach the Property, or it has not bought
 * analytics.
 */
export async function getWindowReport(
  userId: string,
  propertyId: string,
  rangeInput?: string | null,
): Promise<WindowReport | null> {
  const range = parseRange(rangeInput);
  const trailing = range === "mtd" ? "30d" : range;
  return withOrganizationContext(
    getComposition().db,
    { userId },
    (tx) => buildWindowReport(tx, propertyId, trailing),
    { isolationLevel: "RepeatableRead" },
  );
}

/** The window, built on a transaction the caller opened. */
export async function buildWindowReport(
  tx: Reader,
  propertyId: string,
  range: Exclude<AnalyticsRange, "mtd">,
): Promise<WindowReport | null> {
  const context = await readContext(tx, propertyId);
  if (!context) return null;
  const { start, end } = trailingWindow(range, context.today);
  const read = await readPeriod(
    tx,
    context,
    { start, end, current: true },
    start,
  );
  return { ...read.report, range, startDate: start, endDate: end };
}

// ---------------------------------------------------------------------------
// A month
// ---------------------------------------------------------------------------

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
  const current = month === monthOf(context.today);

  const read = await readPeriod(
    tx,
    context,
    { start, end, current },
    monthStart(priorMonth),
  );
  const { report } = read;
  const figures = report.figures;
  const hasActivity = figures !== null;

  return {
    ...report,
    month,
    daysInMonth: daysInMonth(month),
    prior: figures
      ? priorMonthOf({
          month: priorMonth,
          priorDays: read.before,
          money: read.money,
          figures,
          open: current,
          elapsed: Number(context.today.slice(8, 10)),
          closedThrough: report.closedThrough
            ? Number(report.closedThrough.slice(8, 10))
            : 0,
          firstActivity: read.firstActivity,
        })
      : null,
    // A month the Property did not exist in is not one to step back to.
    previousMonth:
      hasActivity &&
      read.firstActivity !== null &&
      monthEnd(priorMonth) >= read.firstActivity
        ? priorMonth
        : null,
    nextMonth: month < monthOf(context.today) ? shiftMonth(month, 1) : null,
  };
}

/**
 * The prior month to set beside this one. A month that is not over is compared
 * with the same number of elapsed days of the prior, never with all of it: ten
 * days of this month against thirty of the last would call every open month a
 * decline (AN-S2-06). Nights are compared over the days that have happened,
 * as the headline counts them, and revenue over the days that have closed.
 *
 * Nothing to compare means the prior had no activity in the days compared
 * (AN-S2-07). That a month has no closed day yet is not a reason: its occupancy
 * is counted over the days so far and is compared, and a revenue change from
 * no closed day is a dash by the same rule as any change from nothing
 * (ANALYTICS-05).
 */
function priorMonthOf(input: {
  month: string;
  priorDays: readonly NightsDay[];
  money: Parameters<typeof totalsOf>[1];
  figures: Figures;
  open: boolean;
  /** The day of the month today is: how many days this month has had so far. */
  elapsed: number;
  /** The day of the month the last close reached; 0 when none has. */
  closedThrough: number;
  firstActivity: string | null;
}): PriorMonth {
  const within = (days: readonly NightsDay[], dayOfMonth: number) =>
    days.filter((day) => Number(day.date.slice(8, 10)) <= dayOfMonth);
  const comparedNights = input.open
    ? within(input.priorDays, input.elapsed)
    : input.priorDays;
  const comparedMoney = input.open
    ? within(input.priorDays, input.closedThrough)
    : input.priorDays;
  const nightsTotals = totalsOf(comparedNights, input.money);
  const moneyTotals = totalsOf(comparedMoney, input.money);
  const comparedEnd = comparedNights.at(-1)?.date;
  const priorHasActivity =
    nightsTotals.daysClosed + nightsTotals.daysOpen > 0 &&
    comparedEnd !== undefined &&
    input.firstActivity !== null &&
    comparedEnd >= input.firstActivity;
  const figures = priorHasActivity
    ? figuresOf(nightsTotals, moneyTotals)
    : null;
  return {
    month: input.month,
    figures,
    sameElapsedDays: input.open,
    changes: figures ? changesOf(input.figures, figures) : null,
  };
}

// ---------------------------------------------------------------------------
// A day
// ---------------------------------------------------------------------------

/**
 * One Stay on the day opened. `chargeMinor` is a key only for a viewer who may
 * read money, and only on a night that was charged: for anyone else it is not
 * in the response at all (AN-S3-05).
 */
export interface DayDetailStay extends Omit<DayStayRow, "chargeMinor"> {
  chargeMinor?: number;
}

/** A correction to one of the day's room nights. Money, so only for those who may read it. */
export type DayCorrection = DayCorrectionRow;

/**
 * One business date, opened from the month table: the Stays that held a unit
 * that night, each with its unit and its night's charge or the reason there
 * was none. The counts are the day's row of the table.
 *
 * `currency` and `corrections` are keys only for a viewer who may read money.
 * A viewer who may not gets the Stays, the units and the reasons, and the
 * response holds no amount — not a null, not a field the screen leaves out
 * (AN-S3-05).
 */
export interface DayDetail {
  propertyId: string;
  date: string;
  /** A day to come cannot be opened, so it is one of these two. */
  state: Exclude<DayState, "future">;
  occupiedNights: number;
  /** Guest nights with a room night charge. */
  chargedNights: number;
  stays: DayDetailStay[];
  currency?: string;
  corrections?: DayCorrection[];
}

/**
 * One day of a Property's business calendar, in one REPEATABLE READ
 * transaction so its Stays, charges and corrections are one moment.
 *
 * Null when the viewer does not reach the Property, it has not bought
 * analytics, the date is not a date, or the day has not happened: the screen
 * shows its not-found state and never an empty day. The open day can be opened;
 * its nights are not charged until it closes (AN-S2-05).
 */
export async function getDayDetail(
  userId: string,
  propertyId: string,
  date: string,
): Promise<DayDetail | null> {
  return withOrganizationContext(
    getComposition().db,
    { userId },
    (tx) => buildDayDetail(tx, propertyId, date),
    { isolationLevel: "RepeatableRead" },
  );
}

/** The day, built on a transaction the caller opened. */
export async function buildDayDetail(
  tx: Reader,
  propertyId: string,
  date: string,
): Promise<DayDetail | null> {
  if (!isBusinessDate(date)) return null;
  const context = await readContext(tx, propertyId);
  if (!context || date > context.today) return null;

  const [night] = await readNights(tx, context, date, date);
  if (!night || night.state === "future") return null;

  const stays = await readDayStays(tx, context, date);
  const detail: DayDetail = {
    propertyId,
    date,
    state: night.state,
    occupiedNights: stays.length,
    chargedNights: stays.filter((stay) => stay.night === "charged").length,
    stays: stays.map(({ chargeMinor, ...stay }) =>
      context.mayReadMoney && chargeMinor !== null
        ? { ...stay, chargeMinor }
        : stay,
    ),
  };
  if (!context.mayReadMoney) return detail;

  return {
    ...detail,
    currency: context.currency,
    corrections: await readDayCorrections(tx, context, date),
  };
}
