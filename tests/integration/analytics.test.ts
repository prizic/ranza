/**
 * Analytics against a real database (docs/features/analytics, slices 1 to 3).
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
 * Slice 3 breaks (a month explained), run the same way and each restored:
 *   day detail amounts leaked to a viewer without finance.manage_folio (the
 *   query's gate, the key's gate and the corrections' gate all off)
 *     day_detail_omits_money_server_side
 *   a unit type row dropped (bed)
 *     unit_type_rows_sum_to_headline, day_detail_equals_its_table_row
 *   a unit type row double counted (suite inventory twice)
 *     unit_type_rows_sum_to_headline
 *   a moved Guest's nights put in the unit the Stay is in now
 *     unit_type_rows_sum_to_headline, day_detail_equals_its_table_row
 *   uncharged Guest nights all called unpriced, in the month and in the day
 *     uncharged_nights_grouped_by_reason, every_reason_the_close_names_reaches_the_month,
 *     day_detail_says_why_a_night_was_not_charged,
 *     the_open_day_is_not_counted_among_uncharged_nights
 *   a Resident night left out of the reasons
 *     uncharged_nights_grouped_by_reason
 *   the Property check removed from the day (an unreached Property answers
 *   with an empty day instead of null)
 *     day_detail_of_another_property_is_not_found_not_empty
 *   a future day opened
 *     the_open_day_can_be_opened_and_a_future_day_cannot
 *   corrections listed on the day they were posted, not the night they correct
 *     day_detail_equals_its_table_row
 *   unit type revenue read for a viewer without finance.manage_folio
 *     unit_type_rows_mask_money_but_keep_nights,
 *     every_money_figure_is_null_without_permission
 *   update on accommodation_units.unit_type granted to ranza_app, then to
 *   PUBLIC, on the lane database and revoked after. The first is the column
 *   privilege assertion; the second passes it (the catalogue lists the grantee
 *   PUBLIC, not ranza_app) and is caught only by the update being refused
 *     unit_type_cannot_be_updated_by_the_app (each assertion on its own)
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
  getDayDetail,
  getMonthReport,
  getPropertyAnalytics,
  resolveAnalyticsView,
  type DayDetail,
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
const BILLING_ORG = "ae000002-0000-4000-8000-000000000003";
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

/**
 * A unit created at noon local on `createdOn`, or long ago when omitted. A
 * room unless `kind` says otherwise; a bed names the room it is in.
 */
async function addUnit(
  property: Property,
  name: string,
  createdOn: string = addDays(property.today, -100),
  kind: {
    unitType?: "room" | "bed" | "apartment" | "suite";
    parentId?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const unitType = kind.unitType ?? "room";
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, created_at,
        parent_id, parent_unit_type)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, case when $5 = 'bed' then 1 else 2 end,
             ($6::date + time '12:00') at time zone
               (select timezone from public.properties where id = $2::uuid),
             $7::uuid, case when $7::uuid is null then null else 'room' end)`,
    id,
    property.id,
    property.organization,
    name,
    unitType,
    createdOn,
    kind.parentId ?? null,
  );
  return id;
}

interface StayOptions {
  type?: "guest" | "resident";
  status: "departed" | "in_house";
  from: string;
  to: string;
  reservationId?: string;
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
        status, starts_on, ends_on, departed_at, reservation_id)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::date, $8::date,
             case when $6 = 'departed'
                  then ($8::date + time '12:00') at time zone
                         (select timezone from public.properties where id = $3::uuid)
             end,
             $9::uuid)`,
    stayId,
    property.organization,
    property.id,
    unitId,
    options.type ?? "guest",
    options.status,
    options.from,
    options.to,
    options.reservationId ?? null,
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

