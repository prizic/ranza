/**
 * The public vocabulary of prices (ADR 0038, docs/features/rates).
 *
 * A night at a Property costs what its price list says for the kind of Unit it
 * is spent in. That is the whole pricing rule: rate plans, seasons and
 * restrictions are Distribution and Revenue's (blueprint 5.16), discounts and
 * taxes are Billing's (5.9), and this module invents none of them.
 */

/** The permission that sets, changes and clears a price. */
export const RATES_MANAGE_PERMISSION = "rates.manage";

/** Where the price list is edited: the Configuration screen's gate. */
export const RATES_CAPABILITY = {
  moduleKey: "platform_core",
  capabilityKey: "configuration",
} as const;

/** The kinds of Unit `accommodation_units_unit_type_check` allows, in the order a screen lists them. */
export const PRICED_UNIT_TYPES = ["room", "bed", "apartment", "suite"] as const;

export type PricedUnitType = (typeof PRICED_UNIT_TYPES)[number];

/**
 * `property_rates_amount_check`'s ceiling, said here so a form can refuse it
 * before the database does and name the field.
 */
export const PRICE_MAX_MINOR = 100_000_000_000;

/** One kind of Unit on the price list. */
export interface PriceListEntry {
  unitType: PricedUnitType;
  /** Per night, in minor units of `currency`. Null when this type is unpriced. */
  amountMinor: number | null;
  /** The currency the price was set in; null when unpriced, including cleared. */
  currency: string | null;
  /**
   * Set in a currency the Property no longer trades in. Such a price prices
   * nothing — a booking of this type is taken unpriced — until it is set again.
   */
  stale: boolean;
  /** Units of this type a booking can be placed on: rooms and beds with no beds under them. */
  sellableUnits: number;
}

export interface PriceList {
  propertyId: string;
  /** What the Property trades in, and so what a price set now is stated in. */
  currency: string;
  entries: PriceListEntry[];
  /** The list as it was read; a save names it, so a stale form is refused. */
  version: string;
  /** The viewer holds `rates.manage`. The policies still decide. */
  mayManage: boolean;
}

/** What a save asks for one type: a price per night, or none. */
export interface PriceChange {
  unitType: PricedUnitType;
  amountMinor: number | null;
}

export interface PricesInput {
  version: string;
  prices: PriceChange[];
}

export type PricesSaved =
  | { status: "saved"; version: string }
  | { status: "unchanged"; version: string };

/** A price the database would refuse, named by type; null when the form itself is malformed. */
export class RatesInputError extends Error {
  constructor(readonly unitType: PricedUnitType | null) {
    super(
      unitType === null
        ? "that is not a price list"
        : `that is not a price for ${unitType}`,
    );
    this.name = "RatesInputError";
  }
}

/**
 * Not the viewer's to change: no permission, out of reach, a lapsed
 * Subscription, or a Property that does not exist. One answer for all of them.
 */
export class RatesRefusedError extends Error {
  constructor() {
    super("those prices cannot be changed here");
    this.name = "RatesRefusedError";
  }
}

/** Somebody else saved the list since it was read; `current` is what it is now. */
export class RatesStaleError extends Error {
  constructor(readonly current: PriceList) {
    super("the price list changed since it was read");
    this.name = "RatesStaleError";
  }
}
