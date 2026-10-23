import type {
  ArrivalRow,
  DeskCard,
  DeskRoom,
  DepartureRow,
  OccupancyCard,
  RoomState,
} from "../../../server/today-derive";

/**
 * The ways the desk may have Today drawn (docs/features/today-layouts).
 *
 * `overview` is the page as it was: a grid of cards, and the only one a role
 * without a front desk ever sees. The other four are the desk's own, drawn
 * from `summary.desk`, and differ in what they lead with.
 */
export const TODAY_LAYOUTS = [
  "timeline",
  "house",
  "next-up",
  "night",
  "overview",
] as const;
export type TodayLayout = (typeof TODAY_LAYOUTS)[number];

export const DEFAULT_LAYOUT: TodayLayout = "timeline";

/** One cookie per Staff Member, so a shared desk PC keeps each person's own. */
export function layoutCookieName(userId: string): string {
  return `ranza-today-layout-${userId}`;
}

/** Anything not a layout, a stale value or a hand-edited cookie, is the default. */
export function parseLayout(value: string | undefined): TodayLayout {
  return TODAY_LAYOUTS.find((layout) => layout === value) ?? DEFAULT_LAYOUT;
}

/** `HH:MM` as minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

/** Minutes since midnight on the Property's own clock, at an instant. */
export function minutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(instant);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

/** The name a room is found by: the room a bed is in, else the unit itself. */
export function roomNameOf(unit: {
  unitName: string;
  roomName: string | null;
}): string {
  return unit.roomName ?? unit.unitName;
}

export function roomsByName(
  rooms: readonly DeskRoom[],
): ReadonlyMap<string, DeskRoom> {
  return new Map(rooms.map((room) => [room.name, room]));
}

/** What stands between an arrival and the key: the room, or the booking. */
export type Readiness = RoomState | "blocked";

export function readinessOf(
  arrival: ArrivalRow,
  rooms: ReadonlyMap<string, DeskRoom>,
): Readiness {
  if (arrival.state === "blocked") return "blocked";
  return rooms.get(roomNameOf(arrival.unit))?.state ?? "ready";
}

/** An arrival whose room cannot take them yet. */
export function isAtRisk(readiness: Readiness): boolean {
  return (
    readiness === "awaiting_inspection" ||
    readiness === "dirty" ||
    readiness === "blocked"
  );
}

export function isToCome(arrival: ArrivalRow): boolean {
  return arrival.state !== "checked_in";
}

export type ActionKind =
  "overdue_departure" | "late_arrival" | "room_at_risk" | "no_time";

export interface DeskAction {
  kind: ActionKind;
  /** `late` is a guest waiting or a bill unpaid; `risk` is one about to be. */
  severity: "late" | "risk" | "info";
  arrival?: ArrivalRow;
  departure?: DepartureRow;
  /** How long ago it was due, or how long until it is, in minutes. */
  minutes: number | null;
}

const KIND_ORDER: Record<ActionKind, number> = {
  overdue_departure: 0,
  late_arrival: 1,
  room_at_risk: 2,
  no_time: 3,
};

/**
 * Within a kind: the guest who has waited longest first for a late arrival,
 * the one arriving soonest first for a room at risk, and the rest as read.
 */
function withinKind(a: DeskAction, b: DeskAction): number {
  if (a.kind === "late_arrival") return (b.minutes ?? 0) - (a.minutes ?? 0);
  if (a.kind === "room_at_risk") {
    return (a.minutes ?? Infinity) - (b.minutes ?? Infinity);
  }
  return 0;
}

/**
 * What the desk should do, most urgent first: a guest overdue to leave, then
 * one late to arrive (longest waiting first), then an arrival whose room is not
 * ready (soonest first), then an arrival nobody can place in time.
 */
