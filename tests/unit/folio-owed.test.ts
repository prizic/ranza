/**
 * What a Guest owes is one figure (FINANCE-01, RANZ-52).
 *
 * The audit found three answers to one question: Today's departures said
 * 92,160 where its open Folios said 66,335, and Finance said 94,335 with a
 * Balance column that read 0.00 on the Folio Today called 11,200. The cause was
 * three sums over one bill. These tests hold the one function to the arithmetic
 * and hold every screen's figure to the function.
 */
import { describe, expect, it } from "vitest";
import type { FolioSummary } from "../../packages/ranza/folios/src";
import {
  isOwing,
  owedAcrossFolios,
  owedOnFolio,
} from "../../apps/operator-workspace/src/lib/owed";
import { moneyFrom } from "../../apps/operator-workspace/src/server/today-derive";
import type { Departure } from "../../packages/ranza/reservations/src";

const bill = (balanceMinor: number, pendingMinor = 0) => ({
  balanceMinor,
  pendingMinor,
});

describe("what one Guest owes", () => {
  it("is_what_is_on_the_bill_plus_the_nights_check_out_will_add", () => {
    expect(owedOnFolio(bill(0, 1_120_000))).toEqual({
      nowMinor: 0,
      atCheckOutMinor: 1_120_000,
      totalMinor: 1_120_000,
      netMinor: 1_120_000,
    });
    expect(owedOnFolio(bill(733_000, 0))).toMatchObject({
      nowMinor: 733_000,
      atCheckOutMinor: 0,
      totalMinor: 733_000,
    });
    expect(owedOnFolio(bill(50_000, 112_000))).toMatchObject({
      nowMinor: 50_000,
      atCheckOutMinor: 112_000,
      totalMinor: 162_000,
    });
  });

  it("spends_a_credit_on_the_nights_check_out_will_add", () => {
    // 500 paid ahead and 1,120 of nights still to come: 620 is owed, all of it at check-out.
    expect(owedOnFolio(bill(-50_000, 112_000))).toEqual({
      nowMinor: 0,
      atCheckOutMinor: 62_000,
      totalMinor: 62_000,
      netMinor: 62_000,
    });
  });

  it("owes_nothing_in_credit_and_says_so_with_a_negative_net", () => {
    expect(owedOnFolio(bill(-50_000, 0))).toEqual({
      nowMinor: 0,
      atCheckOutMinor: 0,
      totalMinor: 0,
      netMinor: -50_000,
    });
    expect(isOwing(bill(-50_000, 0))).toBe(false);
    expect(isOwing(bill(0, 0))).toBe(false);
    expect(isOwing(bill(0, 1))).toBe(true);
  });

  it("a_credit_on_one_folio_does_not_make_another_folios_debt_smaller", () => {
    const [sum] = owedAcrossFolios([
      { ...bill(100_000, 0), currency: "TRY" },
      { ...bill(-70_000, 0), currency: "TRY" },
      { ...bill(0, 20_000), currency: "TRY" },
    ]);
    expect(sum).toEqual({
      currency: "TRY",
      folios: 2,
      nowMinor: 100_000,
      atCheckOutMinor: 20_000,
      totalMinor: 120_000,
    });
  });

  it("keeps_each_currency_to_itself", () => {
    const sums = owedAcrossFolios([
      { ...bill(100, 0), currency: "TRY" },
      { ...bill(200, 0), currency: "EUR" },
    ]);
    expect(sums.map((sum) => [sum.currency, sum.totalMinor])).toEqual([
      ["TRY", 100],
      ["EUR", 200],
    ]);
  });
});

