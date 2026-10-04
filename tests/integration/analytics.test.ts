/**
 * Analytics against a real database (docs/features/analytics, slices 1 and 2).
 *
 * Every test here calls the query — `getPropertyAnalytics` for the trailing
 * ranges, `getMonthReport` for a month — as `ranza_app` under the policies.
 * The first version of the slice-1 tests restated the formulas inline and never
 * called anything (AN-DIFF-06), so none of them could fail. Who reaches a
 * Property, whether the Organization bought analytics, whether a viewer may
 * read money and which business date a line belongs to are the database's
 * answers here, not a fixture's.
 *
 * Fixtures date themselves from each Property's own today
 * (`app.property_today`), never a fixed date, and are new every run: a closed
 * day is history that cannot be deleted. Closed days are written in replica
 * mode because the clock can only produce them one a day.
 *
 * Defects reproduced before they were fixed (AN-DIFF-01 to 05), run against the
 * unmodified query, each red for the reason its row gives:
 *   AN-DIFF-01  paymentsByMethod.cashMinor -15000, card -4000, total -19000
 *               where 14000 was collected
 *   AN-DIFF-02  otherRevenueMinor 3000 where 2000 belongs: the 03:30 line, which
 *               is the working day before the window, was counted in it
 *   AN-DIFF-03  availableRoomNights 14 (two units x seven days) where a unit
 *               created three days ago gives 9
 *   AN-DIFF-04  occupiedRoomNights 5 where 4 closed: tonight's night was counted
 *   AN-DIFF-05  roomRevenueMinor 32000 where 42000: a night outside the window,
 *               reversed today, took 10000 off a week that never held it
 *
 * Breaks that were run on the finished query, and what went red. Each was
 * restored and the suite re-run green afterwards.
 *   money gate skipped (mayReadMoney always true)
 *     every_money_figure_is_null_without_permission,
 *     viewer_without_permission_sees_no_financials
 *   property filter dropped from the context read (the first visible Property
 *   answers for any id)
 *     other_property_month_is_not_found_not_empty,
 *     cross_organization_analytics_isolated, unentitled_property_month_is_refused,
 *     unentitled_viewer_sees_empty_state, and most of the rest, which then read
 *     another Property's data
 *   open day counted in every figure (state 'future' skipped instead of 'closed' kept)
 *     open_day_excluded_from_rates, open_month_is_labelled_and_counts_closed_days,
 *     month_to_date_window_computed, zero_stays_produces_zero_adr_revpar,
 *     unit_added_mid_month_counts_from_its_day,
 *     viewer_with_permission_sees_financials
 *   getMonthReport opened without REPEATABLE READ
 *     figures_come_from_one_snapshot
 *   lines dated by posted_at cast to a date
 *     report_dates_lines_with_app_business_date,
 *     posting_before_cutoff_belongs_to_the_working_day,
 *     other_revenue_dated_by_posting_business_date,
 *     payments_collected_read_positive_net_of_reversals,
 *     revenue_against_collected_difference_shown
 *   room night reversal dated by its own posting day
 *     room_night_correction_counts_on_the_night_it_corrects,
 *     month_compared_with_same_elapsed_days, resident_nights_do_not_dilute_adr,
 *     revenue_against_collected_difference_shown
 *   other-revenue reversal dated by the charge it reverses
 *     other_revenue_dated_by_posting_business_date,
 *     posting_before_cutoff_belongs_to_the_working_day,
 *     revenue_against_collected_difference_shown
 *   payments summed as stored (sign not flipped)
 *     payments_collected_read_positive_net_of_reversals,
 *     reversals_subtracted_from_payments, payment_methods_aggregated_accurately,
 *     revenue_against_collected_difference_shown
 *   inventory = every unit on every day (created_at ignored)
 *     unit_added_mid_month_counts_from_its_day, open_day_excluded_from_rates
 *
 * One break that first went unnoticed: casting posted_at to a date kept the
 * cutoff tests green, because in a UTC session a UTC+3 Property's 01:00 and
 * 05:00 lines land on the same date either way. The two ways of dating a line
 * disagree only between 03:00 and 04:00 local, so the fixture now holds a 03:30
 * line and the test asserts, before believing itself, that the two disagree on it.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import { withOrganizationContext } from "../../packages/db/src";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ db: holder.db }),
}));

import {
  buildMonthReport,
  getMonthReport,
  getPropertyAnalytics,
  resolveAnalyticsView,
  type MonthReport,
} from "../../apps/operator-workspace/src/server/analytics";
import {
  addDays,
  daysInMonth,
  monthEnd,
  monthOf,
  monthStart,
  shiftMonth,
} from "../../apps/operator-workspace/src/server/analytics-months";

const ORG = "ae000002-0000-4000-8000-000000000001";
const OTHER_ORG = "ae000002-0000-4000-8000-000000000002";
const FINANCE_USER = "ae000001-0000-4000-8000-000000000001";
const HOUSEKEEPER = "ae000001-0000-4000-8000-000000000002";
const ASSIGNED = "ae000001-0000-4000-8000-000000000003";
const OUTSIDER = "ae000001-0000-4000-8000-000000000004";

const BUDGET_MS = 120_000;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
holder.db = prisma;

type Owner = Pick<typeof owner, "$executeRawUnsafe" | "$queryRawUnsafe">;

interface PropertyOptions {
  timezone?: string;
  cutoff?: string;
  currency?: string;
  /** Whether the Organization may use analytics at it. */
  capable?: boolean;
  organization?: string;
}

interface Property {
  id: string;
  organization: string;
  today: string;
}

// -- fixtures ---------------------------------------------------------------

/** Runs `run` as the owner with triggers off: history the clock cannot make. */
async function inReplica<T>(run: (tx: Owner) => Promise<T>): Promise<T> {
  return owner.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "set local session_replication_role = replica",
      );
      return run(tx);
    },
    { timeout: BUDGET_MS, maxWait: BUDGET_MS },
  );
}

async function seedWorld(): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'analytics-finance@example.test'),
       ($2, 'analytics-housekeeper@example.test'),
       ($3, 'analytics-assigned@example.test'),
       ($4, 'analytics-outsider@example.test')
     on conflict (id) do nothing`,
    FINANCE_USER,
    HOUSEKEEPER,
    ASSIGNED,
    OUTSIDER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Analytics Integration', 'active'),
       ($2, 'Analytics Elsewhere', 'active')
     on conflict (id) do nothing`,
    ORG,
    OTHER_ORG,
  );
  for (const org of [ORG, OTHER_ORG]) {
    await owner.$executeRawUnsafe(
      `insert into public.subscriptions (organization_id, status)
       values ($1, 'active') on conflict (organization_id) do nothing`,
      org,
    );
    await owner.$executeRawUnsafe(
      `insert into public.entitlements (organization_id, module_key, status)
       values ($1::uuid, 'analytics', 'active')
       on conflict (organization_id, module_key) do nothing`,
      org,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $3, 'finance', 'organization_wide'),
       ($1, $4, 'housekeeping', 'organization_wide'),
       ($1, $5, 'manager', 'assigned_properties'),
       ($2, $6, 'manager', 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    OTHER_ORG,
    FINANCE_USER,
    HOUSEKEEPER,
    ASSIGNED,
    OUTSIDER,
  );
}