async function addGuest(
  organization: string,
  fullName: string,
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name)
     values ($1::uuid, $2::uuid, $3)`,
    id,
    organization,
    fullName,
  );
  return id;
}

interface ReservationOptions {
  guestId: string;
  type?: "guest" | "resident";
  from: string;
  to: string;
  /** The booking's nightly price, or null for one taken unpriced. */
  rate: number | null;
  currency?: string;
}

/** A booking a Stay was checked in from: it holds the price a night is charged at. */
async function addReservation(
  tx: Owner,
  property: Property,
  unitId: string,
  options: ReservationOptions,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on, reference, nightly_rate_minor,
        rate_currency)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'checked_out',
             $7::date, $8::date, $9, $10::bigint,
             case when $10::bigint is null then null else $11 end)`,
    id,
    property.organization,
    property.id,
    unitId,
    options.guestId,
    options.type ?? "guest",
    options.from,
    options.to,
    `R${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    options.rate,
    options.currency ?? "TRY",
  );
  return id;
}

/** A Guest moved from one unit to another on `on`: the night of `on` is in the new one. */
async function addMove(
  tx: Owner,
  property: Property,
  stay: { stayId: string; reservationId: string },
  move: {
    from: string;
    to: string;
    fromUnit: string;
    toUnit: string;
    on: string;
    end: string;
  },
): Promise<void> {
  await tx.$executeRawUnsafe(
    `insert into public.reservation_changes
       (organization_id, property_id, reservation_id, stay_id, kind, business_date,
        from_starts_on, to_starts_on, from_ends_on, to_ends_on,
        from_unit_id, to_unit_id, reason_kind, changed_by)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'moved', $5::date,
             $6::date, $6::date, $7::date, $7::date,
             $8::uuid, $9::uuid, 'upgrade', $10::uuid)`,
    property.organization,
    property.id,
    stay.reservationId,
    stay.stayId,
    move.on,
    move.from,
    move.end,
    move.fromUnit,
    move.toUnit,
    FINANCE_USER,
  );
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
let expl: Property;
let bill: Property;

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

/**
 * EXPL: a closed M1 with three unit types, a moved Guest, a Resident, an
 * unpriced booking, one with no booking and one the Property cannot bill.
 *
 * Units: rooms E-R1 and E-R2, suite E-S1, suite E-S2 created on the 20th, and
 * a dorm room E-DORM whose beds E-B1 and E-B2 are the inventory, never the room.
 * Stays, all departed:
 *   GA  guest    E-R1  5th to 8th    3 nights  10000, the 6th reversed today
 *   GB  guest    E-S1  6th to 8th    2 nights  30000
 *   GC  resident E-R2  10th to 13th  3 nights  not charged: billed monthly
 *   GD  guest    E-R2  14th to 16th  2 nights  booking taken unpriced
 *   GE  guest    E-R1  20th to 22nd  2 nights  no booking at all
 *   GF  guest    E-S2  22nd to 24th  2 nights  priced, but billing is not available
 *   GG  guest    E-B1  2nd to 4th    2 nights  5000
 *   GH  guest    E-R1  10th to 14th  4 nights  20000: in E-S1 on the 10th and
 *                                    11th, moved to E-R1 on the 12th
 */
async function seedExplained(): Promise<void> {
  expl = await newProperty();
  await closeBefore(expl, 120);
  const r1 = await addUnit(expl, "E-R1");
  const r2 = await addUnit(expl, "E-R2");
  const s1 = await addUnit(expl, "E-S1", undefined, { unitType: "suite" });
  const s2 = await addUnit(expl, "E-S2", d(20), { unitType: "suite" });
  const dorm = await addUnit(expl, "E-DORM");
  const b1 = await addUnit(expl, "E-B1", undefined, {
    unitType: "bed",
    parentId: dorm,
  });
  await addUnit(expl, "E-B2", undefined, { unitType: "bed", parentId: dorm });

  const [ada, bo, cy, di, fe, gg, hu] = await Promise.all(
    [
      "Ada Guest",
      "Bo Guest",
      "Cy Resident",
      "Di Guest",
      "Fe Guest",
      "Gus Guest",
      "Hu Guest",
    ].map((name) => addGuest(expl.organization, name)),
  );

  await inReplica(async (tx) => {
    const booked = (
      unit: string,
      guestId: string,
      from: number,
      to: number,
      rate: number | null,
      type?: "resident",
    ) =>
      addReservation(tx, expl, unit, {
        guestId,
        from: d(from),
        to: d(to),
        rate,
        type,
      });

    const ra = await booked(r1, ada!, 5, 8, 10000);
    const ga = await addStay(tx, expl, r1, {
      status: "departed",
      from: d(5),
      to: d(8),
      reservationId: ra,
    });
    await night(tx, expl, ga.folioId!, d(5), 10000);
    const sixth = await night(tx, expl, ga.folioId!, d(6), 10000);
    await night(tx, expl, ga.folioId!, d(7), 10000);
    await addLine(tx, expl, ga.folioId!, {
      type: "reversal",
      amount: -10000,
      reverses: sixth,
    });

    const rb = await booked(s1, bo!, 6, 8, 30000);
    const gb = await addStay(tx, expl, s1, {
      status: "departed",
      from: d(6),
      to: d(8),
      reservationId: rb,
    });
    await night(tx, expl, gb.folioId!, d(6), 30000);
    await night(tx, expl, gb.folioId!, d(7), 30000);

    const rc = await booked(r2, cy!, 10, 13, null, "resident");
    await addStay(tx, expl, r2, {
      type: "resident",
      status: "departed",
      from: d(10),
      to: d(13),
      reservationId: rc,
    });

    const rd = await booked(r2, di!, 14, 16, null);
    await addStay(tx, expl, r2, {
      status: "departed",
      from: d(14),
      to: d(16),
      reservationId: rd,
    });

    await addStay(
      tx,
      expl,
      r1,
      { status: "departed", from: d(20), to: d(22) },
      false,
    );

    const rf = await booked(s2, fe!, 22, 24, 40000);
    await addStay(tx, expl, s2, {
      status: "departed",
      from: d(22),
      to: d(24),
      reservationId: rf,
    });

    const rg = await booked(b1, gg!, 2, 4, 5000);
    const gg1 = await addStay(tx, expl, b1, {
      status: "departed",
      from: d(2),
      to: d(4),
      reservationId: rg,
    });
    await night(tx, expl, gg1.folioId!, d(2), 5000);
    await night(tx, expl, gg1.folioId!, d(3), 5000);

    const rh = await booked(r1, hu!, 10, 14, 20000);
    const gh = await addStay(tx, expl, r1, {
      status: "departed",
      from: d(10),
      to: d(14),
      reservationId: rh,
    });
    for (const day of [10, 11, 12, 13])
      await night(tx, expl, gh.folioId!, d(day), 20000);
    await addMove(
      tx,
      expl,
      { stayId: gh.stayId, reservationId: rh },
      {
        from: d(10),
        end: d(14),
        fromUnit: s1,
        toUnit: r1,
        on: d(12),
      },
    );
  });
}

/**
 * BILL: an Organization whose Property can bill, so the other reasons a night
 * goes uncharged are reachable. A closed M1 of single nights on the 3rd to 6th:
 *   priced, no Folio                                            no_folio
 *   priced, its Folio closed                                    folio_closed
 *   priced in EUR on a TRY Folio                                currency
 *   priced, its Folio open, and no line posted                  not yet charged
 * and a Guest in house today whose night waits for the close.
 */
async function seedBilling(): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, 'Analytics Billing', 'active') on conflict (id) do nothing`,
    BILLING_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1::uuid, 'active') on conflict (organization_id) do nothing`,
    BILLING_ORG,
  );
  for (const moduleKey of ["analytics", "billing_folios"]) {
    await owner.$executeRawUnsafe(
      `insert into public.entitlements (organization_id, module_key, status)
       values ($1::uuid, $2, 'active')
       on conflict (organization_id, module_key) do nothing`,
      BILLING_ORG,
      moduleKey,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1::uuid, $2::uuid, 'finance', 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    BILLING_ORG,
    FINANCE_USER,
  );

  bill = await newProperty({ organization: BILLING_ORG });
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1::uuid, $2::uuid, 'finance', true)`,
    bill.id,
    BILLING_ORG,
  );
  await closeBefore(bill, 120);
  const guestId = await addGuest(BILLING_ORG, "Bill Guest");
  const units = await Promise.all(
    ["W-1", "W-2", "W-3", "W-4", "W-5"].map((name) => addUnit(bill, name)),
  );
  await inReplica(async (tx) => {
    const stayOn = async (
      unit: string,
      day: number,
      rate: number,
      currency: string,
      withFolio: boolean,
    ) => {
      const reservationId = await addReservation(tx, bill, unit, {
        guestId,
        from: d(day),
        to: d(day + 1),
        rate,
        currency,
      });
      return addStay(
        tx,
        bill,
        unit,
        { status: "departed", from: d(day), to: d(day + 1), reservationId },
        withFolio,
      );
    };
    await stayOn(units[0]!, 3, 9000, "TRY", false);
    const closed = await stayOn(units[1]!, 4, 9000, "TRY", true);
    await tx.$executeRawUnsafe(
      `update public.folios set status = 'closed', closed_at = now() where id = $1::uuid`,
      closed.folioId,
    );
    await stayOn(units[2]!, 5, 9000, "EUR", true);
    await stayOn(units[3]!, 6, 9000, "TRY", true);
    const reservationId = await addReservation(tx, bill, units[4]!, {
      guestId,
      from: bill.today,
      to: addDays(bill.today, 2),
      rate: 9000,
    });
    await addStay(tx, bill, units[4]!, {
      status: "in_house",
      from: bill.today,
      to: addDays(bill.today, 2),
      reservationId,
    });
  });
}