function folio(
  id: string,
  balanceMinor: number,
  pendingMinor: number,
  overrides: Partial<FolioSummary> = {},
): FolioSummary {
  return {
    folioId: id,
    propertyId: "p-1",
    stayId: `s-${id}`,
    reservationId: null,
    reference: null,
    stayType: "guest",
    status: "open",
    currency: "TRY",
    guestName: `Guest ${id}`,
    unitName: id,
    startsOn: "2026-10-01",
    endsOn: "2026-10-05",
    chargedMinor: balanceMinor,
    paidMinor: 0,
    balanceMinor,
    lineCount: 0,
    lastPostedAt: null,
    roomNightLines: 0,
    stayInHouse: pendingMinor > 0,
    today: "2026-10-24",
    lastClosedOn: null,
    nightlyRateMinor: null,
    pendingNights: pendingMinor > 0 ? 2 : 0,
    pendingMinor,
    ...overrides,
  };
}

function departureOf(f: FolioSummary): Departure {
  return {
    stayId: f.stayId,
    reservationId: null,
    reference: null,
    guestName: f.guestName,
    stayType: "guest",
    startsOn: f.startsOn,
    endsOn: f.endsOn,
    unitId: `u-${f.unitName}`,
    unitName: f.unitName,
    roomName: null,
    unitType: "room",
    unitStatus: "occupied",
    overdue: true,
    overdueDays: 3,
    early: false,
    folioId: f.folioId,
    folioVersion: 1,
    balanceMinor: f.balanceMinor,
    currency: f.currency,
    pendingNights: f.pendingNights,
    pendingMinor: f.pendingMinor,
    nightlyRateMinor: null,
    mayCheckOut: true,
    mayAmend: true,
  } as unknown as Departure;
}

describe("every screen shows the figure the function gives", () => {
  // The shape of the audit's staging: folios that owe on the bill, folios that
  // owe only nights check-out will charge (404 reads 0.00 on a bill), one in
  // credit, one closed with a balance, one settled.
  const folios = [
    folio("101", 733_000, 0),
    folio("202", 90_000, 112_000),
    folio("404", 0, 1_120_000),
    folio("505", 0, 560_000),
    folio("606", -50_000, 0),
    folio("707", 25_000, 0, { status: "closed" }),
    folio("808", 0, 0),
  ];
  const leaving = folios.filter((f) => f.stayInHouse).map(departureOf);

  it("today_finance_and_the_function_say_the_same_for_the_open_folios", () => {
    const today = moneyFrom(leaving, folios, "2026-10-24");
    const open = folios.filter((f) => f.status === "open");
    const [finance] = owedAcrossFolios(open);

    expect(today.openOwing).toBe(finance!.folios);
    expect(today.openOwed).toEqual([
      { amountMinor: finance!.totalMinor, currency: "TRY" },
    ]);
    expect(today.openAtCheckOut).toEqual([
      { amountMinor: finance!.atCheckOutMinor, currency: "TRY" },
    ]);
    // 733,000 + (90,000 + 112,000) + 1,120,000 + 560,000
    expect(finance!.totalMinor).toBe(2_615_000);
  });

  it("the_guests_leaving_never_owe_more_than_the_folios_they_are_part_of", () => {
    const today = moneyFrom(leaving, folios, "2026-10-24");
    const open = today.openOwed[0]!.amountMinor;
    expect(today.leaving!.owed[0]!.amountMinor).toBeLessThanOrEqual(open);
  });

  it("a_folio_reads_the_same_on_the_open_list_and_the_departures_row", () => {
    const today = moneyFrom(leaving, folios, "2026-10-24");
    const largest = today.largest.find((row) => row.folioId === "404");
    const row = today.leaving!.rows.find((r) => r.folioId === "404");
    expect(largest?.balance.amountMinor).toBe(1_120_000);
    expect(row?.balance?.amountMinor).toBe(1_120_000);
  });

  it("a_folio_in_credit_is_in_no_figure", () => {
    const today = moneyFrom(leaving, folios, "2026-10-24");
    expect(today.largest.map((row) => row.folioId)).not.toContain("606");
    expect(today.largest.map((row) => row.folioId)).not.toContain("808");
  });
});