async function newProperty(options: PropertyOptions = {}): Promise<Property> {
  const id = randomUUID();
  const organization = options.organization ?? ORG;
  await owner.$executeRawUnsafe(
    `insert into public.properties
       (id, organization_id, name, timezone, currency, business_date_cutoff)
     values ($1::uuid, $2::uuid, 'Analytics ' || left($1::text, 8), $3, $4, $5::time)`,
    id,
    organization,
    options.timezone ?? "Europe/Istanbul",
    options.currency ?? "TRY",
    options.cutoff ?? "04:00",
  );
  if (options.capable !== false) {
    await owner.$executeRawUnsafe(
      `insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       values ($1::uuid, $2::uuid, 'analytics', true)`,
      id,
      organization,
    );
  }
  const [row] = await owner.$queryRawUnsafe<{ today: string }[]>(
    `select to_char(app.property_today($1::uuid), 'YYYY-MM-DD') as today`,
    id,
  );
  return { id, organization, today: row!.today };
}

/** Closes the `days` business days before today, as the clock would over time. */
async function closeBefore(property: Property, days: number): Promise<void> {
  await inReplica((tx) =>
    tx.$executeRawUnsafe(
      `insert into public.business_day_closes
         (organization_id, property_id, business_date, closed_by_job)
       select $1::uuid, $2::uuid, app.property_today($2::uuid) - ago, 'test.fixture'
         from generate_series(1, $3::int) as ago`,
      property.organization,
      property.id,
      days,
    ),
  );
}

