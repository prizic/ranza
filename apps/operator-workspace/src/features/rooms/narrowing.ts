import type { Gender } from "@ranza/core";
import type { ListFilterKey } from "../today/components/list-filter-notice";
import {
  FREE_FILTER_KEY,
  inBlock,
  parseBlockFilter,
  type AdmitsFilter,
  type BlockFilter,
} from "../today/views";

/**
 * Narrowing the beds by block and by whom the room admits — one definition for
 * Rooms and the room calendar, so a count on one screen is the count on the
 * other (RB-S6-01, RC-S7-05).
 *
 * "Free" is not decided here. Callers pass the ids `freePlaces` named from the
 * Rooms read, which is the definition Today's Empty beds card and the Rooms
 * tiles count with (RB-S5-19).
 */

/** A top-level room, or a Unit let whole, as both screens hold it. */
export interface NarrowableRoom {
  unitId: string;
  building: string | null;
  admits: Gender | null;
  beds: readonly { unitId: string }[];
}

export interface Narrowing {
  /**
   * A building — a block, in a dormitory — as `?block=` names it, `{ block:
   * null }` for the rooms recorded in none, or null for every room.
   */
  block: BlockFilter | null;
  admits: AdmitsFilter | null;
}

export const NO_NARROWING: Narrowing = { block: null, admits: null };

export function isNarrowed(narrowing: Narrowing): boolean {
  return narrowing.block !== null || narrowing.admits !== null;
}

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** The buildings the rooms are in, named and in name order; rooms with none are in no block. */
export function blocksOf(rooms: readonly NarrowableRoom[]): string[] {
  return [
    ...new Set(
      rooms
        .map((room) => room.building)
        .filter((building): building is string => building !== null),
    ),
  ].sort(byName.compare);
}

/** Whether any room admits one gender only, so the choice means something. */
export function hasGenderedRooms(rooms: readonly NarrowableRoom[]): boolean {
  return rooms.some((room) => room.admits !== null);
}

/** Whether some room is recorded in no building, so "Other rooms" means something. */
export function hasUnbuiltRooms(rooms: readonly NarrowableRoom[]): boolean {
  return rooms.some((room) => room.building === null);
}

/**
 * A block named in an address, kept only when some room is in it: a stale or
 * hand-typed block narrows nothing, as an unknown `?show=` does (RB-S6-02).
 */
export function knownBlock(
  raw: string | null | undefined,
  rooms: readonly NarrowableRoom[],
): BlockFilter | null {
  const filter = parseBlockFilter(raw ?? undefined);
  return filter && rooms.some((room) => inBlock(room, filter)) ? filter : null;
}

export function inNarrowing(
  room: Pick<NarrowableRoom, "building" | "admits">,
  narrowing: Narrowing,
): boolean {
  return (
    inBlock(room, narrowing.block) &&
    (narrowing.admits === null ||
      (room.admits ?? "anyone") === narrowing.admits)
  );
}

/** The places a room offers: its beds, or itself when it is let whole. */
function placesOf(room: NarrowableRoom): readonly { unitId: string }[] {
  return room.beds.length > 0 ? room.beds : [room];
}

/** How many of the rooms' places inside the narrowing are free tonight. */
export function freeIn(
  rooms: readonly NarrowableRoom[],
  free: ReadonlySet<string>,
  narrowing: Narrowing,
): number {
  return rooms
    .filter((room) => inNarrowing(room, narrowing))
    .reduce(
      (sum, room) =>
        sum + placesOf(room).filter((place) => free.has(place.unitId)).length,
      0,
    );
}

/**
 * What the shared notice says of a narrowing, so Rooms and the room calendar
 * give back the one sentence, built by `ListFilterNotice` (TD-S5-01). The count
 * is the rooms left when only a block is chosen and the empty beds otherwise,
 * the figure the chips and Today's card carry.
 */
export function noticeFor(
  narrowing: Narrowing,
  counts: { rooms: number; free: number },
  otherRooms: string,
): {
  filter: ListFilterKey;
  count: number;
  block?: string;
  admits?: AdmitsFilter;
} | null {
  const { admits, block } = narrowing;
  if (!isNarrowed(narrowing)) return null;
  const name = block === null ? undefined : (block.block ?? otherRooms);
  if (admits === null) {
    return {
      filter: "filterBlock",
      count: counts.rooms,
      ...(name === undefined ? {} : { block: name }),
    };
  }
  if (name === undefined) {
    return { filter: FREE_FILTER_KEY[admits], count: counts.free, admits };
  }
  return {
    filter: "filterFreeInBlock",
    count: counts.free,
    block: name,
    admits,
  };
}
