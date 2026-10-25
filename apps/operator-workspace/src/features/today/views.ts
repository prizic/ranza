import type { FolioSummary } from "@ranza/folios";
import type { HousekeepingRoom } from "@ranza/housekeeping";
import type { Arrival, Departure } from "@ranza/reservations";

/**
 * The part of a list a figure on Today counts (TD-S5-01).
 *
 * A figure that counts a subset of its list opens the list narrowed to exactly
 * that subset, through `?show=`. Today and the list both ask the functions
 * below, so the number and the rows it opens cannot be two definitions that
 * drift apart: one is the length of the other.
 *
 * An unknown value is no narrowing at all, so a stale or hand-typed address
 * opens the whole list rather than an error.
 */

export const ARRIVAL_FILTERS = ["to_come"] as const;
export type ArrivalFilter = (typeof ARRIVAL_FILTERS)[number];

export const DEPARTURE_FILTERS = ["owing", "overdue_owing"] as const;
export type DepartureFilter = (typeof DEPARTURE_FILTERS)[number];

export const ROOM_FILTERS = [
  "in_service",
  "ready",
  "awaiting_inspection",
  "dirty",
  "out_of_service",
  "for_arrival",
  "clean_first",
] as const;
export type RoomFilter = (typeof ROOM_FILTERS)[number];

export const FOLIO_FILTERS = ["open"] as const;
export type FolioFilter = (typeof FOLIO_FILTERS)[number];

function parse<T extends string>(
  allowed: readonly T[],
  raw: string | undefined,
): T | null {
  return allowed.find((value) => value === raw) ?? null;
}

export const parseArrivalFilter = (raw: string | undefined) =>
  parse(ARRIVAL_FILTERS, raw);
export const parseDepartureFilter = (raw: string | undefined) =>
  parse(DEPARTURE_FILTERS, raw);
export const parseRoomFilter = (raw: string | undefined) =>
  parse(ROOM_FILTERS, raw);
export const parseFolioFilter = (raw: string | undefined) =>
  parse(FOLIO_FILTERS, raw);

/**
 * `?floor=` on the board: a number, or `none` for rooms with no floor. Anything
 * else is no narrowing, like an unknown `?show=`.
 */
export type FloorFilter = { floor: number | null };

export function parseFloorFilter(raw: string | undefined): FloorFilter | null {
  if (raw === "none") return { floor: null };
  return raw !== undefined && /^-?\d{1,3}$/.test(raw)
    ? { floor: Number(raw) }
    : null;
}

export interface Money {
  amountMinor: number;
  currency: string;
}

/** Sums per currency, in first-seen order; a Property keeps one in practice. */
export function totals(amounts: readonly Money[]): Money[] {
  const byCurrency = new Map<string, number>();
  for (const { amountMinor, currency } of amounts) {
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amountMinor);
  }
  return [...byCurrency].map(([currency, amountMinor]) => ({
    amountMinor,
    currency,
  }));
}

/** An arrival still to come: not yet in the room (TD-S1-10). */
export function isToCome(arrival: Pick<Arrival, "status">): boolean {
  return arrival.status !== "checked_in";
}

/**
 * A Guest who gives up their room at the close of this day: due out today and
 * still here. An overdue Guest does not: they are still in the room, and ADR
 * 0033 says an in-house Stay holds its Unit until somebody checks it out, so
 * their room is occupied tonight (RANZ-51).
 */
export function leavesTonight(departure: Pick<Departure, "overdue">): boolean {
  return !departure.overdue;
}

/**
 * Whether an arrival still to come puts a Guest in a room of its own tonight,
 * by the nights a booking holds. A request nobody confirmed holds nothing, a
 * blocked or out-of-service Unit is not counted at all, and a Guest who stays
 * on in the room (overdue, or leaving a later day) already holds it: those are
 * one room, not two (ADR 0033). An occupant who leaves today hands the room
 * to the arrival.
 */
export function holdsTonight(
  arrival: Pick<Arrival, "status" | "checkInBlocker" | "occupantLeaves">,
): boolean {
  if (!isToCome(arrival) || arrival.status === "requested") return false;
  switch (arrival.checkInBlocker) {
    case null:
      return true;
    case "unit_occupied":
      return arrival.occupantLeaves === "today";
    case "not_confirmed":
    case "unit_blocked":
    case "unit_out_of_service":
      return false;
  }
}