beforeAll(async () => {
  await seedWorld();
  await seedMain();
  await seedTrail();
  await seedOpen();
  await seedReversals();
  await seedExplained();
  await seedBilling();

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

// -- slice 3: a month explained ---------------------------------------------

const REASON_ORDER = [
  "resident",
  "unpriced",
  "billing_unavailable",
  "no_folio",
  "folio_closed",
  "currency",
  "not_yet_charged",
];

/** Every key, at any depth, whose name says it is an amount of money. */
function moneyKeys(value: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (
          /minor|amount|revenue|price|currency|correction|adr|revpar/i.test(key)
        ) {
          found.push(key);
        }
        walk(child);
      }
    }
  };
  walk(value);
  return found;
}

async function dayOf(
  userId: string,
  property: Property,
  date: string,
): Promise<DayDetail> {
  const detail = await getDayDetail(userId, property.id, date);
  expect(detail).not.toBeNull();
  return detail!;
}

const stayAt = (detail: DayDetail, unitName: string) =>
  detail.stays.find((stay) => stay.unitName === unitName);

describe("occupied nights that earned no charge", () => {
  it(
    "uncharged_nights_grouped_by_reason",
    async () => {
      // EXPL: a Resident (3), an unpriced booking and a Stay with no booking
      // (2 + 2), a priced booking at a Property that cannot bill (2).
      const report = await month(FINANCE_USER, expl, M1);
      expect(report.unchargedNights).toEqual([
        { reason: "resident", nights: 3 },
        { reason: "unpriced", nights: 4 },
        { reason: "billing_unavailable", nights: 2 },
      ]);

      // The reasons are the close's own: app.room_nights_due says the same
      // for every Guest night of the month, so the screen cannot invent one.
      const due = await owner.$queryRawUnsafe<
        { reason: string; nights: number }[]
      >(
        `select reason, count(*)::int as nights
           from app.room_nights_due($1::uuid, $2::date, $3::date)
          where reason is not null and reason <> 'already_posted'
          group by reason order by reason`,
        expl.id,
        monthStart(M1),
        monthEnd(M1),
      );
      expect(due).toEqual([
        { reason: "billing_unavailable", nights: 2 },
        { reason: "unpriced", nights: 4 },
      ]);

      // Charged plus uncharged is every occupied night, none counted twice.
      const headline = figures(report);
      const uncharged = report.unchargedNights.reduce(
        (sum, row) => sum + row.nights,
        0,
      );
      expect(uncharged).toBe(
        headline.occupiedNights - headline.chargedGuestNights,
      );

      // Operational, so every reader sees it, and never an amount.
      const masked = await month(HOUSEKEEPER, expl, M1);
      expect(masked.unchargedNights).toEqual(report.unchargedNights);
      expect(moneyKeys(report.unchargedNights)).toEqual([]);

      // The Resident of the main Property, and nothing else uncharged there.
      expect((await month(FINANCE_USER, main, M1)).unchargedNights).toEqual([
        { reason: "resident", nights: 3 },
      ]);
    },
    BUDGET_MS,
  );

  it(
    "every_reason_the_close_names_reaches_the_month",
    async () => {
      // BILL can bill, so a night can also lack a Folio, find it closed, or be
      // priced in another currency; and a chargeable night with no line is one
      // the close has not charged.
      const report = await month(FINANCE_USER, bill, M1);
      expect(report.unchargedNights).toEqual([
        { reason: "no_folio", nights: 1 },
        { reason: "folio_closed", nights: 1 },
        { reason: "currency", nights: 1 },
        { reason: "not_yet_charged", nights: 1 },
      ]);
      const order = report.unchargedNights.map((row) => row.reason);
      expect(order).toEqual(
        REASON_ORDER.filter((reason) => order.includes(reason)),
      );
    },
    BUDGET_MS,
  );

  it(
    "the_open_day_is_not_counted_among_uncharged_nights",
    async () => {
      // Today's nights have no charge yet, and are the open day's: no figure
      // of the month covers them.
      const report = await month(FINANCE_USER, bill, M0);
      expect(report.days.find((day) => day.date === bill.today)?.state).toBe(
        "open",
      );
      expect(
        report.unchargedNights.some((row) => row.reason === "not_yet_charged"),
      ).toBe(bill.today.slice(0, 7) === M1);
      const today = await dayOf(FINANCE_USER, bill, bill.today);
      expect(today.stays.map((stay) => stay.night)).toEqual([
        "not_yet_charged",
      ]);
    },
    BUDGET_MS,
  );
});

