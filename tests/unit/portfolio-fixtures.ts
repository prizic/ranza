import type {
  Portfolio,
  PortfolioProperty,
} from "../../apps/operator-workspace/src/server/portfolio";

/**
 * Portfolios for the All Properties tests: a Property with every figure
 * present, and a portfolio totalled the way `readPortfolio` totals one.
 */

let sequence = 0;

export function aProperty(
  overrides: Partial<PortfolioProperty> = {},
): PortfolioProperty {
  sequence += 1;
  return {
    propertyId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    propertyName: `Property ${sequence}`,
    currency: "TRY",
    businessDate: "2026-09-16",
    entitled: true,
    sellableUnits: 20,
    occupiedUnits: 10,
    arrivalsToCome: 3,
    departuresToCome: 2,
    openMaintenanceRequests: 4,
    openFolioBalanceMinor: 125_000,
    ...overrides,
  };
}

/** A portfolio the way `readPortfolio` totals it: the same sums, in the same order. */
export function aPortfolio(properties: PortfolioProperty[]): Portfolio {
  const occupancy = { occupiedUnits: 0, sellableUnits: 0 };
  const balances = new Map<string, number>();
  for (const property of properties) {
    if (property.occupiedUnits !== null && property.sellableUnits !== null) {
      occupancy.occupiedUnits += property.occupiedUnits;
      occupancy.sellableUnits += property.sellableUnits;
    }
    if (property.openFolioBalanceMinor !== null) {
      balances.set(
        property.currency,
        (balances.get(property.currency) ?? 0) + property.openFolioBalanceMinor,
      );
    }
  }
  return {
    organizationId: "00000000-0000-4000-8000-0000000000aa",
    asOf: "2026-09-16T09:30:00.000Z",
    properties,
    occupancy,
    balancesByCurrency: [...balances]
      .map(([currency, balanceMinor]) => ({ currency, balanceMinor }))
      .sort((a, b) => (a.currency < b.currency ? -1 : 1)),
  };
}
