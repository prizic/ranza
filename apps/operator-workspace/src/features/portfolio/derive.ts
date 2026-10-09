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
