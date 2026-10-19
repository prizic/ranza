import type { HousekeepingBoard, HousekeepingRoom } from "@ranza/housekeeping";
import type { Arrival, Departure } from "@ranza/reservations";
import { isToCome, leavesTonight } from "../features/today/views";
import { cleanFirst, roomNameOf } from "./today-derive";

/**
 * What the day asks of a room on the Housekeeping board (HK-04).
 *
 * The first three are Today's own clean-first priorities (TD-S1-21), taken from
 * the same call so the board and Today can never disagree about which room
 * comes first. `arriving` and `leaving` are the same movements on a room that
 * needs no cleaning: a ready room a Guest arrives into, or an occupied one
 * somebody leaves.
 */
export type RoomDay =
  "arrival" | "inspect_for_arrival" | "leaving" | "arriving";

export interface BoardByUrgency {
  /** The rooms, most urgent first, then the rest in the board's own order. */
  rooms: HousekeepingRoom[];
  days: Readonly<Record<string, RoomDay>>;
}

export function boardByUrgency(
  board: HousekeepingBoard,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): BoardByUrgency {
  const queue = cleanFirst(board, arrivals, departures);
  const arrivingInto = new Set(
    arrivals.filter(isToCome).map((arrival) => roomNameOf(arrival)),
  );
  const leaving = new Set(
    departures.filter(leavesTonight).map((departure) => roomNameOf(departure)),
  );

  const days: Record<string, RoomDay> = {};
  for (const row of queue) {
    if (row.priority !== "queue") days[row.unitId] = row.priority;
  }
  for (const room of board.rooms) {
    if (room.outOfService || days[room.unitId]) continue;
    if (arrivingInto.has(room.name)) days[room.unitId] = "arriving";
    else if (leaving.has(room.name)) days[room.unitId] = "leaving";
  }

  const byId = new Map(board.rooms.map((room) => [room.unitId, room]));
  const queued = queue.flatMap((row) => byId.get(row.unitId) ?? []);
  const queuedIds = new Set(queued.map((room) => room.unitId));
  const rest = board.rooms.filter((room) => !queuedIds.has(room.unitId));
  const movements = rest.filter((room) => days[room.unitId]);
  const others = rest.filter((room) => !days[room.unitId]);
  return { rooms: [...queued, ...movements, ...others], days };
}
