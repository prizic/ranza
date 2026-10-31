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
 * How many beds a room may have for a bed to be priced by it: the most a Unit
 * sleeps (`accommodation_units_capacity_check`), which is also
 * `property_rates_room_capacity_check`'s bound.
 */
export const ROOM_CAPACITY = { min: 1, max: 64 } as const;

/**
 * The name a price has on a form and in a log: the kind, and for a bed priced
 * by its room's size, the size after a colon. `bed` is the price of a bed in
 * any room without a price of its own; `bed:4` is the price of a bed in a room
 * of four (ADR 0038 amended).
 */
export function priceKey(
  unitType: PricedUnitType,
  roomCapacity: number | null,
): string {
  return roomCapacity === null ? unitType : `${unitType}:${roomCapacity}`;
}

/** The inverse of `priceKey`; null for a name that is not one, including a size on a kind that has none. */
export function parsePriceKey(
  key: string,
): { unitType: PricedUnitType; roomCapacity: number | null } | null {
  const [unitType, size, ...rest] = key.split(":");
  if (
    rest.length > 0 ||
    !(PRICED_UNIT_TYPES as readonly string[]).includes(unitType ?? "")
  ) {
    return null;
  }
  if (size === undefined) {
    return { unitType: unitType as PricedUnitType, roomCapacity: null };
  }
  const roomCapacity = /^\d{1,2}$/.test(size) ? Number(size) : Number.NaN;
  return unitType === "bed" &&
    roomCapacity >= ROOM_CAPACITY.min &&
    roomCapacity <= ROOM_CAPACITY.max
    ? { unitType: "bed", roomCapacity }
    : null;
}

/**
 * `property_rates_amount_check`'s ceiling, said here so a form can refuse it
 * before the database does and name the field.
 */
export const PRICE_MAX_MINOR = 100_000_000_000;

/** One price on the list: a kind of Unit, or a bed in a room of one size. */
export interface PriceListEntry {
  /**
   * The name of this price on a form and in a log - `priceKey` of the two
   * fields below. Carried so a screen never has to import the function: a
   * client component that did would pull this package's database into its
   * bundle.
   */
  key: string;
  unitType: PricedUnitType;
  /**
   * Null for the price of a kind (for a bed, in any room without a price of
   * its own). A number for the price of a bed in a room with that many beds.
   */
  roomCapacity: number | null;
  /** Per night, in minor units of `currency`. Null when this type is unpriced. */
  amountMinor: number | null;
  /** The currency the price was set in; null when unpriced, including cleared. */
  currency: string | null;
  /**
   * Set in a currency the Property no longer trades in. Such a price prices
   * nothing — a booking of this type is taken unpriced — until it is set again.
   */
  stale: boolean;
  /**
   * Units this price is the one for: those of this type a booking can be
   * placed on - rooms and beds with no beds under them. For the general bed
   * price, only the beds no size price already covers; for a size, the beds
   * in rooms of that size.
   */
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

/** What a save asks for one price: a price per night, or none. */
export interface PriceChange {
  unitType: PricedUnitType;
  roomCapacity: number | null;
  amountMinor: number | null;
}

export interface PricesInput {
  version: string;
  prices: PriceChange[];
}

export type PricesSaved =
  | { status: "saved"; version: string }
  | { status: "unchanged"; version: string };

/** A price the database would refuse, named by type and size; null when the form itself is malformed. */
export class RatesInputError extends Error {
  constructor(
    readonly unitType: PricedUnitType | null,
    readonly roomCapacity: number | null = null,
  ) {
    super(
      unitType === null
        ? "that is not a price list"
        : `that is not a price for ${priceKey(unitType, roomCapacity)}`,
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