describe("the month by unit type", () => {
  const rowsOf = (report: MonthReport) =>
    Object.fromEntries(report.byUnitType.map((row) => [row.unitType, row]));

  it(
    "unit_type_rows_sum_to_headline",
    async () => {
      const n = daysInMonth(M1);
      const report = await month(FINANCE_USER, expl, M1);
      const rows = rowsOf(report);

      // One row for each type the Property has: no apartments, so no row.
      expect(report.byUnitType.map((row) => row.unitType)).toEqual([
        "room",
        "suite",
        "bed",
      ]);
      // The dorm room is not inventory, its beds are: two beds, not three units.
      expect(rows.room).toMatchObject({
        availableNights: 2 * n,
        occupiedNights: 12,
        guestNights: 9,
        residentNights: 3,
        chargedGuestNights: 5,
        roomRevenueMinor: 60000,
        adrMinor: 12000,
        occupancyPercent: Math.round((12 / (2 * n)) * 1000) / 10,
      });
      // E-S2 counts from the 20th. The moved Guest's nights of the 10th and
      // 11th are the suite's, the 12th and 13th the room's.
      expect(rows.suite).toMatchObject({
        availableNights: n + (n - 19),
        occupiedNights: 6,
        chargedGuestNights: 4,
        roomRevenueMinor: 100000,
        adrMinor: 25000,
      });
      expect(rows.bed).toMatchObject({
        availableNights: 2 * n,
        occupiedNights: 2,
        chargedGuestNights: 2,
        roomRevenueMinor: 10000,
        adrMinor: 5000,
      });

      // And the rows are the headline: nights, available nights and revenue.
      const headline = figures(report);
      const sum = (
        pick: (row: (typeof report.byUnitType)[number]) => number | null,
      ) =>
        report.byUnitType.reduce((total, row) => total + (pick(row) ?? 0), 0);
      expect(sum((row) => row.occupiedNights)).toBe(headline.occupiedNights);
      expect(sum((row) => row.guestNights)).toBe(headline.guestNights);
      expect(sum((row) => row.residentNights)).toBe(headline.residentNights);
      expect(sum((row) => row.chargedGuestNights)).toBe(
        headline.chargedGuestNights,
      );
      expect(sum((row) => row.availableNights)).toBe(headline.availableNights);
      expect(sum((row) => row.roomRevenueMinor)).toBe(
        headline.roomRevenue?.netMinor,
      );
      expect(headline.roomRevenue?.netMinor).toBe(170000);
    },
    BUDGET_MS,
  );

  it(
    "unit_type_rows_sum_to_headline_for_every_kind_of_month",
    async () => {
      // A closed month, an open month with a day not yet charged, a month with
      // a correction, and one with a Resident: the sums hold in each.
      const cases: [string, Property, string][] = [
        ["main closed", main, M1],
        ["main open", main, M0],
        ["open open", open, M0],
        ["reversals", revp, monthOf(addDays(revp.today, -2))],
        ["trail", trail, M0],
        ["bill", bill, M1],
      ];
      for (const [label, property, requested] of cases) {
        const report = await month(FINANCE_USER, property, requested);
        const headline = report.figures;
        if (!headline) continue;
        const total = (
          pick: (row: (typeof report.byUnitType)[number]) => number | null,
        ) => report.byUnitType.reduce((sum, row) => sum + (pick(row) ?? 0), 0);
        expect([label, total((row) => row.occupiedNights)]).toEqual([
          label,
          headline.occupiedNights,
        ]);
        expect([label, total((row) => row.availableNights)]).toEqual([
          label,
          headline.availableNights,
        ]);
        expect([label, total((row) => row.chargedGuestNights)]).toEqual([
          label,
          headline.chargedGuestNights,
        ]);
        expect([label, total((row) => row.roomRevenueMinor)]).toEqual([
          label,
          headline.roomRevenue?.netMinor,
        ]);
      }
    },
    BUDGET_MS,
  );

  it(
    "unit_type_rows_mask_money_but_keep_nights",
    async () => {
      const finance = await month(FINANCE_USER, expl, M1);
      const masked = await month(HOUSEKEEPER, expl, M1);
      expect(masked.byUnitType).toHaveLength(finance.byUnitType.length);
      for (const [index, row] of masked.byUnitType.entries()) {
        const full = finance.byUnitType[index]!;
        expect(row.roomRevenueMinor).toBeNull();
        expect(row.adrMinor).toBeNull();
        expect({ ...row, roomRevenueMinor: null, adrMinor: null }).toEqual({
          ...full,
          roomRevenueMinor: null,
          adrMinor: null,
        });
      }
    },
    BUDGET_MS,
  );

  it(
    "a_month_with_no_activity_has_no_unit_type_rows",
    async () => {
      const empty = await month(FINANCE_USER, main, M3);
      expect(empty.byUnitType).toEqual([]);
      expect(empty.unchargedNights).toEqual([]);
    },
    BUDGET_MS,
  );
});

