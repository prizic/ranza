/**
 * What the All Properties screen derives from the portfolio read, and who is
 * offered the destination (docs/features/portfolio, slice 2).
 *
 * The read itself is proved against a database in
 * tests/integration/portfolio.test.ts. Here the read is given, and what is
 * decided is what the screen does with it: a sum over fewer Properties than are
 * listed says so, money is never added across currencies, a null figure is
 * never counted as zero, and the rail offers the destination only where there
 * is something to line up.
 */
import { describe, expect, it } from "vitest";
import {
  isPartial,
  occupancyPercent,
  summarize,
} from "../../apps/operator-workspace/src/features/portfolio/derive";
import {
  formatBalance,
  formatBusinessDate,
  formatShare,
} from "../../apps/operator-workspace/src/features/portfolio/format";
import {
  offersPortfolio,
  PORTFOLIO_KEY,
} from "../../apps/operator-workspace/src/lib/portfolio-offer";
import { screenFor } from "../../apps/operator-workspace/src/lib/screens";
import { aPortfolio, aProperty } from "./portfolio-fixtures";

describe("portfolio_summary", () => {
  it("all_properties_summary_occupancy_is_summed_counts", () => {
    // 10 of 20 and 30 of 40: 40 of 60, which is 66.7%. The average of 50% and
    // 75% would be 62.5%, and that is the wrong answer this guards.
    const summary = summarize(
      aPortfolio([
        aProperty({ occupiedUnits: 10, sellableUnits: 20 }),
        aProperty({ occupiedUnits: 30, sellableUnits: 40 }),
      ]),
    );
    expect(summary.occupancy.occupiedUnits).toBe(40);
    expect(summary.occupancy.sellableUnits).toBe(60);
    expect(summary.occupancy.percent).toBeCloseTo(66.67, 1);
    expect(formatShare(summary.occupancy.percent ?? 0, "en")).toBe("66.7%");
  });

  it("all_properties_zero_sellable_units_is_a_dash_not_a_ratio", () => {
    expect(occupancyPercent(0, 0)).toBeNull();
    const summary = summarize(
      aPortfolio([
        aProperty({ occupiedUnits: 0, sellableUnits: 0 }),
        aProperty({ occupiedUnits: 0, sellableUnits: 0 }),
      ]),
    );
    expect(summary.occupancy.percent).toBeNull();
  });

  it("all_properties_a_sum_counted_at_fewer_properties_says_so", () => {
    const summary = summarize(
      aPortfolio([
        aProperty({ openMaintenanceRequests: 4 }),
        aProperty({
          openMaintenanceRequests: null,
          occupiedUnits: null,
          sellableUnits: null,
        }),
        aProperty({ openMaintenanceRequests: 1 }),
      ]),
    );
    expect(summary.maintenance.openRequests).toBe(5);
    expect(summary.maintenance.coverage).toEqual({ reporting: 2, total: 3 });
    expect(isPartial(summary.maintenance.coverage)).toBe(true);
    expect(summary.occupancy.coverage).toEqual({ reporting: 2, total: 3 });
    expect(summary.occupancy.sellableUnits).toBe(40);
  });

  it("every_property_reporting_is_not_partial", () => {
    const summary = summarize(aPortfolio([aProperty(), aProperty()]));
    expect(isPartial(summary.occupancy.coverage)).toBe(false);
    expect(isPartial(summary.maintenance.coverage)).toBe(false);
  });

  it("all_properties_summary_keeps_each_currency_apart", () => {
    const summary = summarize(
      aPortfolio([
        aProperty({ currency: "TRY", openFolioBalanceMinor: 100_000 }),
        aProperty({ currency: "EUR", openFolioBalanceMinor: 25_000 }),
        aProperty({ currency: "TRY", openFolioBalanceMinor: 50_000 }),
      ]),
    );
    expect(summary.balances).toEqual([
      { currency: "EUR", balanceMinor: 25_000 },
      { currency: "TRY", balanceMinor: 150_000 },
    ]);
    // Each is written in its own currency, so no figure can read as the other's.
    expect(formatBalance(25_000, "EUR", "en")).toContain("€");
    expect(formatBalance(150_000, "TRY", "en")).toMatch(/₺|TRY/);
  });

  it("all_properties_summary_money_hidden_is_not_zero", () => {
    const summary = summarize(
      aPortfolio([
        aProperty({ openFolioBalanceMinor: null }),
        aProperty({ openFolioBalanceMinor: null }),
      ]),
    );
    expect(summary.balances).toEqual([]);
    expect(summary.moneyHidden).toBe(true);
  });

  it("money_shown_at_any_property_is_not_hidden", () => {
    const summary = summarize(
      aPortfolio([
        aProperty({ openFolioBalanceMinor: null }),
        aProperty({ openFolioBalanceMinor: 0 }),
      ]),
    );
    // A true zero is a balance: it is shown as the currency's zero.
    expect(summary.balances).toEqual([{ currency: "TRY", balanceMinor: 0 }]);
    expect(summary.moneyHidden).toBe(false);
  });

  it("a_withheld_property_alone_does_not_claim_money_is_hidden", () => {
    const withheld = aProperty({
      entitled: false,
      sellableUnits: null,
      occupiedUnits: null,
      arrivalsToCome: null,
      departuresToCome: null,
      openMaintenanceRequests: null,
      openFolioBalanceMinor: null,
    });
    expect(summarize(aPortfolio([withheld, withheld])).moneyHidden).toBe(false);
  });
});

