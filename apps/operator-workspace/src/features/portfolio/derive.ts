import type { Portfolio, PortfolioProperty } from "../../server/portfolio";

/**
 * What the portfolio's summary says, derived from the read and never from a
 * second one.
 *
 * Three rules shape it. A null figure is "not available to this viewer", so it
 * is left out of a sum and the summary says how many Properties it is
 * counted at; a sum over fewer Properties than are listed, shown without
 * that, would be an understatement that reads as a fact. Occupancy stays
 * counts, with a ratio computed from the summed counts and never an average
 * of ratios (PF-S1-14). And money is one line per currency because the read
 * never adds across currencies and neither may the screen (PF-S1-13).
 */

/** How many of the listed Properties a summed figure was counted at. */
export interface Coverage {
  reporting: number;
  total: number;
}

export interface PortfolioSummary {
  occupancy: {
    occupiedUnits: number;
    sellableUnits: number;
    /** Occupied as a share of sellable, 0 to 100, or null with nothing sellable. */
    percent: number | null;
    coverage: Coverage;
  };
  maintenance: {
    openRequests: number;
    coverage: Coverage;
  };
  /** One entry per currency, never added together. Empty when no money is shown. */
  balances: Portfolio["balancesByCurrency"];
  /** How many of the listed Properties the money is counted at (PORTFOLIO-02). */
  balancesCoverage: Coverage;
  /**
   * True when Properties show figures but none shows money: the viewer's role
   * or the Property's billing keeps it from them, and the page says so
   * instead of leaving a dash to be read as zero.
   */
  moneyHidden: boolean;
}

/** Occupied over sellable as a percentage, or null when nothing is sellable (PF-S1-16). */
export function occupancyPercent(
  occupiedUnits: number,
  sellableUnits: number,
): number | null {
  if (sellableUnits <= 0) return null;
  return (occupiedUnits / sellableUnits) * 100;
}

export function summarize(portfolio: Portfolio): PortfolioSummary {
  const { properties } = portfolio;
  const total = properties.length;
  const countedOccupancy = properties.filter(hasOccupancy).length;
  const maintenance = properties.flatMap((property) =>
    property.openMaintenanceRequests === null
      ? []
      : [property.openMaintenanceRequests],
  );
  const entitled = properties.filter((property) => property.entitled);

  return {
    occupancy: {
      ...portfolio.occupancy,
      percent: occupancyPercent(
        portfolio.occupancy.occupiedUnits,
        portfolio.occupancy.sellableUnits,
      ),
      coverage: { reporting: countedOccupancy, total },
    },
    maintenance: {
      openRequests: maintenance.reduce((sum, open) => sum + open, 0),
      coverage: { reporting: maintenance.length, total },
    },
    balances: portfolio.balancesByCurrency,
    balancesCoverage: {
      reporting: properties.filter(
        (property) => property.openFolioBalanceMinor !== null,
      ).length,
      total,
    },
    moneyHidden:
      entitled.length > 0 &&
      entitled.every((property) => property.openFolioBalanceMinor === null),
  };
}

function hasOccupancy(property: PortfolioProperty): boolean {
  return property.occupiedUnits !== null && property.sellableUnits !== null;
}

/** Whether a summed figure was counted at fewer Properties than are listed. */
export function isPartial(coverage: Coverage): boolean {
  return coverage.reporting < coverage.total;
}

/** The orders the Properties can be set in. The default is by name, as the read returns them. */
export const PORTFOLIO_SORTS = [
  "name",
  "occupancy",
  "money",
  "maintenance",
  "arrivals",
] as const;
export type PortfolioSort = (typeof PORTFOLIO_SORTS)[number];

/** How the Properties are drawn: a card each, or a row each. */
export const PORTFOLIO_VIEWS = ["cards", "table"] as const;
export type PortfolioView = (typeof PORTFOLIO_VIEWS)[number];

export function parsePortfolioSort(raw: string | undefined): PortfolioSort {
  return (PORTFOLIO_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as PortfolioSort)
    : "name";
}

export function parsePortfolioView(raw: string | undefined): PortfolioView {
  return raw === "table" ? "table" : "cards";
}

/**
 * The Properties in the order asked for, the one that is furthest behind first
 * where "behind" is plain: the lowest share of units in use; the most owed,
 * open or still to come where more is what wants looking at. No target is
 * invented, so nothing is marked behind — only put first.
 *
 * A Property whose figure is not available to the viewer goes last, in name
 * order, never first as a zero would. Money is ordered within a currency and
 * the currencies one after the other, because an amount in one is not larger
 * than an amount in another (PF-S1-13).
 */
export function sortProperties(
  properties: readonly PortfolioProperty[],
  sort: PortfolioSort,
): PortfolioProperty[] {
  const byName = (a: PortfolioProperty, b: PortfolioProperty) =>
    a.propertyName.localeCompare(b.propertyName) ||
    a.propertyId.localeCompare(b.propertyId);
  const last = (value: number | null, direction: 1 | -1) =>
    value === null ? Number.POSITIVE_INFINITY : value * direction;
  const share = (property: PortfolioProperty) =>
    property.occupiedUnits === null || property.sellableUnits === null
      ? null
      : occupancyPercent(property.occupiedUnits, property.sellableUnits);
  const key = (property: PortfolioProperty): number => {
    switch (sort) {
      case "occupancy":
        return last(share(property), 1);
      case "money":
        return last(property.openFolioBalanceMinor, -1);
      case "maintenance":
        return last(property.openMaintenanceRequests, -1);
      case "arrivals":
        return last(property.arrivalsToCome, -1);
      case "name":
        return 0;
    }
  };
  return [...properties].sort((a, b) => {
    if (sort === "money" && a.currency !== b.currency) {
      return a.currency < b.currency ? -1 : 1;
    }
    return key(a) - key(b) || byName(a, b);
  });
}
