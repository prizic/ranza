/**
 * Whether a room needs cleaning (blueprint 5.4, 18.2; ADR 0029).
 *
 * Mirrors `housekeeping_unit_status_status_check`. The database stays the
 * authority: widening this without widening the constraint fails at write
 * time, which is the safe direction.
 */
export type HousekeepingStatus = "dirty" | "clean" | "inspected";

export const HOUSEKEEPING_STATUSES: readonly HousekeepingStatus[] = [
  "dirty",
  "clean",
  "inspected",
];

/**
 * The Entitlement module and Property capability the board is gated by, and
 * the write policies name. A Property without it has no board, and a departure
 * there marks nothing (HK-S1-09).
 */
export const HOUSEKEEPING_CAPABILITY = {
  moduleKey: "housekeeping",
  capabilityKey: "housekeeping",
} as const;

/**
 * How many Units one mark may name. At least one, because a mark of nothing is
 * a client defect rather than a no-op; at most sixty, the size of a floor
 * rather than a Property, so one press cannot rewrite a whole building by
 * accident (HK-S2-10).
 */
export const MARK_BATCH = { min: 1, max: 60 } as const;

/**
 * One status holder on the board: a room, or a bed with no room above it.
 * A bed under a room is not a row of its own — its room answers for it.
 */
export interface HousekeepingRoom {
  unitId: string;
  name: string;
  unitType: string;
  building: string | null;
  floor: number | null;
  /** How many beds the room is let by; zero for a room let whole. */
  bedCount: number;
  /**
   * `clean` when the room has no row: a room is born clean. `dirty` when a
   * Guest has left it since its status last changed, whatever the row says:
   * the worker's mark is on its way, and nobody should wait for it.
   */
  status: HousekeepingStatus;
  /** Whether it may be let tonight as far as housekeeping is concerned. */
  ready: boolean;
  /**
   * When the status last changed, as an ISO instant — the departure itself
   * while the worker has yet to write the room dirty; null if it never has.
   */
  changedAt: string | null;
  /** Whether somebody is in house in the room or any of its beds. */
  inHouse: boolean;
  /** Whether the room, or every bed in it, is out of service. */
  outOfService: boolean;
}

export interface HousekeepingCounts {
  rooms: number;
  dirty: number;
  clean: number;
  inspected: number;
  ready: number;
}

export interface HousekeepingBoard {
  rooms: readonly HousekeepingRoom[];
  counts: HousekeepingCounts;
  /**
   * Whether the reader holds `housekeeping.update_status`, so the screen can
   * show the controls. Hiding them is courtesy; the policy is the boundary.
   */
  mayMark: boolean;
}

/**
 * Whether rooms at a Property are inspected after cleaning before they are
 * ready (slice 3): what the Organization says, what this Property says, and
 * what applies. A setting changes what ready means, never what a room holds.
 */
export interface InspectionSettings {
  /** The Organization's default; off when it has never been set. */
  organizationDefault: boolean;
  /** This Property's own answer; null means it follows the default. */
  propertyOverride: boolean | null;
  /** What applies here: the override, else the default. */
  effective: boolean;
  /** Whether the reader may override this Property. */
  mayConfigure: boolean;
  /**
   * Whether the reader may change the default, which also needs reach to
   * every Property it governs.
   */
  mayConfigureDefault: boolean;
}

/** How an audit record words a setting: a value, or "follows the default". */
export type InspectionValue = "on" | "off" | "default";

export interface UnitsMarked {
  /** How many rooms the mark reached, after beds were folded into rooms. */
  marked: number;
}

/**
 * The request was malformed: no Units, too many, or a status that does not
 * exist. Raised before any statement runs.
 */
export class HousekeepingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HousekeepingInputError";
  }
}

/**
 * Nothing was marked. Deliberately one refusal for every reason — the rooms
 * are out of reach, housekeeping is not available there, the Subscription
 * lapsed, or the actor lacks the permission — because telling them apart
 * would tell a caller which rooms exist where they cannot see.
 */
export class HousekeepingRefusedError extends Error {
  constructor() {
    super("those rooms cannot be marked");
    this.name = "HousekeepingRefusedError";
  }
}