/** A unit created at noon local on `createdOn`, or long ago when omitted. */
async function addUnit(
  property: Property,
  name: string,
  createdOn: string = addDays(property.today, -100),
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, created_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2,
             ($5::date + time '12:00') at time zone
               (select timezone from public.properties where id = $2::uuid))`,
    id,
    property.id,
    property.organization,
    name,
    createdOn,
  );
  return id;
}

interface StayOptions {
  type?: "guest" | "resident";
  status: "departed" | "in_house";
  from: string;
  to: string;
}

async function addStay(
  tx: Owner,
  property: Property,
  unitId: string,
  options: StayOptions,
  withFolio = true,
): Promise<{ stayId: string; folioId: string | null }> {
  const stayId = randomUUID();
  await tx.$executeRawUnsafe(
    `insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on, departed_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::date, $8::date,
             case when $6 = 'departed'
                  then ($8::date + time '12:00') at time zone
                         (select timezone from public.properties where id = $3::uuid)
             end)`,
    stayId,
    property.organization,
    property.id,
    unitId,
    options.type ?? "guest",
    options.status,
    options.from,
    options.to,
  );
  if (!withFolio) return { stayId, folioId: null };
  const folioId = randomUUID();
  await tx.$executeRawUnsafe(
    `insert into public.folios (id, organization_id, property_id, stay_id, currency)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, property.currency
       from public.properties as property where property.id = $3::uuid`,
    folioId,
    property.organization,
    property.id,
    stayId,
  );
  return { stayId, folioId };
}

interface LineOptions {
  type: "charge" | "payment" | "reversal";
  amount: number;
  method?: "cash" | "card" | "bank_transfer" | "other";
  /** A room night, for this business date. */
  night?: string;
  /** The local date and time it was posted; now when omitted. */
  at?: [date: string, time: string];
  reverses?: string;
}

async function addLine(
  tx: Owner,
  property: Property,
  folioId: string,
  options: LineOptions,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `insert into public.folio_lines
       (id, organization_id, property_id, folio_id, line_type, description,
        amount_minor, reverses_line_id, payment_method, source, business_date,
        posted_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'fixture', $6::bigint,
             $7::uuid, $8, case when $9::date is null then null else 'room_night' end,
             $9::date,
             case when $10::date is null then now()
                  else ($10::date + $11::time) at time zone
                         (select timezone from public.properties where id = $3::uuid)
             end)`,
    id,
    property.organization,
    property.id,
    folioId,
    options.type,
    options.amount,
    options.reverses ?? null,
    options.method ?? null,
    options.night ?? null,
    options.at?.[0] ?? null,
    options.at?.[1] ?? null,
  );
  return id;
}

/** A room night charge, the way the close posts one. */
function night(
  tx: Owner,
  property: Property,
  folioId: string,
  date: string,
  amount: number,
): Promise<string> {
  return addLine(tx, property, folioId, {
    type: "charge",
    amount,
    night: date,
  });
}

type Viewer = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function asViewer<T>(
  userId: string,
  run: (tx: Viewer) => Promise<T>,
): Promise<T> {
  return withOrganizationContext(prisma, { userId }, run);
}

async function month(
  userId: string,
  property: Property,
  requested?: string | null,
): Promise<MonthReport> {
  const report = await getMonthReport(userId, property.id, requested);
  expect(report).not.toBeNull();
  return report!;
}

async function trailing(userId: string, property: Property, range: string) {
  const analytics = await getPropertyAnalytics(userId, property.id, range);
  expect(analytics).not.toBeNull();
  return analytics!;
}

function figures(report: MonthReport) {
  expect(report.figures).not.toBeNull();
  return report.figures!;
}

// -- the world --------------------------------------------------------------

let main: Property;
let M0: string;
let M1: string;
let M2: string;
let M3: string;
const d = (n: number) => addDays(monthStart(M1), n - 1);

let trail: Property;
let open: Property;
let revp: Property;
let quiet: Property;
let zero: Property;
let unassigned: Property;
let foreign: Property;
let uncapable: Property;

/**
 * MAIN: a closed September, called M1 here, the month before today's.
 *
 * Units: A1 and A2 from long ago, A3 created at noon on the 20th of M1.
 * Stays, all departed, with the room night price each was charged:
 *   Smid  guest    A1  last day of M2 to the 2nd of M1   2 nights   15000
 *   S1    guest    A1  5th to 8th                        3 nights   10000
 *   S2    guest    A2  6th to 8th                        2 nights   20000
 *   S3    resident A3  21st to 24th                      3 nights   uncharged
 * Corrections and other lines are described where they are written.
 */
async function seedMain(): Promise<void> {
  main = await newProperty();
  M0 = monthOf(main.today);
  M1 = shiftMonth(M0, -1);
  M2 = shiftMonth(M0, -2);
  M3 = shiftMonth(M0, -3);
  await closeBefore(main, 120);

  const a1 = await addUnit(main, "A1");
  const a2 = await addUnit(main, "A2");
  const a3 = await addUnit(main, "A3", d(20));
  const m2Last = addDays(monthStart(M1), -1);

  await inReplica(async (tx) => {
    const smid = await addStay(tx, main, a1, {
      status: "departed",
      from: m2Last,
      to: d(2),
    });
    await night(tx, main, smid.folioId!, m2Last, 15000);
    await night(tx, main, smid.folioId!, d(1), 15000);
    // 01:00 on the 1st is still the working day before, the last of M2; 05:00
    // is past the 04:00 cutoff and belongs to the 1st (AN-S2-11).
    await addLine(tx, main, smid.folioId!, {
      type: "charge",
      amount: 700,
      at: [d(1), "01:00"],
    });
    // 03:30 is the one hour of a UTC+3 night where the working day and the
    // calendar date in UTC disagree: still the day before, though the UTC date
    // has turned. Casting posted_at to a date puts it in M1.
    await addLine(tx, main, smid.folioId!, {
      type: "charge",
      amount: 600,
      at: [d(1), "03:30"],
    });
    await addLine(tx, main, smid.folioId!, {
      type: "charge",
      amount: 900,
      at: [d(1), "05:00"],
    });
    // Charged on the last day of M2, reversed in M1: the reversal is M1's.
    const m2Charge = await addLine(tx, main, smid.folioId!, {
      type: "charge",
      amount: 800,
      at: [m2Last, "12:00"],
    });
    await addLine(tx, main, smid.folioId!, {
      type: "reversal",
      amount: -800,
      reverses: m2Charge,
      at: [d(2), "12:00"],
    });

    const s1 = await addStay(tx, main, a1, {
      status: "departed",
      from: d(5),
      to: d(8),
    });
    const fifth = await night(tx, main, s1.folioId!, d(5), 10000);
    await night(tx, main, s1.folioId!, d(6), 10000);
    await night(tx, main, s1.folioId!, d(7), 10000);
    // The 5th corrected today, a month later: it belongs to the 5th.
    await addLine(tx, main, s1.folioId!, {
      type: "reversal",
      amount: -10000,
      reverses: fifth,
    });
    await addLine(tx, main, s1.folioId!, {
      type: "charge",
      amount: 5000,
      at: [d(10), "12:00"],
    });
    const charged = await addLine(tx, main, s1.folioId!, {
      type: "charge",
      amount: 3000,
      at: [d(12), "12:00"],
    });
    await addLine(tx, main, s1.folioId!, {
      type: "reversal",
      amount: -3000,
      reverses: charged,
      at: [d(13), "12:00"],
    });
    const lateReversed = await addLine(tx, main, s1.folioId!, {
      type: "charge",
      amount: 2000,
      at: [d(15), "12:00"],
    });
    await addLine(tx, main, s1.folioId!, {
      type: "reversal",
      amount: -2000,
      reverses: lateReversed,
    });
    // 100.00 cash and a 40.00 card payment that is reversed (AN-S2-13).
    await addLine(tx, main, s1.folioId!, {
      type: "payment",
      amount: -10000,
      method: "cash",
      at: [d(6), "12:00"],
    });
    const card = await addLine(tx, main, s1.folioId!, {
      type: "payment",
      amount: -4000,
      method: "card",
      at: [d(7), "12:00"],
    });
    await addLine(tx, main, s1.folioId!, {
      type: "reversal",
      amount: 4000,
      reverses: card,
      at: [d(8), "12:00"],
    });
    await addLine(tx, main, s1.folioId!, {
      type: "payment",
      amount: -2500,
      method: "bank_transfer",
      at: [d(9), "12:00"],
    });
    await addLine(tx, main, s1.folioId!, {
      type: "payment",
      amount: -1500,
      method: "other",
      at: [d(10), "12:00"],
    });

    const s2 = await addStay(tx, main, a2, {
      status: "departed",
      from: d(6),
      to: d(8),
    });
    await night(tx, main, s2.folioId!, d(6), 20000);
    await night(tx, main, s2.folioId!, d(7), 20000);

    await addStay(tx, main, a3, {
      type: "resident",
      status: "departed",
      from: d(21),
      to: d(24),
    });
  });
}

/**
 * TRAIL: the trailing seven days, T being today.
 *
 * Units D1 from long ago and D2 created at noon on T-3.
 *   G2  guest D1  T-11 to T-9  nights T-11, T-10 @10000; T-10 reversed today
 *   G1  guest D1  T-5 to T-2   nights T-5, T-4, T-3 @10000
 *   G3  guest D2  in house from T-1: night T-1 @12000, tonight not yet charged
 * Other revenue on G1: 1000 at 03:30 on T-6 (the working day T-7) and 2000 at
 * 05:00 on T-6. Payments on G1: cash 5000 at 03:30 on T-6, card 4000 at 05:00
 * on T-6, cash 10000 on T-2, and 3000 on T-1 reversed the same day.
 */
async function seedTrail(): Promise<void> {
  trail = await newProperty();
  await closeBefore(trail, 120);
  const t = trail.today;
  const ago = (n: number) => addDays(t, -n);
  const d1 = await addUnit(trail, "D1");
  const d2 = await addUnit(trail, "D2", ago(3));
  await inReplica(async (tx) => {
    const g2 = await addStay(tx, trail, d1, {
      status: "departed",
      from: ago(11),
      to: ago(9),
    });
    await night(tx, trail, g2.folioId!, ago(11), 10000);
    const outside = await night(tx, trail, g2.folioId!, ago(10), 10000);
    await addLine(tx, trail, g2.folioId!, {
      type: "reversal",
      amount: -10000,
      reverses: outside,
    });

    const g1 = await addStay(tx, trail, d1, {
      status: "departed",
      from: ago(5),
      to: ago(2),
    });
    for (const day of [5, 4, 3]) {
      await night(tx, trail, g1.folioId!, ago(day), 10000);
    }
    await addLine(tx, trail, g1.folioId!, {
      type: "charge",
      amount: 1000,
      at: [ago(6), "03:30"],
    });
    await addLine(tx, trail, g1.folioId!, {
      type: "charge",
      amount: 2000,
      at: [ago(6), "05:00"],
    });
    await addLine(tx, trail, g1.folioId!, {
      type: "payment",
      amount: -5000,
      method: "cash",
      at: [ago(6), "03:30"],
    });
    await addLine(tx, trail, g1.folioId!, {
      type: "payment",
      amount: -4000,
      method: "card",
      at: [ago(6), "05:00"],
    });
    await addLine(tx, trail, g1.folioId!, {
      type: "payment",
      amount: -10000,
      method: "cash",
      at: [ago(2), "12:00"],
    });
    const other = await addLine(tx, trail, g1.folioId!, {
      type: "payment",
      amount: -3000,
      method: "other",
      at: [ago(1), "12:00"],
    });
    await addLine(tx, trail, g1.folioId!, {
      type: "reversal",
      amount: 3000,
      reverses: other,
      at: [ago(1), "15:00"],
    });

    const g3 = await addStay(tx, trail, d2, {
      status: "in_house",
      from: ago(1),
      to: addDays(t, 2),
    });
    await night(tx, trail, g3.folioId!, ago(1), 12000);
  });
}

/**
 * OPEN: the open day. B1 and B2 from long ago.
 *   in house on B1 since T-2, nights T-2 and T-1 charged 8000 each
 *   in house on B2 since today, tonight not charged
 */
async function seedOpen(): Promise<void> {
  open = await newProperty();
  await closeBefore(open, 120);
  const t = open.today;
  const b1 = await addUnit(open, "B1");
  const b2 = await addUnit(open, "B2");
  await inReplica(async (tx) => {
    const first = await addStay(tx, open, b1, {
      status: "in_house",
      from: addDays(t, -2),
      to: addDays(t, 2),
    });
    await night(tx, open, first.folioId!, addDays(t, -2), 8000);
    await night(tx, open, first.folioId!, addDays(t, -1), 8000);
    await addStay(tx, open, b2, {
      status: "in_house",
      from: t,
      to: addDays(t, 2),
    });
  });
}

/**
 * REVP: nights T-3 and T-2 charged 10000 each, T-2 reversed on T-1. Payments
 * on T-2: cash 5000 reversed on T-1, card 3000, bank transfer 2000, other 1000.
 */
async function seedReversals(): Promise<void> {
  revp = await newProperty();
  await closeBefore(revp, 30);
  const t = revp.today;
  const unit = await addUnit(revp, "R1");
  await inReplica(async (tx) => {
    const stay = await addStay(tx, revp, unit, {
      status: "departed",
      from: addDays(t, -3),
      to: addDays(t, -1),
    });
    await night(tx, revp, stay.folioId!, addDays(t, -3), 10000);
    const reversed = await night(
      tx,
      revp,
      stay.folioId!,
      addDays(t, -2),
      10000,
    );
    await addLine(tx, revp, stay.folioId!, {
      type: "reversal",
      amount: -10000,
      reverses: reversed,
      at: [addDays(t, -1), "12:00"],
    });
    const cash = await addLine(tx, revp, stay.folioId!, {
      type: "payment",
      amount: -5000,
      method: "cash",
      at: [addDays(t, -2), "12:00"],
    });
    await addLine(tx, revp, stay.folioId!, {
      type: "reversal",
      amount: 5000,
      reverses: cash,
      at: [addDays(t, -1), "12:00"],
    });
    for (const [method, amount] of [
      ["card", 3000],
      ["bank_transfer", 2000],
      ["other", 1000],
    ] as const) {
      await addLine(tx, revp, stay.folioId!, {
        type: "payment",
        amount: -amount,
        method,
        at: [addDays(t, -2), "12:00"],
      });
    }
  });
}

beforeAll(async () => {
  await seedWorld();
  await seedMain();
  await seedTrail();
  await seedOpen();
  await seedReversals();

  quiet = await newProperty();
  await closeBefore(quiet, 30);
  await addUnit(quiet, "Q1");
  await addUnit(quiet, "Q2");

  zero = await newProperty();
  await closeBefore(zero, 30);

  unassigned = await newProperty();
  foreign = await newProperty({ organization: OTHER_ORG });
  uncapable = await newProperty({ capable: false });
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id, status)
     values ($1::uuid, $2::uuid, $3::uuid, 'active')`,
    main.id,
    ORG,
    ASSIGNED,
  );
}, BUDGET_MS * 3);

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