/**
 * The Units that can be let at all: not blocked, not out of service. The room
 * calendar's nights are counted against exactly these, so a percentage of
 * tonight means the same thing on both screens (RANZ-52).
 */
export function availableUnits(counts: {
  sellable: number;
  blocked: number;
  outOfService: number;
}): number {
  return Math.max(0, counts.sellable - counts.blocked - counts.outOfService);
}

/**
 * The Units held tonight, once the day is over: those in house, less the
 * Guests who go today, plus the arrivals that put a Guest in a room of their
 * own. The room calendar's first night counts the same rooms from its bars;
 * an integration test holds the two to each other (RANZ-52).
 */
export function expectedTonight(
  counts: {
    sellable: number;
    blocked: number;
    outOfService: number;
    inHouse: number;
  },
  arriving: number,
  leaving: number,
): number {
  return Math.min(
    availableUnits(counts),
    Math.max(0, counts.inHouse + arriving - leaving),
  );
}

/**
 * Whole days a Guest is past their planned departure, counted on the
 * Property's own business date; 0 on the day itself or before it.
 */
export function overdueDays(
  endsOn: string | null,
  businessDate: string,
): number {
  if (endsOn === null) return 0;
  const days = Math.round(
    (Date.parse(`${businessDate}T00:00:00Z`) -
      Date.parse(`${endsOn}T00:00:00Z`)) /
      86_400_000,
  );
  return Math.max(0, days);
}

/**
 * What a Guest leaving owes: the Folio's balance plus the nights check-out will
 * charge (ADR 0038). The figure the check-out dialog asks about, so a row, a
 * filter and a figure on Today cannot say a Guest owes nothing while the dialog
 * demands a reason for the bill.
 */
export function owedMinor(
  departure: Pick<Departure, "balanceMinor" | "pendingMinor">,
): number {
  return departure.balanceMinor + departure.pendingMinor;
}

/** A Guest leaving with something owing, as the departures list shows it. */
export function isOwing(
  departure: Pick<Departure, "balanceMinor" | "pendingMinor">,
): boolean {
  return owedMinor(departure) > 0;
}

export function inArrivalFilter(
  filter: ArrivalFilter | null,
  arrival: Pick<Arrival, "status">,
): boolean {
  return filter === null || isToCome(arrival);
}

export function inDepartureFilter(
  filter: DepartureFilter | null,
  departure: Pick<Departure, "balanceMinor" | "pendingMinor" | "overdue">,
): boolean {
  switch (filter) {
    case null:
      return true;
    case "owing":
      return isOwing(departure);
    case "overdue_owing":
      return isOwing(departure) && departure.overdue;
  }
}

export function inFolioFilter(
  filter: FolioFilter | null,
  folio: Pick<FolioSummary, "status">,
): boolean {
  return filter === null || folio.status === "open";
}

/**
 * The room readiness the board's own columns say, for the filters that need no
 * other list. A room out of service is in none of them but `out_of_service`:
 * nobody cleans or lets it (TD-S1-17). Ready means a Guest can be put in the
 * room tonight, so housekeeping calling it ready is not enough: nobody may be
 * in it (RANZ-57). The same goes for dirty and awaiting inspection: a room with
 * a Guest in it is in house, not on either list, so every figure with one of
 * these names counts the same rooms on every screen (TODAY-03).
 */
export function inRoomFilter(
  filter: Exclude<RoomFilter, "for_arrival" | "clean_first">,
  room: Pick<HousekeepingRoom, "inHouse" | "outOfService" | "ready" | "status">,
): boolean {
  if (filter === "out_of_service") return room.outOfService;
  if (room.outOfService) return false;
  switch (filter) {
    case "in_service":
      return true;
    case "ready":
      return room.ready && !room.inHouse;
    case "awaiting_inspection":
      return room.status === "clean" && !room.ready && !room.inHouse;
    case "dirty":
      return room.status === "dirty" && !room.inHouse;
  }
}
