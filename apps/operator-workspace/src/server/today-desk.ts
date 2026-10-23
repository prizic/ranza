import type { DaysWaiting } from "@ranza/business-day";
import type { HousekeepingBoard } from "@ranza/housekeeping";
import type { Departure } from "@ranza/reservations";
import type { ArrivalRow, DepartureRow, Read, Section } from "./today-derive";

/**
 * What the desk layouts of Today are drawn from (docs/features/today-layouts).
 *
 * Today's cards each carry the first few rows of a list, which is right for a
 * card and wrong for a timeline or a map: those need every arrival, every
 * room, and who is in it. This is that fuller answer, derived from reads Today
 * already makes, plus the one it did not (who is in house).
 *
 * Pure, like `today-derive.ts`: no reads, no clock, no session. Rows arrive
 * already shaped for the viewer, so a field the viewer may not see (a balance,
 * a Guest's name) is absent here for the same reason it is absent there.
 */

/**
 * What a room is, for the one question the desk asks of it: can I put a Guest
 * in it. A room with somebody in it is `in_house` whatever housekeeping says,
 * so "ready" never counts a room that is occupied.
 */
export type RoomState =
  "in_house" | "ready" | "awaiting_inspection" | "dirty" | "out_of_service";

export interface DeskRoom {
  unitId: string;
  name: string;
  unitType: string;
  floor: number | null;
  state: RoomState;
  /** The Guest in the room; null for an empty one. */
  guestName: string | null;
  /** When the Guest in it is due to leave, as `YYYY-MM-DD`; null for an empty room. */
  endsOn: string | null;
}

/** Days past their cutoff and not yet closed (ADR 0034); the oldest comes first. */
export interface UnclosedDays {
  waiting: number;
  oldest: string | null;
}

export interface DeskCard {
  /** Every arrival on the day, checked in or not, in the order they were read. */
  arrivals: readonly ArrivalRow[];
  /** Everyone still here who is due to leave or past it, overdue first. */
  departures: readonly DepartureRow[];
  /** How many have already gone today. Their rows are not kept. */
  departed: number;
  /** Every room at the Property, by building, floor and name. */
  rooms: readonly DeskRoom[];
  unclosed?: Section<UnclosedDays>;
}

export interface DeskInput {
  arrivals: readonly ArrivalRow[];
  departures: readonly DepartureRow[];
  departed: number;
  board: HousekeepingBoard;
  inHouse: readonly Departure[];
  daysWaiting: Read<DaysWaiting | null> | undefined;
}

function roomNameOf(row: { unitName: string; roomName: string | null }) {
  return row.roomName ?? row.unitName;
}

export function roomState(room: HousekeepingBoard["rooms"][number]): RoomState {
  if (room.outOfService) return "out_of_service";
  if (room.inHouse) return "in_house";
  if (room.ready) return "ready";
  return room.status === "dirty" ? "dirty" : "awaiting_inspection";
}

function unclosedFrom(read: Read<DaysWaiting | null> | undefined) {
  if (read === undefined) return undefined;
  if (!read.ok) return { status: "unavailable" } as const;
  // Null is nothing waiting, or a Property the viewer cannot close days at:
  // no section, not zero.
  if (read.value === null) return undefined;
  return {
    status: "ok",
    data: {
      waiting: read.value.count,
      oldest: read.value.oldest,
    },
  } as const;
}

export function deskFrom(input: DeskInput): DeskCard {
  const stays = new Map<string, Departure>();
  for (const stay of input.inHouse) stays.set(roomNameOf(stay), stay);

  const rooms = input.board.rooms.map((room): DeskRoom => {
    const stay = room.inHouse ? stays.get(room.name) : undefined;
    return {
      unitId: room.unitId,
      name: room.name,
      unitType: room.unitType,
      floor: room.floor,
      state: roomState(room),
      guestName: stay?.guestName ?? null,
      endsOn: stay?.endsOn ?? null,
    };
  });

  const unclosed = unclosedFrom(input.daysWaiting);
  return {
    arrivals: input.arrivals,
    departures: [...input.departures].sort(
      (a, b) => Number(b.overdue) - Number(a.overdue),
    ),
    departed: input.departed,
    rooms,
    ...(unclosed ? { unclosed } : {}),
  };
}