describe("a unit's type", () => {
  it(
    "unit_type_cannot_be_updated_by_the_app",
    async () => {
      const granted = await owner.$queryRawUnsafe<{ column: string }[]>(
        `select column_name::text as "column"
           from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'accommodation_units'
            and grantee = 'ranza_app' and privilege_type = 'UPDATE'
          order by 1`,
      );
      expect(granted.map((row) => row.column)).toEqual([
        "status",
        "status_reason",
        "updated_at",
      ]);

      const [unit] = await owner.$queryRawUnsafe<{ id: string }[]>(
        `select id::text from public.accommodation_units
          where property_id = $1::uuid and name = 'E-S1'`,
        expl.id,
      );
      const asApp = (statement: string) =>
        asViewer(FINANCE_USER, (tx) =>
          tx.$executeRawUnsafe(statement, unit!.id),
        );

      // Control: the columns the grant names are updatable, so the refusal
      // below is the grant and not a broken harness.
      await expect(
        asApp(
          `update public.accommodation_units set status = status where id = $1::uuid`,
        ),
      ).resolves.toBeGreaterThanOrEqual(0);
      await expect(
        asApp(
          `update public.accommodation_units set unit_type = 'room' where id = $1::uuid`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asApp(
          `update public.accommodation_units set unit_type = unit_type where id = $1::uuid`,
        ),
      ).rejects.toThrow(/permission denied/);

      const [after] = await owner.$queryRawUnsafe<{ unitType: string }[]>(
        `select unit_type as "unitType" from public.accommodation_units where id = $1::uuid`,
        unit!.id,
      );
      expect(after?.unitType).toBe("suite");
    },
    BUDGET_MS,
  );
});

describe("one day opened", () => {
  it(
    "day_detail_equals_its_table_row",
    async () => {
      const report = await month(FINANCE_USER, expl, M1);
      let charged = 0;
      const byType: Record<string, number> = {};
      for (const row of report.days) {
        const detail = await dayOf(FINANCE_USER, expl, row.date);
        expect(detail.date).toBe(row.date);
        expect(detail.state).toBe(row.state);
        expect(detail.stays).toHaveLength(row.occupiedNights);
        expect(detail.occupiedNights).toBe(row.occupiedNights);
        // What the day earned: the nights it charged, less what was corrected.
        const earned =
          detail.stays.reduce((sum, stay) => sum + (stay.chargeMinor ?? 0), 0) +
          (detail.corrections ?? []).reduce((sum, c) => sum + c.amountMinor, 0);
        expect(earned).toBe(row.roomRevenueMinor);
        charged += detail.chargedNights;
        for (const stay of detail.stays) {
          byType[stay.unitType] = (byType[stay.unitType] ?? 0) + 1;
        }
      }
      // The days add up to the month, and to its unit type rows.
      expect(charged).toBe(figures(report).chargedGuestNights);
      expect(byType).toEqual(
        Object.fromEntries(
          report.byUnitType.map((row) => [row.unitType, row.occupiedNights]),
        ),
      );

      // The 6th: two Stays, each with its unit, type and charge, and the
      // correction to the night posted today, which the 6th owns.
      const sixth = await dayOf(FINANCE_USER, expl, d(6));
      expect(sixth.stays.map((stay) => stay.unitName).sort()).toEqual([
        "E-R1",
        "E-S1",
      ]);
      expect(stayAt(sixth, "E-R1")).toMatchObject({
        unitType: "room",
        stayType: "guest",
        displayName: "Ada Guest",
        night: "charged",
        chargeMinor: 10000,
      });
      expect(stayAt(sixth, "E-S1")).toMatchObject({
        unitType: "suite",
        night: "charged",
        chargeMinor: 30000,
      });
      expect(sixth.corrections).toEqual([
        expect.objectContaining({
          unitName: "E-R1",
          unitType: "room",
          amountMinor: -10000,
          postedOn: expl.today,
        }),
      ]);
      expect(sixth.chargedNights).toBe(2);
    },
    BUDGET_MS,
  );

  it(
    "day_detail_says_why_a_night_was_not_charged",
    async () => {
      const resident = stayAt(await dayOf(FINANCE_USER, expl, d(10)), "E-R2")!;
      expect(resident).toMatchObject({
        stayType: "resident",
        night: "resident",
      });
      expect(resident.chargeMinor).toBeUndefined();
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(14)), "E-R2"),
      ).toMatchObject({
        night: "unpriced",
        displayName: "Di Guest",
      });
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(20)), "E-R1"),
      ).toMatchObject({
        night: "unpriced",
        displayName: null,
      });
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(22)), "E-S2"),
      ).toMatchObject({
        night: "billing_unavailable",
      });
      // A moved Guest's night is in the unit it was slept in, not the one the
      // Stay is in now.
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(11)), "E-S1"),
      ).toMatchObject({
        unitType: "suite",
        night: "charged",
      });
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(12)), "E-R1"),
      ).toMatchObject({
        unitType: "room",
        night: "charged",
      });
      // A bed names its room.
      expect(
        stayAt(await dayOf(FINANCE_USER, expl, d(2)), "E-B1"),
      ).toMatchObject({
        roomName: "E-DORM",
        unitType: "bed",
      });
    },
    BUDGET_MS,
  );

  it(
    "the_open_day_can_be_opened_and_a_future_day_cannot",
    async () => {
      // The open day: its nights are in house and not charged yet; the table
      // marks the day open and the detail agrees with its row.
      const detail = await dayOf(FINANCE_USER, open, open.today);
      const row = (await month(FINANCE_USER, open, M0)).days.find(
        (day) => day.date === open.today,
      );
      expect(detail.state).toBe("open");
      expect(detail.stays).toHaveLength(row!.occupiedNights);
      expect(detail.chargedNights).toBe(0);
      expect(detail.stays.every((stay) => stay.chargeMinor === undefined)).toBe(
        true,
      );

      // The night before is closed and charged.
      const yesterday = await dayOf(
        FINANCE_USER,
        open,
        addDays(open.today, -1),
      );
      expect(yesterday.state).toBe("closed");
      expect(
        yesterday.stays.map((stay) => [
          stay.unitName,
          stay.night,
          stay.chargeMinor,
        ]),
      ).toEqual([["B1", "charged", 8000]]);

      // Days to come have not happened.
      for (const date of [addDays(open.today, 1), addDays(open.today, 90)]) {
        expect(await getDayDetail(FINANCE_USER, open.id, date)).toBeNull();
      }
      // Nor can something that is not a date.
      for (const date of [
        "",
        "abc",
        "2026-02-30",
        "2026-13-01",
        "2026-9-1",
        "20260901",
      ]) {
        expect(await getDayDetail(FINANCE_USER, open.id, date)).toBeNull();
      }
    },
    BUDGET_MS,
  );

  it(
    "day_detail_omits_money_server_side",
    async () => {
      const full = await dayOf(FINANCE_USER, expl, d(6));
      expect(moneyKeys(full)).not.toEqual([]);

      for (const date of [d(6), d(10), d(12), d(20)]) {
        const masked = await dayOf(HOUSEKEEPER, expl, date);
        const kept = await dayOf(FINANCE_USER, expl, date);
        // Not null and not hidden by the screen: the keys are not in the
        // response, at any depth, in the serialized object.
        expect(moneyKeys(JSON.parse(JSON.stringify(masked)))).toEqual([]);
        expect(JSON.stringify(masked)).not.toMatch(
          /minor|amount|currency|correction/i,
        );
        // The Stays, the units, the reasons and the counts remain.
        expect(
          masked.stays.map((stay) => [
            stay.unitName,
            stay.unitType,
            stay.stayType,
            stay.night,
            stay.displayName,
          ]),
        ).toEqual(
          kept.stays.map((stay) => [
            stay.unitName,
            stay.unitType,
            stay.stayType,
            stay.night,
            stay.displayName,
          ]),
        );
        expect(masked.occupiedNights).toBe(kept.occupiedNights);
        expect(masked.chargedNights).toBe(kept.chargedNights);
      }
      expect(
        (await dayOf(HOUSEKEEPER, expl, d(6))).stays.map((stay) => stay.night),
      ).toEqual(["charged", "charged"]);
    },
    BUDGET_MS,
  );

  it(
    "day_detail_of_another_property_is_not_found_not_empty",
    async () => {
      const date = d(6);
      // Another Organization's Property, one in this Organization the viewer
      // is not assigned to, one that has not bought analytics, and a Property
      // that does not exist: each null, never an empty day.
      expect(await getDayDetail(FINANCE_USER, foreign.id, date)).toBeNull();
      expect(await getDayDetail(OUTSIDER, expl.id, date)).toBeNull();
      expect(await getDayDetail(ASSIGNED, unassigned.id, date)).toBeNull();
      expect(await getDayDetail(FINANCE_USER, uncapable.id, date)).toBeNull();
      expect(await getDayDetail(FINANCE_USER, randomUUID(), date)).toBeNull();
      // Control: the same call for a Property the viewer reaches is a day.
      expect(await getDayDetail(FINANCE_USER, expl.id, date)).not.toBeNull();
      expect(await getDayDetail(ASSIGNED, main.id, d(6))).not.toBeNull();
    },
    BUDGET_MS,
  );

  it(
    "day_detail_comes_from_one_snapshot",
    async () => {
      const spy = vi.spyOn(prisma, "$transaction");
      await getDayDetail(FINANCE_USER, expl.id, d(6));
      const options = spy.mock.calls[0]?.[1] as
        { isolationLevel?: string } | undefined;
      spy.mockRestore();
      expect(options?.isolationLevel).toBe("RepeatableRead");
    },
    BUDGET_MS,
  );
});