export function actionsFor(desk: DeskCard, nowMinutes: number): DeskAction[] {
  const rooms = roomsByName(desk.rooms);
  const actions: DeskAction[] = [];

  for (const departure of desk.departures) {
    if (departure.overdue) {
      actions.push({
        kind: "overdue_departure",
        severity: "late",
        departure,
        minutes: null,
      });
    }
  }
  for (const arrival of desk.arrivals.filter(isToCome)) {
    const expected =
      arrival.expectedArrival === null
        ? null
        : toMinutes(arrival.expectedArrival);
    if (arrival.expectedArrivalPassed && expected !== null) {
      actions.push({
        kind: "late_arrival",
        severity: "late",
        arrival,
        minutes: nowMinutes - expected,
      });
    } else if (isAtRisk(readinessOf(arrival, rooms))) {
      actions.push({
        kind: "room_at_risk",
        severity: "risk",
        arrival,
        minutes: expected === null ? null : expected - nowMinutes,
      });
    } else if (expected === null) {
      actions.push({
        kind: "no_time",
        severity: "info",
        arrival,
        minutes: null,
      });
    }
  }

  return actions.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || withinKind(a, b),
  );
}

export interface HouseFlow {
  /** In house when the business day began. */
  startOfDay: number;
  left: number;
  arrived: number;
  stillLeaving: number;
  stillArriving: number;
  /** Where the day ends if everybody expected comes and everybody due goes. */
  tonight: number;
  sellable: number;
}

/**
 * How the house moved today, from the same counts the occupancy card uses, so
 * the two cannot disagree (TODAY-01). `tonight` is the sum, not clamped: a
 * house booked past its rooms should say so rather than hide it.
 */
export function houseFlow(desk: DeskCard, occupancy: OccupancyCard): HouseFlow {
  const arrived = desk.arrivals.filter((a) => !isToCome(a)).length;
  const stillArriving = desk.arrivals.length - arrived;
  const stillLeaving = desk.departures.length;
  return {
    startOfDay: occupancy.inHouse + desk.departed - arrived,
    left: desk.departed,
    arrived,
    stillLeaving,
    stillArriving,
    tonight: occupancy.inHouse - stillLeaving + stillArriving,
    sellable: occupancy.sellable,
  };
}

/**
 * What the guests due out owe in all, or null when the viewer may not see
 * balances (TD-S2-04): a total of nothing must not read as "nobody owes".
 */
export function owedByDepartures(
  departures: readonly DepartureRow[],
): number | null {
  const balances = departures.flatMap((d) =>
    d.balance ? [d.balance.amountMinor] : [],
  );
  if (balances.length === 0) return null;
  return balances.reduce((sum, amount) => sum + Math.max(0, amount), 0);
}

export function countsByState(
  rooms: readonly DeskRoom[],
): Record<RoomState, number> {
  const counts: Record<RoomState, number> = {
    in_house: 0,
    ready: 0,
    awaiting_inspection: 0,
    dirty: 0,
    out_of_service: 0,
  };
  for (const room of rooms) counts[room.state] += 1;
  return counts;
}

export interface Floor {
  floor: number | null;
  rooms: DeskRoom[];
}

/** Top floor first, as a building reads; rooms with no floor last. */
export function floorsOf(rooms: readonly DeskRoom[]): Floor[] {
  const byFloor = new Map<number | null, DeskRoom[]>();
  for (const room of rooms) {
    byFloor.set(room.floor, [...(byFloor.get(room.floor) ?? []), room]);
  }
  return [...byFloor.entries()]
    .map(([floor, inFloor]) => ({ floor, rooms: inFloor }))
    .sort((a, b) =>
      a.floor === null ? 1 : b.floor === null ? -1 : b.floor - a.floor,
    );
}

/**
 * Empty rooms of the same type that could take the arrival instead: ready, not
 * the room it is booked into, and not booked for another arrival today.
 */
export function alternativesFor(
  arrival: ArrivalRow,
  desk: DeskCard,
): DeskRoom[] {
  const booked = new Set(
    desk.arrivals.filter(isToCome).map((a) => roomNameOf(a.unit)),
  );
  const own = desk.rooms.find((r) => r.name === roomNameOf(arrival.unit));
  return desk.rooms.filter(
    (room) =>
      room.state === "ready" &&
      room.unitType === own?.unitType &&
      !booked.has(room.name),
  );
}
