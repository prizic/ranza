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

/** A Guest leaving with something owing, as the departures list shows it. */
export function isOwing(departure: Pick<Departure, "balanceMinor">): boolean {
  return departure.balanceMinor > 0;
}

export function inArrivalFilter(
  filter: ArrivalFilter | null,
  arrival: Pick<Arrival, "status">,
): boolean {
  return filter === null || isToCome(arrival);
}

export function inDepartureFilter(
  filter: DepartureFilter | null,
  departure: Pick<Departure, "balanceMinor" | "overdue">,
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
 * nobody cleans or lets it (TD-S1-17).
 */
export function inRoomFilter(
  filter: Exclude<RoomFilter, "for_arrival" | "clean_first">,
  room: Pick<HousekeepingRoom, "outOfService" | "ready" | "status">,
): boolean {
  if (filter === "out_of_service") return room.outOfService;
  if (room.outOfService) return false;
  switch (filter) {
    case "in_service":
      return true;
    case "ready":
      return room.ready;
    case "awaiting_inspection":
      return room.status === "clean" && !room.ready;
    case "dirty":
      return room.status === "dirty";
  }
}
