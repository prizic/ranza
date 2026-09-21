import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Accommodation: what kind of space a Unit is, what
 * state it is in, and what the Rooms screen may do to it.
 *
 * Designed before it was written: the diagrams and the row-per-boundary table
 * are in `docs/features/rooms-and-beds/`, and every rule below points at the
 * row that decided it.
 *
 * The unions here exist to stay in step with check constraints the module
 * owns — `20260916000400_accommodation_units` and
 * `20260916002900_a_unit_is_added_and_blocked_from_the_workspace`. The
 * database is the authority; widening a union here without widening the
 * constraint produces a runtime insert failure, which is the correct way round.
 */

/**
 * Which kinds a Property uses is configuration, not a different product: a
 * dormitory is a Property whose Units are beds (ADR 0004).
 */
export type AccommodationUnitType = "room" | "bed" | "apartment" | "suite";

/**
 * A Unit's operational status.
 *
 * `blocked` is one of blueprint 18.2's six and the one this module has a
 * command for. `occupied` is allowed and nothing writes it — occupancy is a
 * fact about Stays, and `listUnits` reads it that way (RB-S1-04).
 * `out_of_service` is the housekeeping lifecycle's, which replaces this union
 * with the whole set.
 */
export type AccommodationUnitStatus =
  "available" | "occupied" | "out_of_service" | "blocked";

/**
 * Where the Rooms screen lives: under the front desk (blueprint 4.7, front-desk
 * mode). The read carries this in its own statement, the same way the booking
 * form's Unit list does; the writes name it inside their policies (ADR 0012).
 *
 * Its own constant rather than `FRONT_DESK_CAPABILITY` from
 * `@ranza/reservations`, which already depends on this module: the import
 * would be a cycle.
 */
export const ROOMS_CAPABILITY: CapabilityRef = {
  moduleKey: "front_office",
  capabilityKey: "front_desk",
};

/**
 * Bounds the database enforces, published so a form can restate them and a
 * test can notice when the two disagree.
 */

/** How many rooms one add may create (RB-S2-09). */
export const UNIT_BATCH = { min: 1, max: 60 } as const;

/** `accommodation_units_capacity_check`. */
export const UNIT_CAPACITY = { min: 1, max: 64 } as const;

/**
 * A room let by the bed holds at most this many, because beds are named by
 * letter (RB-S2-08). The capacity constraint allows 64 for a room sold whole,
 * which is a different thing.
 */
export const BEDS_PER_ROOM = { max: 26 } as const;

/** `accommodation_units_status_reason_check` (RB-S3-02). */
export const BLOCK_REASON = { min: 3, max: 200 } as const;

/** `accommodation_units_building_check`. */
export const BUILDING_NAME = { max: 60 } as const;

/** `accommodation_units_floor_check`. */
export const FLOOR = { min: -20, max: 200 } as const;

/** A room number: digits, so the batch can count on from it. */
export const ROOM_NUMBER = { min: 1, max: 8 } as const;

/**
 * What one sellable Unit is doing tonight, in order of precedence: somebody in
 * it wins over everything, then the two states a Staff Member set, then a
 * booking on the way, then nothing.
 */
export type UnitState =
  | { kind: "in_house"; guestName: string; endsOn: string | null }
  | { kind: "blocked"; reason: string }
  | { kind: "out_of_service" }
  | { kind: "reserved"; arrivesOn: string }
  | { kind: "free" };

/** A Unit as the Rooms screen shows it. */
export interface UnitEntry {
  unitId: string;
  name: string;
  unitType: AccommodationUnitType;
  capacity: number;
  building: string | null;
  floor: number | null;
  status: AccommodationUnitStatus;
  /**
   * Tonight, for a Unit that is sellable. Null for a room let by the bed: it
   * carries no state of its own, and its beds carry theirs (RB-S1-06).
   */
  state: UnitState | null;
  /** The beds under a room, in name order. Empty for anything else. */
  beds: readonly UnitEntry[];
}

/**
 * The counts above the map (RB-S1-09).
 *
 * `rooms` is the top-level Units; `sellable` the leaves. `inHouse`, `free`,
 * `blocked` and `outOfService` partition the leaves; `reserved` is the part of
 * `free` with a booking on the way, counted so the map can say so.
 */
export interface UnitCounts {
  rooms: number;
  sellable: number;
  inHouse: number;
  reserved: number;
  free: number;
  blocked: number;
  outOfService: number;
}

export interface UnitMap {
  /** The Property's own day, as `YYYY-MM-DD`, that every state was measured on. */
  today: string;
  /** Top-level Units, by building, floor and name. */
  units: readonly UnitEntry[];
  counts: UnitCounts;
}

/** Rooms to add in one go (RB-S2-01, RB-S2-02). */
export interface NewUnits {
  propertyId: string;
  building: string | null;
  floor: number | null;
  unitType: AccommodationUnitType;
  /** Digits. Rooms are numbered in order from here, keeping its width. */
  firstNumber: string;
  count: number;
  /** How many the room sleeps; with `letByTheBed`, how many beds it gets. */
  capacity: number;
  /** One bed per sleeping place, named A, B, C… Rooms only (RB-S2-12). */
  letByTheBed: boolean;
}

export interface UnitsAdded {
  unitIds: readonly string[];
  names: readonly string[];
  bedCount: number;
}

/**
 * A room name already at the Property (RB-S2-06). Carries the name because
 * it is the one thing a person can change.
 */
export class UnitNameTakenError extends Error {
  constructor(public readonly unitName: string) {
    super(`a Unit named ${unitName} is already at this Property`);
    this.name = "UnitNameTakenError";
  }
}

/** A shape the caller can correct: a count, a capacity, a reason's length. */
export class UnitConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConfigurationError";
  }
}

/**
 * Out of reach, unentitled, lapsed, no permission, or no such Unit — one
 * answer for all of them on purpose, because telling them apart would confirm
 * that a Unit the caller cannot see is there.
 */
export class UnitRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitRefusedError";
  }
}

/**
 * The one refusal a Staff Member can act on: somebody is in it, or it is let by
 * the bed and the bed is what to block (RB-S3-03, RB-S3-04).
 */
export class UnitOccupiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitOccupiedError";
  }
}
