import type { PriceList, PricedUnitType } from "@ranza/rates";

/**
 * The kinds of Unit this Property has Units of and has set no price for. A
 * booking of one is taken without a price and its nights are never charged:
 * the one thing on the Configuration screen that costs money when it is left
 * undone (CONFIG-01). A kind it has no Units of is not on the list, because no
 * booking of it can be taken.
 *
 * Not in the rates card's own file: that is a client component, and the page,
 * which counts these for the section list, runs on the server.
 */
export function unpricedKinds(priceList: PriceList): PricedUnitType[] {
  return priceList.entries
    .filter((entry) => entry.sellableUnits > 0 && entry.amountMinor === null)
    .map((entry) => entry.unitType);
}
