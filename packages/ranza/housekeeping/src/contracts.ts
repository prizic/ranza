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
  /**
   * Whom a change of the default would reach. Null unless the reader may
   * change it: it is read across the whole Organization, which only that
   * reach can do.
   */
  defaultReach: DefaultReach | null;
}

/**
 * The Properties an Organization's default governs: those that follow it, and
 * so change with it, and those with an answer of their own, which it leaves
 * alone.
 */
export interface DefaultReach {
  following: number;
  /** Names of the Properties that keep their own answer, in name order. */
  keepingOwn: readonly string[];
}

/** How an audit record words a setting: a value, or "follows the default". */
export type InspectionValue = "on" | "off" | "default";

export interface UnitsMarked {
  /** How many rooms the mark reached, after beds were folded into rooms. */
  marked: number;
}

/**
 * How often a room somebody is staying in is cleaned at a Property (RANZ-83,
 * ADR 0063): never, every N days (one is every day), or one weekday a week.
 * Cleaning an occupied room is a different job from turning a room over, and
 * it never changes a room's status: an occupied room due for a clean is not
 * dirty, and is neither refused nor sold as not ready.
 */
export type StayoverCadence =
  | { kind: "none" }
  | { kind: "every_n_days"; everyDays: number }
  | { kind: "weekly"; weekday: number };

/** Mirrors `housekeeping_stayover_settings_shape`; the database stays the authority. */
export const STAYOVER_EVERY_DAYS = { min: 1, max: 14 } as const;

/** ISO weekdays, Monday first, as `extract(isodow ...)` counts them. */
export const STAYOVER_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Whether a value is a cadence the database would accept. */
export function isStayoverCadence(value: unknown): value is StayoverCadence {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "none") return true;
  if (candidate.kind === "every_n_days") {
    const days = candidate.everyDays;
    return (
      typeof days === "number" &&
      Number.isInteger(days) &&
      days >= STAYOVER_EVERY_DAYS.min &&
      days <= STAYOVER_EVERY_DAYS.max
    );
  }
  if (candidate.kind === "weekly") {
    const day = candidate.weekday;
    return (
      typeof day === "number" &&
      Number.isInteger(day) &&
      day >= STAYOVER_WEEKDAYS[0] &&
      day <= STAYOVER_WEEKDAYS[6]
    );
  }
  return false;
}

/** How an audit record words a cadence: its kind and number, or the default. */
export type StayoverValue =
  "default" | "none" | `every_${number}_days` | `weekly_${number}`;

export function stayoverValueOf(
  cadence: StayoverCadence | null,
): StayoverValue {
  if (cadence === null) return "default";
  if (cadence.kind === "none") return "none";
  if (cadence.kind === "every_n_days") return `every_${cadence.everyDays}_days`;
  return `weekly_${cadence.weekday}`;
}

/**
 * What a Property says about stayover cleaning, and whether the reader may
 * change it. `own` is null when the Property follows the default for its
 * operating model, which the host resolves: this module never learns the
 * model (ADR 0057).
 */
export interface StayoverSettings {
  own: StayoverCadence | null;
  mayConfigure: boolean;
}

/** One occupied room on the stayover list. */
export interface StayoverRoom {
  unitId: string;
  name: string;
  building: string | null;
  floor: number | null;
  /** How many beds the room is let by; zero for a room let whole. */
  bedCount: number;
  /** How many people are in house in the room, or in any of its beds. */
  occupants: number;
  /** The Property's business date the earliest of them arrived, as YYYY-MM-DD. */
  arrivedOn: string;
  /** The last time it was cleaned or marked clean, as YYYY-MM-DD; null if never. */
  lastCleanedOn: string | null;
  /** The day it fell due, as YYYY-MM-DD; today or earlier while it is due. */
  dueOn: string;
  /** Whole days past `dueOn`; zero when it is due today or already done. */
  overdueDays: number;
  /** Cleaned today: the press can still be taken back. */
  doneToday: boolean;
}

export interface StayoverBoard {
  /** What applies at this Property: its own cadence, else the host's default. */
  cadence: StayoverCadence;
  /** The Property's business date, as YYYY-MM-DD. */
  today: string;
  /** Due rooms first, most overdue first, then those done today. */
  rooms: readonly StayoverRoom[];
  counts: { due: number; done: number };
  /** Whether the reader holds `housekeeping.update_status`. */
  mayMark: boolean;
}

export interface StayoverMarked {
  /** False when the room had already been cleaned today: a double press is harmless. */
  recorded: boolean;
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