// -- slice 1: the trailing ranges -------------------------------------------

describe("the trailing ranges, run through the query", () => {
  it(
    "unentitled_viewer_sees_empty_state",
    async () => {
      expect(
        await getPropertyAnalytics(FINANCE_USER, uncapable.id, "7d"),
      ).toBeNull();
      expect(
        await getPropertyAnalytics(FINANCE_USER, trail.id, "7d"),
      ).not.toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "cross_organization_analytics_isolated",
    async () => {
      expect(await getPropertyAnalytics(OUTSIDER, trail.id, "7d")).toBeNull();
      expect(
        await getPropertyAnalytics(FINANCE_USER, foreign.id, "7d"),
      ).toBeNull();
      expect(
        await getPropertyAnalytics(OUTSIDER, foreign.id, "7d"),
      ).not.toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "zero_units_produces_zero_occupancy",
    async () => {
      const analytics = await trailing(FINANCE_USER, zero, "7d");
      expect(analytics.totalSellableUnits).toBe(0);
      expect(analytics.availableRoomNights).toBe(0);
      expect(analytics.occupancyRatePercent).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "zero_stays_produces_zero_adr_revpar",
    async () => {
      const analytics = await trailing(FINANCE_USER, quiet, "7d");
      // Two units over the six closed days of the window.
      expect(analytics.availableRoomNights).toBe(12);
      expect(analytics.occupiedRoomNights).toBe(0);
      expect(analytics.adrMinor).toBe(0);
      expect(analytics.revParMinor).toBe(0);
      expect(analytics.occupancyRatePercent).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "reversals_subtracted_from_revenue",
    async () => {
      const analytics = await trailing(FINANCE_USER, revp, "7d");
      // 2 x 10000 charged, one reversed.
      expect(analytics.roomRevenueMinor).toBe(10000);
    },
    BUDGET_MS,
  );

  it(
    "reversals_subtracted_from_payments",
    async () => {
      const analytics = await trailing(FINANCE_USER, revp, "7d");
      expect(analytics.paymentsByMethod?.cashMinor).toBe(0);
      expect(analytics.netPaymentsMinor).toBe(6000);
    },
    BUDGET_MS,
  );

  it(
    "payment_methods_aggregated_accurately",
    async () => {
      const analytics = await trailing(FINANCE_USER, revp, "7d");
      expect(analytics.paymentsByMethod).toEqual({
        cashMinor: 0,
        cardMinor: 3000,
        bankTransferMinor: 2000,
        otherMinor: 1000,
        totalMinor: 6000,
      });
    },
    BUDGET_MS,
  );

  it(
    "viewer_with_permission_sees_financials",
    async () => {
      const analytics = await trailing(FINANCE_USER, revp, "7d");
      expect(analytics.mayReadMoney).toBe(true);
      expect(analytics.roomRevenueMinor).toBe(10000);
      // 10000 over the two charged guest nights, and over six available nights.
      expect(analytics.adrMinor).toBe(5000);
      expect(analytics.revParMinor).toBe(1667);
    },
    BUDGET_MS,
  );

  it(
    "viewer_without_permission_sees_no_financials",
    async () => {
      const analytics = await trailing(HOUSEKEEPER, revp, "7d");
      expect(analytics.mayReadMoney).toBe(false);
      expect(analytics.occupiedRoomNights).toBe(2);
      for (const money of [
        analytics.roomRevenueMinor,
        analytics.otherRevenueMinor,
        analytics.totalRevenueMinor,
        analytics.adrMinor,
        analytics.revParMinor,
        analytics.netPaymentsMinor,
        analytics.paymentsByMethod,
      ]) {
        expect(money).toBeNull();
      }
      expect(
        analytics.dailySeries.every((day) => day.roomRevenueMinor === null),
      ).toBe(true);
    },
    BUDGET_MS,
  );

  it(
    "analytics_uses_property_today",
    async () => {
      // A Property 22 hours behind UTC and one 10 hours ahead: at every moment
      // at least one of them is working a different date from UTC's.
      const behind = await newProperty({
        timezone: "Pacific/Pago_Pago",
        cutoff: "11:59",
      });
      const ahead = await newProperty({ timezone: "Pacific/Kiritimati" });
      const utcToday = new Date().toISOString().slice(0, 10);
      const dates: string[] = [];
      for (const property of [behind, ahead]) {
        const analytics = await trailing(FINANCE_USER, property, "today");
        expect(analytics.today).toBe(property.today);
        expect(analytics.endDate).toBe(property.today);
        expect(analytics.startDate).toBe(property.today);
        dates.push(analytics.today);
      }
      expect(dates.some((date) => date !== utcToday)).toBe(true);
    },
    BUDGET_MS,
  );

  it(
    "trailing_week_window_computed",
    async () => {
      const analytics = await trailing(FINANCE_USER, trail, "7d");
      expect(analytics.startDate).toBe(addDays(trail.today, -6));
      expect(analytics.endDate).toBe(trail.today);
      expect(analytics.dailySeries).toHaveLength(7);
    },
    BUDGET_MS,
  );

  it(
    "trailing_month_window_computed",
    async () => {
      const analytics = await trailing(FINANCE_USER, trail, "30d");
      expect(analytics.startDate).toBe(addDays(trail.today, -29));
      expect(analytics.endDate).toBe(trail.today);
      expect(analytics.dailySeries).toHaveLength(30);
    },
    BUDGET_MS,
  );

  it(
    "month_to_date_window_computed",
    async () => {
      const analytics = await trailing(FINANCE_USER, trail, "mtd");
      const elapsed = Number(trail.today.slice(8, 10));
      expect(analytics.startDate).toBe(monthStart(monthOf(trail.today)));
      expect(analytics.endDate).toBe(trail.today);
      expect(analytics.dailySeries).toHaveLength(elapsed);
      // Amended by AN-S2-04: its figures cover the closed days, not today.
      expect(analytics.daysClosed).toBe(elapsed - 1);
    },
    BUDGET_MS,
  );
});

// -- the defects the design found by reading --------------------------------

describe("what the first version got wrong, now run", () => {
  it(
    "payments_collected_read_positive_net_of_reversals",
    async () => {
      // AN-DIFF-01: a payment is stored negative and its reversal positive,
      // and the screen summed them as stored.
      const week = await trailing(FINANCE_USER, trail, "7d");
      expect(week.paymentsByMethod).toEqual({
        cashMinor: 10000,
        cardMinor: 4000,
        bankTransferMinor: 0,
        otherMinor: 0,
        totalMinor: 14000,
      });
      expect(week.netPaymentsMinor).toBe(14000);

      // AN-S2-13: 100.00 collected, 40.00 collected and reversed, by method,
      // each on the day it was posted, and every figure positive.
      const report = await month(FINANCE_USER, main, M1);
      expect(figures(report).payments).toEqual({
        cashMinor: 10000,
        cardMinor: 0,
        bankTransferMinor: 2500,
        otherMinor: 1500,
        totalMinor: 14000,
      });
      expect(figures(report).collectedMinor).toBe(14000);
    },
    BUDGET_MS,
  );

  it(
    "report_dates_lines_with_app_business_date",
    async () => {
      // AN-DIFF-02: TRAIL has lines at 03:30 local on T-6, which is the
      // working day T-7. posted_at cast to a date, in the session's zone, puts
      // them on T-6, inside the window.
      const [cast] = await asViewer(FINANCE_USER, (tx) =>
        tx.$queryRawUnsafe<{ differs: boolean }[]>(
          `select (line.posted_at::date <> app.business_date(
                    line.posted_at, property.timezone, property.business_date_cutoff)
                  ) as differs
             from public.folio_lines as line
             join public.properties as property on property.id = line.property_id
            where line.property_id = $1::uuid and line.amount_minor = 1000`,
          trail.id,
        ),
      );
      // The fixture only proves anything where the two ways of dating differ.
      expect(cast?.differs).toBe(true);

      const week = await trailing(FINANCE_USER, trail, "7d");
      expect(week.otherRevenueMinor).toBe(2000);
      expect(week.paymentsByMethod?.cashMinor).toBe(10000);

      // AN-S2-12: the one way a date is computed, held in the source too.
      const source = readFileSync(
        "apps/operator-workspace/src/server/analytics-engine.ts",
        "utf8",
      );
      expect(source).toContain("app.business_date(");
      expect(source).not.toMatch(/posted_at\s*::\s*date/);
    },
    BUDGET_MS,
  );

  it(
    "unit_added_mid_month_counts_from_its_day",
    async () => {
      // AN-DIFF-03: D2 was created on T-3. The first version multiplied
      // today's two units by the days in the window.
      const week = await trailing(FINANCE_USER, trail, "7d");
      // D1 on six closed days, D2 on T-3, T-2 and T-1.
      expect(week.availableRoomNights).toBe(9);

      // AN-S2-08: A3 was created on the 20th of M1, a month of L days.
      const report = await month(FINANCE_USER, main, M1);
      const length = daysInMonth(M1);
      expect(figures(report).availableNights).toBe(2 * length + (length - 19));
      expect(report.days[18]).toMatchObject({
        date: d(19),
        availableNights: 2,
      });
      expect(report.days[19]).toMatchObject({
        date: d(20),
        availableNights: 3,
      });
    },
    BUDGET_MS,
  );

  it(
    "open_day_excluded_from_rates",
    async () => {
      // AN-DIFF-04: G3 is in house tonight, and tonight is charged when the
      // day closes. The first version counted the night and not the charge.
      const week = await trailing(FINANCE_USER, trail, "7d");
      expect(week.occupiedRoomNights).toBe(4);
      expect(week.availableRoomNights).toBe(9);
      expect(week.roomRevenueMinor).toBe(42000);
      expect(week.adrMinor).toBe(10500);
      expect(week.revParMinor).toBe(4667);
      expect(week.occupancyRatePercent).toBe(44.4);
      const today = week.dailySeries.at(-1);
      expect(today).toMatchObject({ date: trail.today, state: "open" });
      expect(today?.roomRevenueMinor).toBeNull();

      // AN-S2-05, in the month it falls in. B1 sleeps T-2 and T-1 (closed) and
      // B1 and B2 sleep tonight (open); only the closed nights that fall in
      // today's month count.
      const t = open.today;
      const report = await month(FINANCE_USER, open);
      const closedNights = [-2, -1].filter(
        (back) => addDays(t, back) >= monthStart(monthOf(t)),
      ).length;
      const daysClosed = Number(t.slice(8, 10)) - 1;
      expect(report.days.find((day) => day.date === t)).toMatchObject({
        state: "open",
        occupiedNights: 2,
      });
      expect(figures(report).occupiedNights).toBe(closedNights);
      expect(figures(report).availableNights).toBe(2 * daysClosed);
      expect(figures(report).adrMinor).toBe(closedNights > 0 ? 8000 : null);
      expect(figures(report).revParMinor).toBe(
        daysClosed > 0
          ? Math.round((8000 * closedNights) / (2 * daysClosed))
          : null,
      );
    },
    BUDGET_MS,
  );

  it(
    "room_night_correction_counts_on_the_night_it_corrects",
    async () => {
      // AN-DIFF-05: G2's night on T-10 is outside the window and was reversed
      // today. The first version dated the reversal by its own posting date and
      // took 10000 off a week that never held the night.
      const week = await trailing(FINANCE_USER, trail, "7d");
      expect(week.roomRevenueMinor).toBe(42000);

      // AN-S2-09: the 5th of M1 reversed today. M1 shows it gross, as a
      // correction and net, on the night's own date; today's month shows
      // nothing for it.
      const august = await month(FINANCE_USER, main, M1);
      expect(figures(august).roomRevenue).toEqual({
        grossMinor: 85000,
        correctionsMinor: -10000,
        netMinor: 75000,
      });
      expect(august.days[4]).toMatchObject({
        date: d(5),
        occupiedNights: 1,
        roomRevenueMinor: 0,
      });
      const september = await month(FINANCE_USER, main, M0);
      expect(figures(september).roomRevenue?.correctionsMinor).toBe(0);
    },
    BUDGET_MS,
  );

  it(
    "analytics_tests_call_the_query",
    async () => {
      // AN-DIFF-06: a test that restates a formula passes whatever the query
      // does. This one moves the data and requires the query to move with it.
      const mutable = await newProperty();
      await closeBefore(mutable, 10);
      const unit = await addUnit(mutable, "MUT-1");
      const t = mutable.today;
      const stay = await inReplica((tx) =>
        addStay(tx, mutable, unit, {
          status: "departed",
          from: addDays(t, -3),
          to: addDays(t, -1),
        }),
      );
      const before = await trailing(FINANCE_USER, mutable, "7d");
      await inReplica((tx) =>
        night(tx, mutable, stay.folioId!, addDays(t, -3), 7000),
      );
      const after = await trailing(FINANCE_USER, mutable, "7d");
      expect(after.roomRevenueMinor! - before.roomRevenueMinor!).toBe(7000);
      expect(after.occupiedRoomNights).toBe(before.occupiedRoomNights);
    },
    BUDGET_MS,
  );
});

// -- slice 2: a month -------------------------------------------------------

describe("a month on the screen", () => {
  it(
    "month_selects_calendar_month",
    async () => {
      const report = await month(FINANCE_USER, main, M1);
      expect(report.month).toBe(M1);
      expect(report.daysInMonth).toBe(daysInMonth(M1));
      expect(report.days[0]?.date).toBe(monthStart(M1));
      expect(report.days.at(-1)?.date).toBe(monthEnd(M1));
      expect(report.previousMonth).toBe(M2);
      expect(report.nextMonth).toBe(M0);
      expect(report.state).toBe("closed");

      const current = await month(FINANCE_USER, main);
      expect(current.month).toBe(M0);
      expect(current.nextMonth).toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "bad_or_future_month_shows_current_month",
    async () => {
      for (const requested of [
        "abc",
        "2026-13",
        "2026-00",
        "",
        "2026-9",
        shiftMonth(M0, 1),
        shiftMonth(M0, 14),
      ]) {
        const report = await month(FINANCE_USER, main, requested);
        expect(report.month).toBe(M0);
      }
    },
    BUDGET_MS,
  );

  it(
    "month_before_first_activity_says_no_activity",
    async () => {
      // M3 ends before the first night anyone slept: nothing happened.
      const empty = await month(FINANCE_USER, main, M3);
      expect(empty.state).toBe("no_activity");
      expect(empty.figures).toBeNull();
      expect(empty.prior).toBeNull();
      expect(empty.days).toHaveLength(daysInMonth(M3));
      expect(
        empty.days.every(
          (day) =>
            day.occupancyPercent === null && day.roomRevenueMinor === null,
        ),
      ).toBe(true);
      // A Property that has never had a stay has no month with activity.
      expect((await month(FINANCE_USER, zero, M0)).state).toBe("no_activity");
    },
    BUDGET_MS,
  );

  it(
    "open_month_is_labelled_and_counts_closed_days",
    async () => {
      const report = await month(FINANCE_USER, open, M0);
      const elapsed = Number(open.today.slice(8, 10)) - 1;
      expect(report.state).toBe("open");
      expect(report.daysInMonth).toBe(daysInMonth(M0));
      expect(report.daysClosed).toBe(elapsed);
      expect(report.closedThrough).toBe(
        elapsed > 0 ? addDays(open.today, -1) : null,
      );
      expect(figures(report).availableNights).toBe(2 * elapsed);
      expect(report.days.filter((day) => day.state === "closed")).toHaveLength(
        elapsed,
      );
      expect(report.days.filter((day) => day.state === "open")).toHaveLength(1);
      expect(report.days.filter((day) => day.state === "future")).toHaveLength(
        daysInMonth(M0) - elapsed - 1,
      );
    },
    BUDGET_MS,
  );

  it(
    "month_compared_with_same_elapsed_days",
    async () => {
      // Today's month against M1, day for day as far as it has got.
      const report = await month(FINANCE_USER, main, M0);
      expect(report.state).toBe("open");
      expect(report.prior).toMatchObject({ month: M1, sameElapsedDays: true });
      const elapsed = report.daysClosed;
      // The nights of M1 and what each earned net, by day of the month.
      const nights: [day: number, net: number][] = [
        [1, 15000],
        [5, 0],
        [6, 30000],
        [7, 30000],
        [21, 0],
        [22, 0],
        [23, 0],
      ];
      const inWindow = nights.filter(([day]) => day <= elapsed);
      if (elapsed === 0) {
        expect(report.prior?.figures).toBeNull();
      } else {
        expect(report.prior?.figures?.occupiedNights).toBe(inWindow.length);
        expect(report.prior?.figures?.roomRevenue?.netMinor).toBe(
          inWindow.reduce((sum, [, net]) => sum + net, 0),
        );
      }

      // A closed month is compared with the whole of the one before.
      const closed = await month(FINANCE_USER, main, M1);
      expect(closed.prior).toMatchObject({ month: M2, sameElapsedDays: false });
      expect(closed.prior?.figures?.occupiedNights).toBe(1);
      expect(closed.prior?.changes?.roomRevenuePercent).toBe(400);
      expect(closed.prior?.changes?.occupancyPoints).toBe(
        Math.round(
          ((figures(closed).occupancyPercent ?? 0) -
            (closed.prior?.figures?.occupancyPercent ?? 0)) *
            10,
        ) / 10,
      );
    },
    BUDGET_MS,
  );

  it(
    "comparison_against_zero_reads_dash",
    async () => {
      // M2's prior is M3, which had nothing: no figures and no change, never
      // infinity and never a made-up percentage.
      const report = await month(FINANCE_USER, main, M2);
      expect(report.state).toBe("closed");
      expect(report.prior?.month).toBe(M3);
      expect(report.prior?.figures).toBeNull();
      expect(report.prior?.changes).toBeNull();
      expect(JSON.stringify(report)).not.toMatch(/Infinity|NaN/);
    },
    BUDGET_MS,
  );

  it(
    "the_day_table_carries_a_correction_on_its_night",
    async () => {
      const report = await month(FINANCE_USER, main, M1);
      const sum = report.days.reduce(
        (total, day) => total + (day.roomRevenueMinor ?? 0),
        0,
      );
      expect(sum).toBe(figures(report).roomRevenue?.netMinor);
    },
    BUDGET_MS,
  );

  it(
    "other_revenue_dated_by_posting_business_date",
    async () => {
      // M1: 900 (05:00 on the 1st), 5000, 3000 less its 3000 reversal, 2000
      // (its reversal is today's, not M1's), less the 800 reversed on the 2nd
      // that was charged in M2.
      const m1 = await month(FINANCE_USER, main, M1);
      expect(figures(m1).otherRevenueMinor).toBe(7100);
      // M2: 700 (01:00 on the 1st of M1, working day M2's last), 600 (03:30,
      // the same working day) and the 800 charged that day; the reversal
      // belongs to the day it was posted.
      const m2 = await month(FINANCE_USER, main, M2);
      expect(figures(m2).otherRevenueMinor).toBe(2100);
    },
    BUDGET_MS,
  );

  it(
    "posting_before_cutoff_belongs_to_the_working_day",
    async () => {
      // Istanbul, 04:00 cutoff: 01:00 and 03:30 on the 1st are the last day of
      // M2, 05:00 on the 1st is the 1st. 700, 600 and 800 sit in M2 alone, 900
      // in M1 alone.
      const m1 = await month(FINANCE_USER, main, M1);
      const m2 = await month(FINANCE_USER, main, M2);
      expect(figures(m2).otherRevenueMinor).toBe(700 + 600 + 800);
      expect(figures(m1).otherRevenueMinor).toBe(7100);
      // The 03:30 line proves the cutoff only where the two ways of dating a
      // line disagree, so the fixture is checked before it is believed.
      const [cast] = await asViewer(FINANCE_USER, (tx) =>
        tx.$queryRawUnsafe<{ differs: boolean }[]>(
          `select (line.posted_at::date <> app.business_date(
                    line.posted_at, property.timezone, property.business_date_cutoff)
                  ) as differs
             from public.folio_lines as line
             join public.properties as property on property.id = line.property_id
            where line.property_id = $1::uuid and line.amount_minor = 600`,
          main.id,
        ),
      );
      expect(cast?.differs).toBe(true);
      const [line] = await asViewer(FINANCE_USER, (tx) =>
        tx.$queryRawUnsafe<{ day: string }[]>(
          `select to_char(app.business_date(line.posted_at, property.timezone,
                    property.business_date_cutoff), 'YYYY-MM-DD') as day
             from public.folio_lines as line
             join public.properties as property on property.id = line.property_id
            where line.property_id = $1::uuid and line.amount_minor = 700`,
          main.id,
        ),
      );
      expect(line?.day).toBe(addDays(monthStart(M1), -1));
    },
    BUDGET_MS,
  );

  it(
    "every_day_has_a_row_and_rows_sum_to_headline",
    async () => {
      const report = await month(FINANCE_USER, main, M1);
      expect(report.days).toHaveLength(daysInMonth(M1));
      expect(report.days.map((day) => day.date)).toEqual(
        Array.from({ length: daysInMonth(M1) }, (_, index) => d(index + 1)),
      );
      const quietDay = report.days[2];
      expect(quietDay).toMatchObject({
        date: d(3),
        occupiedNights: 0,
        occupancyPercent: 0,
        roomRevenueMinor: 0,
      });
      const sum = (pick: (day: (typeof report.days)[number]) => number) =>
        report.days.reduce((total, day) => total + pick(day), 0);
      expect(sum((day) => day.occupiedNights)).toBe(
        figures(report).occupiedNights,
      );
      expect(sum((day) => day.availableNights)).toBe(
        figures(report).availableNights,
      );

      // The open month: every day is there, the open one and the future ones too.
      const current = await month(FINANCE_USER, main, M0);
      expect(current.days).toHaveLength(daysInMonth(M0));
      const closedOnly = current.days.filter((day) => day.state === "closed");
      expect(
        closedOnly.reduce((total, day) => total + day.occupiedNights, 0),
      ).toBe(figures(current).occupiedNights);
      const future = current.days.filter((day) => day.state === "future");
      expect(future.every((day) => day.occupancyPercent === null)).toBe(true);
    },
    BUDGET_MS,
  );

  it(
    "every_money_figure_is_null_without_permission",
    async () => {
      const report = await month(HOUSEKEEPER, main, M1);
      expect(report.mayReadMoney).toBe(false);
      const headline = figures(report);
      for (const money of [
        headline.roomRevenue,
        headline.otherRevenueMinor,
        headline.totalRevenueMinor,
        headline.adrMinor,
        headline.revParMinor,
        headline.collectedMinor,
        headline.payments,
        headline.revenueBookedMinor,
        headline.differenceMinor,
      ]) {
        expect(money).toBeNull();
      }
      // The comparison carries no money either; nights and occupancy remain.
      expect(report.prior?.figures?.roomRevenue).toBeNull();
      expect(report.prior?.figures?.collectedMinor).toBeNull();
      expect(report.prior?.changes?.roomRevenuePercent).toBeNull();
      expect(report.prior?.changes?.collectedPercent).toBeNull();
      expect(report.prior?.changes?.occupancyPoints).not.toBeNull();
      expect(report.days.every((day) => day.roomRevenueMinor === null)).toBe(
        true,
      );
      expect(headline.occupiedNights).toBe(9);
      expect(headline.occupancyPercent).not.toBeNull();
      // Not hidden by the screen: absent from what the server sent.
      expect(JSON.stringify(report)).not.toMatch(/75000|82100|14000|85000/);
    },
    BUDGET_MS,
  );

  it(
    "other_property_month_is_not_found_not_empty",
    async () => {
      // Another Organization's Property.
      expect(await getMonthReport(FINANCE_USER, foreign.id, null)).toBeNull();
      expect(await getMonthReport(OUTSIDER, main.id, null)).toBeNull();
      // A Property of the viewer's own Organization that they are not assigned.
      expect(await getMonthReport(ASSIGNED, unassigned.id, null)).toBeNull();
      expect(await getMonthReport(ASSIGNED, main.id, M1)).not.toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "unentitled_property_month_is_refused",
    async () => {
      expect(await getMonthReport(FINANCE_USER, uncapable.id, null)).toBeNull();
      expect(await getMonthReport(FINANCE_USER, quiet.id, null)).not.toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "mtd_range_opens_the_current_month",
    async () => {
      expect(resolveAnalyticsView({ range: "mtd" })).toEqual({
        kind: "month",
        month: null,
      });
      expect(resolveAnalyticsView({ range: "7d" })).toEqual({
        kind: "range",
        range: "7d",
      });
      expect(resolveAnalyticsView({ range: "mtd", month: M1 })).toEqual({
        kind: "month",
        month: M1,
      });
      // And it is the same figure.
      const range = await trailing(FINANCE_USER, open, "mtd");
      const report = await month(FINANCE_USER, open);
      expect(report.month).toBe(monthOf(open.today));
      expect(range.availableRoomNights).toBe(figures(report).availableNights);
      expect(range.occupiedRoomNights).toBe(figures(report).occupiedNights);
      expect(range.roomRevenueMinor).toBe(
        figures(report).roomRevenue?.netMinor,
      );
      expect(range.netPaymentsMinor).toBe(figures(report).collectedMinor);
    },
    BUDGET_MS,
  );

  it(
    "month_amounts_share_the_property_currency",
    async () => {
      const euro = await newProperty({ currency: "EUR" });
      await closeBefore(euro, 10);
      const unit = await addUnit(euro, "E1");
      const t = euro.today;
      const stay = await inReplica((tx) =>
        addStay(
          tx,
          euro,
          unit,
          { status: "departed", from: addDays(t, -3), to: addDays(t, -1) },
          false,
        ),
      );
      const folioId = randomUUID();
      await owner.$executeRawUnsafe(
        `insert into public.folios (id, organization_id, property_id, stay_id, currency)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'EUR')`,
        folioId,
        euro.organization,
        euro.id,
        stay.stayId,
      );
      await inReplica((tx) => night(tx, euro, folioId, addDays(t, -3), 5000));
      // Once a Folio exists the Property's currency cannot change (ADR 0036),
      // so no month can mix two currencies.
      await expect(
        owner.$executeRawUnsafe(
          `update public.properties set currency = 'USD' where id = $1::uuid`,
          euro.id,
        ),
      ).rejects.toThrow(/currency is fixed/);
      const report = await month(FINANCE_USER, euro, monthOf(addDays(t, -3)));
      expect(report.currency).toBe("EUR");
      expect(figures(report).roomRevenue?.grossMinor).toBe(5000);
    },
    BUDGET_MS,
  );

  it(
    "resident_nights_do_not_dilute_adr",
    async () => {
      const report = await month(FINANCE_USER, main, M1);
      const headline = figures(report);
      expect(headline.guestNights).toBe(6);
      expect(headline.residentNights).toBe(3);
      expect(headline.occupiedNights).toBe(9);
      expect(headline.chargedGuestNights).toBe(6);
      // 75000 over the six charged Guest nights, not over all nine.
      expect(headline.adrMinor).toBe(12500);
    },
    BUDGET_MS,
  );

  it(
    "revenue_against_collected_difference_shown",
    async () => {
      const report = await month(FINANCE_USER, main, M1);
      const headline = figures(report);
      // 75000 room net and 7100 other, against 14000 collected.
      expect(headline.revenueBookedMinor).toBe(82100);
      expect(headline.collectedMinor).toBe(14000);
      expect(headline.differenceMinor).toBe(68100);
    },
    BUDGET_MS,
  );

  it(
    "figures_come_from_one_snapshot",
    async () => {
      const gross = (report: MonthReport | null) =>
        report?.figures?.roomRevenue?.grossMinor ?? -1;

      /**
       * A report assembled while a night is charged. After the nights are read
       * and before the money is, the close posts both nights, committed.
       */
      async function assembledWhileCharging(isolated: boolean) {
        const property = await newProperty();
        await closeBefore(property, 10);
        const unit = await addUnit(property, "SN-1");
        const t = property.today;
        const stay = await inReplica((tx) =>
          addStay(tx, property, unit, {
            status: "departed",
            from: addDays(t, -3),
            to: addDays(t, -1),
          }),
        );
        let calls = 0;
        const requested = monthOf(addDays(t, -2));
        return withOrganizationContext(
          prisma,
          { userId: FINANCE_USER },
          async (tx) =>
            buildMonthReport(
              {
                $queryRaw: async (query, ...values) => {
                  const rows = await tx.$queryRaw(query, ...values);
                  calls += 1;
                  if (calls === 2) {
                    await inReplica(async (writer) => {
                      for (const back of [3, 2]) {
                        await night(
                          writer,
                          property,
                          stay.folioId!,
                          addDays(t, -back),
                          10000,
                        );
                      }
                    });
                  }
                  return rows as never;
                },
              },
              property.id,
              requested,
            ),
          isolated ? { isolationLevel: "RepeatableRead" } : {},
        );
      }

      // One snapshot: what was charged is what was counted, whatever the close
      // posted in between. Every night here is 10000, so revenue is a multiple
      // of the charged nights or the two were read at different moments.
      const consistent = await assembledWhileCharging(true);
      expect(gross(consistent)).toBe(
        10000 * (consistent?.figures?.chargedGuestNights ?? -1),
      );

      // Control: the same report on READ COMMITTED disagrees with itself, which
      // is the defect the snapshot prevents.
      const torn = await assembledWhileCharging(false);
      expect(gross(torn)).not.toBe(
        10000 * (torn?.figures?.chargedGuestNights ?? -1),
      );

      // And the route asks for the snapshot: getMonthReport opens its
      // transaction at REPEATABLE READ.
      const spy = vi.spyOn(prisma, "$transaction");
      await getMonthReport(FINANCE_USER, main.id, M1);
      const options = spy.mock.calls[0]?.[1] as
        { isolationLevel?: string } | undefined;
      spy.mockRestore();
      expect(options?.isolationLevel).toBe("RepeatableRead");
    },
    BUDGET_MS,
  );
});