describe("portfolio_formats", () => {
  it("a_business_date_is_the_date_it_names_in_every_language", () => {
    expect(formatBusinessDate("2026-09-16", "en")).toMatch(/16/);
    expect(formatBusinessDate("2026-09-16", "en")).toMatch(/2026/);
    expect(formatBusinessDate("2026-09-16", "tr")).toMatch(/16/);
    expect(formatBusinessDate("2026-09-16", "ar")).toBeTruthy();
  });
});

describe("portfolio_offer", () => {
  const a = (propertyId: string, organizationId = "org-1") => ({
    propertyId,
    organizationId,
  });

  it("the_rail_offers_all_properties_only_where_several_properties_are_reached", () => {
    expect(offersPortfolio([a("p1"), a("p2")], [a("p1")])).toBe(true);
    // One Property is nothing to line up.
    expect(offersPortfolio([a("p1")], [a("p1")])).toBe(false);
    // Nothing reached at all.
    expect(offersPortfolio([], [])).toBe(false);
  });

  it("the_same_property_reached_through_several_destinations_counts_once", () => {
    expect(
      offersPortfolio([a("p1"), a("p1"), a("p1")], [a("p1"), a("p1")]),
    ).toBe(false);
  });

  it("one_property_in_each_of_two_organizations_is_not_a_portfolio", () => {
    expect(
      offersPortfolio(
        [a("p1", "org-1"), a("p2", "org-2")],
        [a("p1", "org-1"), a("p2", "org-2")],
      ),
    ).toBe(false);
  });

  it("several_properties_without_analytics_anywhere_offer_nothing", () => {
    // Every figure would be withheld: the page would be names alone.
    expect(offersPortfolio([a("p1"), a("p2")], [])).toBe(false);
  });

  it("analytics_in_one_organization_does_not_borrow_the_reach_of_another", () => {
    expect(
      offersPortfolio(
        [a("p1", "org-1"), a("p2", "org-2"), a("p3", "org-2")],
        [a("p1", "org-1")],
      ),
    ).toBe(false);
  });

  it("the_rail_entry_is_derived_and_keyed_as_the_shell_offers_it", () => {
    const screen = screenFor("portfolio");
    expect(screen?.derived).toBe(true);
    expect(screen?.capability).toBe(PORTFOLIO_KEY);
    expect(screen?.built).toBe(true);
  });
});
