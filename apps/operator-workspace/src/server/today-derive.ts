import type { AuditPage, WorkingDay } from "@ranza/core";
import type { ChargesPosted, FolioSummary } from "@ranza/folios";
import type {
  HousekeepingBoard,
  HousekeepingRoom,
  HousekeepingStatus,
} from "@ranza/housekeeping";
import type { TodayMaintenance } from "@ranza/maintenance";
import type {
  Arrival,
  CheckInBlocker,
  Departure,
  ReservationStayType,
  RoomCalendar,
} from "@ranza/reservations";
import type { UnitCounts, UnitMap } from "@ranza/accommodation";
import { displayName } from "./display-name";
import {
  availableUnits,
  expectedTonight,
  holdsTonight,
  inRoomFilter,
  isOwing,
  isToCome,
  leavesTonight,
  overdueDays,
  totals,
  type Money,
  type RoomFilter,
} from "../features/today/views";

export { totals };
export type { Money };

/**
 * The Today dashboard, derived. Pure: no reads, no clock, no session.
 *
 * Everything the page shows is decided here, on the server, and the browser
 * receives only the result. That is what makes "no money without the
 * permission" true rather than hidden (TD-S1-03): the rows these figures come
 * from carry balances for anybody who reaches the Property, so every row sent
 * on is built field by field, never spread.
 *
 * Type-only imports from the modules, as `undo-outcome.ts` has: this file sits
 * inside the funnel so it may name them, and nothing here runs a query.
 */

/** Whose day the page leads with (TD-S1-01, TD-S1-02). */
export type TodayFocus =
  "manager" | "front_desk" | "housekeeping" | "finance" | "none";

/**
 * A section the viewer may see: answered, or unavailable because its read
 * failed. `stale` is set only in the browser, on a card showing its last good
 * copy after a later read of it failed (TD-S1-25).
 */
export type Section<T> =
  { status: "ok"; data: T; stale?: boolean } | { status: "unavailable" };

export interface UnitLabel {
  unitName: string;
  /** The room a bed is in; null for a room. */
  roomName: string | null;
}

export type ArrivalState = "checked_in" | "ready" | "not_ready" | "blocked";

export interface ArrivalRow {
  reservationId: string;
  reference: string;
  /** Null for a viewer whose work is the room rather than the Guest. */
  guestName: string | null;
  stayType: ReservationStayType;
  unit: UnitLabel;
  startsOn: string;
  endsOn: string | null;
  state: ArrivalState;
  blocker: CheckInBlocker | null;
  /**
   * Whether the viewer may check this Guest in from the row (TD-S2-01,
   * TD-S2-04): the command would succeed, and they hold front_desk.check_in.
   * The command checks again; this only decides whether to offer it.
   */
  mayCheckIn: boolean;
}

export interface DepartureRow {
  stayId: string;
  reference: string | null;
  guestName: string;
  unit: UnitLabel;
  endsOn: string | null;
  overdue: boolean;
  /** Whole days past the planned departure, on the Property's clock; 0 when not overdue. */
  overdueDays: number;
  /** Whether the viewer holds front_desk.check_out (TD-S2-02, TD-S2-04). */
  mayCheckOut: boolean;
  /** Present only for a viewer holding finance.manage_folio. */
  balance?: Money;
  folioId?: string;
}

export interface ArrivalsCard {
  expected: number;
  checkedIn: number;
  /** Still to come, whose room the arrivals list calls ready. */
  ready: number;
  /** Still to come, whose room the arrivals list calls not ready. */
  notReady: number;
  rows: readonly ArrivalRow[];
}

export interface DeparturesCard {
  /** Due on the business date: gone today plus still here. Overdue apart. */
  due: number;
  departed: number;
  overdue: number;
  /** How long the longest-overdue Guest has been past their date; 0 with none. */
  longestOverdueDays: number;
  rows: readonly DepartureRow[];
}

export interface OccupancyCard {
  sellable: number;
  /** Sellable, less those blocked or out of service: what tonight is counted of. */
  available: number;
  inHouse: number;
  /**
   * Rooms held tonight, of `available`: in house, less the Guests who leave
   * today (an overdue Guest does not), plus the arrivals that hold a room.
   */
  expectedTonight: number;
}

export type CleanPriority =
  "arrival" | "inspect_for_arrival" | "leaving" | "queue";

export interface CleanRow {
  unitId: string;
  name: string;
  floor: number | null;
  priority: CleanPriority;
  /** What the board says the room is, which decides the next mark. */
  status: HousekeepingStatus;
  /** Somebody is in it: it is marked once they have gone (TD-S2-03). */
  inHouse: boolean;
  /** When the room last changed status, as an ISO instant. */
  since: string | null;
}

export interface FloorReadiness {
  floor: number | null;
  ready: number;
  total: number;
}

export interface RoomsCard {
  total: number;
  ready: number;
  awaitingInspection: number;
  dirty: number;
  outOfService: number;
  floors: readonly FloorReadiness[];
  /** Rooms an arrival today is waiting on: in service and not yet ready. */
  arrivalsWaiting: number;
  cleanFirst: readonly CleanRow[];
  cleanFirstTotal: number;
  /** Whether the viewer holds housekeeping.update_status (TD-S2-03, TD-S2-04). */
  mayMark: boolean;
}

/** Who leaves owing — present only where departures were read. */
export interface LeavingOwing {
  owed: readonly Money[];
  owing: number;
  overdueOwing: number;
  overdueBalance: readonly Money[];
  rows: readonly DepartureRow[];
}

export interface MoneyCard {
  openFolios: number;
  openBalance: readonly Money[];
  largest: readonly {
    folioId: string;
    guestName: string;
    unitName: string;
    balance: Money;
  }[];
  /**
   * Absent at a Property with no front desk: nobody is due to leave anywhere
   * the dashboard can see, which is not the same as nobody owing (TD-S1-04).
   */
  leaving?: LeavingOwing;
}

export interface MaintenanceCard {
  /** New, in progress and waiting for parts together. */
  open: number;
  new: number;
  inProgress: number;
  waitingForParts: number;
  /** Rooms and beds held out of order, each counted once. */
  outOfOrder: number;
}

/** One of the newest audit records the viewer may read (TD-S3-01). */
export interface ActivityRow {
  recordId: string;
  action: string;
  subjectType: string;
  actorId: string;
  /**
   * The person as a colleague would say it: the log's name for them, less the
   * domain of an address, as the greeting does. Null when the log has none.
   */
  actor: string | null;
  /** What the record is about, named as the log names it: a Guest and room, a person. */
  subject: string | null;
  /** When it happened, as an ISO instant. */
  at: string;
  /** The clock the time is read on: its own Property's. */
  timeZone: string;
  propertyName: string | null;
}

export interface ActivityCard {
  rows: readonly ActivityRow[];
}

/** Charges less reversals posted on the business date, per currency (TD-S3-02). */
export interface ChargesCard {
  net: readonly Money[];
}

/** One night of booked occupancy: Units a booking or Stay holds, of those in use. */
export interface BookedNight {
  day: string;
  booked: number;
  inUse: number;
}

/** The nights ahead, bookings and Stays alone, never a forecast (TD-S3-04). */
export interface BookedAheadCard {
  nights: readonly BookedNight[];
}

export type AttentionKind =
  | "not_ready"
  | "blocked"
  | "urgent_repair"
  | "overdue"
  | "balance"
  | "overdue_return"
  | "out_of_service";

/** The maintenance request an item concerns: only for a maintenance viewer. */
export interface AttentionRequest {
  number: number;
  title: string;
  /** What an urgent request is about when it names no room. */
  equipmentName: string | null;
}

/**
 * Why an arrival's room is not ready, as far as the housekeeping board says:
 * not cleaned yet, cleaned and waiting for somebody to inspect it, or still
 * holding the Guest who is in it. Null when the board was not read.
 */
export type NotReadyReason = "dirty" | "awaiting_inspection" | "occupied";

export interface AttentionItem {
  kind: AttentionKind;
  /** Null only for an urgent repair to equipment that is in no room. */
  unit: UnitLabel | null;
  guestName: string | null;
  /** The reservation or Stay the item opens at, when there is one. */
  reference: string | null;
  blocker: CheckInBlocker | null;
  /**
   * When the Guest was due to leave, for an overdue departure; when the room
   * was due back, for a hold past its return.
   */
  dueOn: string | null;
  /** Whole days an overdue Guest is past their date, on the Property's clock. */
  overdueDays?: number;
  /** For a room that is not ready: why, when the board says. */
  notReady?: NotReadyReason;
  balance?: Money;
  folioId?: string;
  request?: AttentionRequest;
}

export interface TodaySummary {
  day: {
    propertyId: string;
    propertyName: string;
    timezone: string;
    /** The Property's currency, for a total of nothing. */
    currency: string;
    businessDate: string;
    calendarDate: string;
    cutoff: string;
  };
  focus: TodayFocus;
  /** Whether "New booking" is offered: front_desk.book, where there is a front desk. */
  mayBook: boolean;
  /** Absent means the viewer may not see it here; never shown as zero. */
  arrivals?: Section<ArrivalsCard>;
  departures?: Section<DeparturesCard>;
  occupancy?: Section<OccupancyCard>;
  rooms?: Section<RoomsCard>;
  money?: Section<MoneyCard>;
  maintenance?: Section<MaintenanceCard>;
  activity?: Section<ActivityCard>;
  charges?: Section<ChargesCard>;
  booked?: Section<BookedAheadCard>;
  attention: {
    items: readonly AttentionItem[];
    /** False when a section it draws on could not be read. */
    complete: boolean;
  };
}

/** What the viewer may do at the Property, from their permission keys. */
export interface Grants {
  frontDesk: boolean;
  housekeeping: boolean;
  finance: boolean;
  manager: boolean;
  /** finance.manage_folio: the only grant that lets a balance through. */
  money: boolean;
  /**
   * maintenance.report or maintenance.manage. Taking a room out of order
   * alone is not reading maintenance.
   */
  maintenance: boolean;
  /** audit.read: the log, and so the newest of it on Today (TD-S3-01). */
  audit: boolean;
}

export function grantsFor(permissions: readonly string[]): Grants {
  const has = (key: string) => permissions.includes(key);
  return {
    frontDesk: has("front_desk.check_in") || has("front_desk.check_out"),
    housekeeping: has("housekeeping.update_status"),
    finance:
      has("finance.manage_folio") ||
      has("finance.post_charge") ||
      has("finance.reverse_charge"),
    manager: has("staff.administer") || has("audit.read"),
    money: has("finance.manage_folio"),
    maintenance: has("maintenance.report") || has("maintenance.manage"),
    audit: has("audit.read"),
  };
}

/**
 * The lead focus. A manager sees the whole day; otherwise the first held of
 * front desk, housekeeping and finance. The name of the role plays no part,
 * so a role the Organization composed leads exactly as a shipped one.
 */
export function focusFor(grants: Grants): TodayFocus {
  if (grants.manager) return "manager";
  if (grants.frontDesk) return "front_desk";
  if (grants.housekeeping) return "housekeeping";
  if (grants.finance) return "finance";
  return "none";
}

/** Which reads the page needs, given the focus and what the Property has. */
export interface Needs {
  arrivals: boolean;
  /** Only the departures card counts who has already gone. */
  departed: boolean;
  departures: boolean;
  /**
   * The unit map: occupancy for the desk, and which rooms and beds are out of
   * service for anybody the rooms concern. The housekeeping board cannot say
   * which — it marks a room out only when every bed is, and a blocked room
   * the same way.
   */
  units: boolean;
  rooms: boolean;
  folios: boolean;
  maintenance: boolean;
  /** The newest audit records, for audit.read (TD-S3-01). */
  activity: boolean;
  /** Charges less reversals today, for the money figures' own focuses (TD-S3-02). */
  charges: boolean;
  /** Booked occupancy ahead, from the room calendar (TD-S3-04). */
  calendar: boolean;
}

export interface Capabilities {
  frontDesk: boolean;
  housekeeping: boolean;
  billing: boolean;
  maintenance: boolean;
}

export function needsFor(grants: Grants, capabilities: Capabilities): Needs {
  const focus = focusFor(grants);
  const desk = focus === "manager" || focus === "front_desk";
  const money = grants.money && capabilities.billing;
  return {
    arrivals: capabilities.frontDesk && (desk || focus === "housekeeping"),
    departures:
      capabilities.frontDesk &&
      (desk || focus === "housekeeping" || (focus === "finance" && money)),
    departed: capabilities.frontDesk && desk,
    units: capabilities.frontDesk && (desk || focus === "housekeeping"),
    rooms: capabilities.housekeeping && (desk || focus === "housekeeping"),
    folios: focus === "finance" && money,
    // A role holding only maintenance permissions leads nowhere (TD-DEF-08),
    // so nothing is read for it.
    maintenance:
      capabilities.maintenance && grants.maintenance && focus !== "none",
    activity: focus === "manager" && grants.audit,
    // The money figures stay the finance focus's own (TD-S1-02); a manager
    // holds them too, so charges today sit with them and not on a front desk
    // that merely holds finance.manage_folio.
    charges: money && (focus === "manager" || focus === "finance"),
    calendar: capabilities.frontDesk && focus === "manager",
  };
}

/** What the reads answered: a value, a failure, or not asked for. */
export type Read<T> = { ok: true; value: T } | { ok: false } | undefined;

export interface TodayInput {
  day: WorkingDay;
  capabilities: Capabilities;
  arrivals?: Read<readonly Arrival[]>;
  departures?: Read<readonly Departure[]>;
  departedToday?: Read<number>;
  units?: Read<UnitMap>;
  board?: Read<HousekeepingBoard>;
  folios?: Read<readonly FolioSummary[]>;
  maintenance?: Read<TodayMaintenance>;
  activity?: Read<AuditPage>;
  charges?: Read<readonly ChargesPosted[]>;
  calendar?: Read<RoomCalendar>;
}

/** Rows the clean-first queue and the movements list show, at most. */
export const LIST_LIMIT = 6;

function unitOf(row: { unitName: string; roomName: string | null }): UnitLabel {
  return { unitName: row.unitName, roomName: row.roomName };
}

/** The room a Unit is, or is a bed in: what the board lists. */
function roomNameOf(row: { unitName: string; roomName: string | null }) {
  return row.roomName ?? row.unitName;
}

function arrivalState(arrival: Arrival): ArrivalState {
  if (arrival.status === "checked_in") return "checked_in";
  if (arrival.checkInBlocker) return "blocked";
  return arrival.unitIsReady ? "ready" : "not_ready";
}

function departureRow(
  departure: Departure,
  money: boolean,
  businessDate: string,
): DepartureRow {
  return {
    stayId: departure.stayId,
    reference: departure.reference,
    guestName: departure.guestName,
    unit: unitOf(departure),
    endsOn: departure.endsOn,
    overdue: departure.overdue,
    overdueDays: departure.overdue
      ? overdueDays(departure.endsOn, businessDate)
      : 0,
    mayCheckOut: departure.mayCheckOut,
    ...(money
      ? {
          balance: {
            amountMinor: departure.balanceMinor,
            currency: departure.currency,
          },
          ...(departure.folioId ? { folioId: departure.folioId } : {}),
        }
      : {}),
  };
}

function section<T, R>(
  read: Read<T> | undefined,
  derive: (value: T) => R,
): Section<R> | undefined {
  if (read === undefined) return undefined;
  return read.ok
    ? { status: "ok", data: derive(read.value) }
    : { status: "unavailable" };
}

export function occupancyFrom(
  counts: UnitCounts,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): OccupancyCard {
  return {
    sellable: counts.sellable,
    available: availableUnits(counts),
    inHouse: counts.inHouse,
    expectedTonight: expectedTonight(
      counts,
      arrivals.filter(holdsTonight).length,
      departures.filter(leavesTonight).length,
    ),
  };
}

const PRIORITY_ORDER: Record<CleanPriority, number> = {
  arrival: 0,
  inspect_for_arrival: 1,
  leaving: 2,
  queue: 3,
};

/**
 * Rooms ordered by who needs them (TD-S1-21): a dirty room somebody arrives
 * into today, then a cleaned room still to be inspected for an arrival, then a
 * room a Guest leaves today, then the rest, longest dirty first.
 */
export function cleanFirst(
  board: HousekeepingBoard,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): CleanRow[] {
  const arrivingInto = new Set(
    arrivals.filter(isToCome).map((arrival) => roomNameOf(arrival)),
  );
  const leaving = new Set(
    departures
      .filter((departure) => !departure.overdue)
      .map((departure) => roomNameOf(departure)),
  );

  const rows: CleanRow[] = [];
  for (const room of board.rooms) {
    if (room.outOfService || room.ready) continue;
    const arriving = arrivingInto.has(room.name);
    let priority: CleanPriority | null = null;
    if (room.inHouse) {
      priority = leaving.has(room.name) ? "leaving" : null;
    } else if (room.status === "dirty") {
      priority = arriving ? "arrival" : "queue";
    } else if (arriving) {
      priority = "inspect_for_arrival";
    }
    if (priority === null) continue;
    rows.push({
      unitId: room.unitId,
      name: room.name,
      floor: room.floor,
      priority,
      status: room.status,
      inHouse: room.inHouse,
      since: room.changedAt,
    });
  }
  return rows.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.since ?? "").localeCompare(b.since ?? "") ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The rooms a figure on Today counts, in the order the board lists them. The
 * board opens narrowed to exactly these (TD-S5-01), and `roomsFrom` counts
 * with the same call, so a count and the rows it opens are one definition.
 */
export function roomsInFilter(
  filter: RoomFilter,
  board: HousekeepingBoard,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): HousekeepingRoom[] {
  if (filter === "clean_first") {
    const byId = new Map(board.rooms.map((room) => [room.unitId, room]));
    return cleanFirst(board, arrivals, departures).flatMap((row) => {
      const room = byId.get(row.unitId);
      return room ? [room] : [];
    });
  }
  if (filter === "for_arrival") {
    const arrivingInto = new Set(
      arrivals.filter(isToCome).map((arrival) => roomNameOf(arrival)),
    );
    return board.rooms.filter(
      (room) =>
        !room.outOfService && !room.ready && arrivingInto.has(room.name),
    );
  }
  return board.rooms.filter((room) => inRoomFilter(filter, room));
}

export function roomsFrom(
  board: HousekeepingBoard,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): RoomsCard {
  const floors = new Map<number | null, FloorReadiness>();
  for (const room of board.rooms) {
    const floor = floors.get(room.floor) ?? {
      floor: room.floor,
      ready: 0,
      total: 0,
    };
    floor.total += 1;
    if (inRoomFilter("ready", room)) floor.ready += 1;
    floors.set(room.floor, floor);
  }
  const count = (filter: RoomFilter) =>
    roomsInFilter(filter, board, arrivals, departures).length;
  const queue = cleanFirst(board, arrivals, departures);
  return {
    total: board.rooms.length,
    ready: count("ready"),
    awaitingInspection: count("awaiting_inspection"),
    dirty: count("dirty"),
    outOfService: count("out_of_service"),
    floors: [...floors.values()].sort(
      (a, b) => (a.floor ?? Infinity) - (b.floor ?? Infinity),
    ),
    arrivalsWaiting: count("for_arrival"),
    cleanFirst: queue.slice(0, LIST_LIMIT),
    cleanFirstTotal: queue.length,
    mayMark: board.mayMark,
  };
}

export function moneyFrom(
  departures: readonly Departure[] | null,
  folios: readonly FolioSummary[],
  businessDate: string,
): MoneyCard {
  const open = folios.filter((folio) => folio.status === "open");
  const balanceOf = (row: { balanceMinor: number; currency: string }) => ({
    amountMinor: row.balanceMinor,
    currency: row.currency,
  });
  const card: MoneyCard = {
    openFolios: open.length,
    openBalance: totals(open.map(balanceOf)),
    largest: open
      .filter((folio) => folio.balanceMinor > 0)
      .sort((a, b) => b.balanceMinor - a.balanceMinor)
      .slice(0, 5)
      .map((folio) => ({
        folioId: folio.folioId,
        guestName: folio.guestName,
        unitName: folio.unitName,
        balance: balanceOf(folio),
      })),
  };
  if (departures === null) return card;

  const owingRows = departures.filter(isOwing);
  const overdueRows = owingRows.filter((departure) => departure.overdue);
  card.leaving = {
    owed: totals(owingRows.map(balanceOf)),
    owing: owingRows.length,
    overdueOwing: overdueRows.length,
    overdueBalance: totals(overdueRows.map(balanceOf)),
    rows: [...owingRows]
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          b.balanceMinor - a.balanceMinor,
      )
      .slice(0, LIST_LIMIT)
      .map((row) => departureRow(row, true, businessDate)),
  };
  return card;
}

/** How many of the newest records Today shows (TD-S3-01). */
export const ACTIVITY_LIMIT = 5;

/**
 * How far back Today looks for them: from the start of yesterday. "Latest"
 * with no floor shows five records of any age, which on a quiet week is last
 * week's news presented as this morning's.
 */
export const ACTIVITY_WINDOW_DAYS = 1;

/** How many nights ahead the booked line covers (TD-S3-04). */
export const BOOKED_AHEAD_NIGHTS = 14;

/** A name from the log, with an address cut to the part before the @. */
function readable(label: string | undefined): string | null {
  if (label === undefined) return null;
  return label.includes("@") ? displayName(null, label) : label;
}

export function activityFrom(page: AuditPage): ActivityCard {
  return {
    rows: page.entries.slice(0, ACTIVITY_LIMIT).map((entry) => ({
      recordId: entry.id,
      action: entry.action,
      subjectType: entry.subjectType,
      actorId: entry.actorId,
      actor: readable(page.labels[entry.actorId]),
      subject: readable(page.labels[entry.subjectId]),
      at: entry.occurredAt.toISOString(),
      timeZone: entry.timeZone,
      propertyName: entry.propertyName,
    })),
  };
}

export function chargesFrom(posted: readonly ChargesPosted[]): ChargesCard {
  return {
    net: posted.map(({ currency, netMinor }) => ({
      amountMinor: netMinor,
      currency,
    })),
  };
}

export function bookedAheadFrom(calendar: RoomCalendar): BookedAheadCard {
  return {
    nights: calendar.nights.slice(0, BOOKED_AHEAD_NIGHTS).map((night) => ({
      day: night.day,
      booked: night.booked,
      inUse: night.booked + night.free,
    })),
  };
}

function notReadyReason(
  board: HousekeepingBoard | null,
  arrival: Arrival,
): NotReadyReason | null {
  const room = board?.rooms.find(
    (candidate) => candidate.name === roomNameOf(arrival),
  );
  if (!room) return null;
  if (room.inHouse) return "occupied";
  return room.status === "dirty" ? "dirty" : "awaiting_inspection";
}

const ATTENTION_ORDER: Record<AttentionKind, number> = {
  not_ready: 0,
  blocked: 1,
  urgent_repair: 2,
  overdue: 3,
  balance: 4,
  overdue_return: 5,
  out_of_service: 6,
};

type Hold = TodayMaintenance["holds"][number];

function requestOf(
  row: { number: number; title: string },
  equipmentName: string | null,
): AttentionRequest {
  return { number: row.number, title: row.title, equipmentName };
}

function heldUnitOf(unit: { name: string; roomName: string | null }) {
  return { unitName: unit.name, roomName: unit.roomName };
}

/**
 * Maintenance's own items (TD-S4-01, TD-S4-02), and what it says about the
 * Units the unit map shows out of service (TD-S4-03).
 *
 * An urgent request that holds its room absorbs that room's other hold items
 * and shows only its own due-back date, or none: while an urgent repair holds
 * the room it is not coming back anyway. An urgent request about a room it
 * does not hold is listed next to that room's own hold item. Otherwise a hold
 * past its return is the room's item, the earliest-due one when several hold
 * it, and failing that the plain out-of-service item names the
 * lowest-numbered request.
 */
function maintenanceAttention(
  maintenance: TodayMaintenance,
  businessDate: string,
) {
  const holdsByUnit = new Map<string, Hold[]>();
  for (const hold of maintenance.holds) {
    holdsByUnit.set(hold.unitId, [
      ...(holdsByUnit.get(hold.unitId) ?? []),
      hold,
    ]);
  }
  const overdueOf = (holds: readonly Hold[]) =>
    holds
      .filter(
        (hold): hold is Hold & { expectedBackOn: string } =>
          hold.expectedBackOn !== null && hold.expectedBackOn < businessDate,
      )
      .sort(
        (a, b) =>
          a.expectedBackOn.localeCompare(b.expectedBackOn) ||
          a.number - b.number,
      )[0] ?? null;

  const items: AttentionItem[] = [];
  const listed = new Set<string>();
  const base = { guestName: null, reference: null, blocker: null };

  for (const request of maintenance.urgent) {
    const roomHolds = request.unit
      ? holdsByUnit.get(request.unit.unitId)
      : undefined;
    const holds = roomHolds?.some(
      (hold) => hold.requestId === request.requestId,
    )
      ? roomHolds
      : undefined;
    if (request.unit && holds) listed.add(request.unit.unitId);
    items.push({
      ...base,
      kind: "urgent_repair",
      unit: request.unit ? heldUnitOf(request.unit) : null,
      // Its own date, not another request's: the room is listed once, but a
      // date shown under this request's number is this request's.
      dueOn: holds
        ? (overdueOf(
            holds.filter((hold) => hold.requestId === request.requestId),
          )?.expectedBackOn ?? null)
        : null,
      request: requestOf(request, request.equipment?.name ?? null),
    });
  }

  for (const [unitId, holds] of holdsByUnit) {
    if (listed.has(unitId)) continue;
    const overdue = overdueOf(holds);
    if (!overdue) continue;
    listed.add(unitId);
    items.push({
      ...base,
      kind: "overdue_return",
      unit: heldUnitOf(overdue.unit),
      dueOn: overdue.expectedBackOn,
      request: requestOf(overdue, null),
    });
  }

  /** The request a plain out-of-service item names, or null. */
  const namedFor = (unitId: string): AttentionRequest | null => {
    const holds = holdsByUnit.get(unitId);
    if (!holds) return null;
    const lowest = [...holds].sort((a, b) => a.number - b.number)[0];
    return lowest ? requestOf(lowest, null) : null;
  };

  return { items, listed, namedFor };
}

/**
 * What needs somebody, across everything the viewer's permissions touch
 * (TD-S1-13 to TD-S1-17), ordered by urgency. A departure both overdue and
 * owing is one item, not two.
 */
export function attentionFrom(
  grants: Grants,
  money: boolean,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
  units: UnitMap | null,
  board: HousekeepingBoard | null,
  maintenance: TodayMaintenance | null,
  businessDate: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const desk = grants.frontDesk || grants.manager;
  const rooms = desk || grants.housekeeping;
  const base = {
    guestName: null,
    reference: null,
    blocker: null,
    dueOn: null,
  };
  // The clean-first queue already says, with its own action, which rooms a
  // housekeeper has to turn round for an arrival; saying it twice is noise.
  const queued = new Set(
    !desk && board
      ? cleanFirst(board, arrivals, departures).map((row) => row.name)
      : [],
  );

  for (const arrival of arrivals) {
    if (arrival.status === "checked_in") continue;
    if (desk && arrival.checkInBlocker) {
      items.push({
        ...base,
        kind: "blocked",
        unit: unitOf(arrival),
        guestName: arrival.guestName,
        reference: arrival.reference,
        blocker: arrival.checkInBlocker,
      });
    } else if (
      rooms &&
      !arrival.unitIsReady &&
      !queued.has(roomNameOf(arrival))
    ) {
      const reason = notReadyReason(board, arrival);
      items.push({
        ...base,
        kind: "not_ready",
        unit: unitOf(arrival),
        guestName: desk ? arrival.guestName : null,
        reference: desk ? arrival.reference : null,
        ...(reason ? { notReady: reason } : {}),
      });
    }
  }

  for (const departure of departures) {
    const owing = money && isOwing(departure);
    const balance = owing
      ? {
          balance: {
            amountMinor: departure.balanceMinor,
            currency: departure.currency,
          },
          ...(departure.folioId ? { folioId: departure.folioId } : {}),
        }
      : {};
    if (departure.overdue && (desk || owing)) {
      items.push({
        ...base,
        kind: "overdue",
        unit: unitOf(departure),
        guestName: departure.guestName,
        reference: departure.reference,
        dueOn: departure.endsOn,
        overdueDays: overdueDays(departure.endsOn, businessDate),
        ...balance,
      });
    } else if (owing) {
      items.push({
        ...base,
        kind: "balance",
        unit: unitOf(departure),
        guestName: departure.guestName,
        reference: departure.reference,
        ...balance,
      });
    }
  }

  // Read only for a viewer holding a maintenance permission (needsFor), and
  // checked again here so a read handed in by mistake still names nothing.
  const repairs =
    grants.maintenance && maintenance
      ? maintenanceAttention(maintenance, businessDate)
      : null;
  if (repairs) items.push(...repairs.items);

  // A room or a single bed, and only out of service: a blocked unit is a
  // decision somebody made, with its reason on the Rooms screen, not a fault.
  // One maintenance already listed is not listed again (TD-S4-02).
  const outOfService = (unitId: string, unit: UnitLabel) => {
    if (repairs?.listed.has(unitId)) return;
    const request = repairs?.namedFor(unitId) ?? null;
    items.push({
      ...base,
      kind: "out_of_service",
      unit,
      ...(request ? { request } : {}),
    });
  };
  if (rooms && units) {
    for (const unit of units.units) {
      if (unit.status === "out_of_service") {
        outOfService(unit.unitId, { unitName: unit.name, roomName: null });
      }
      for (const bed of unit.beds) {
        if (bed.status !== "out_of_service") continue;
        outOfService(bed.unitId, { unitName: bed.name, roomName: unit.name });
      }
    }
  }

  return items.sort(
    (a, b) => ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind],
  );
}

function valueOf<T>(read: Read<T> | undefined, fallback: T): T {
  return read?.ok ? read.value : fallback;
}

function failed(read: Read<unknown> | undefined): boolean {
  return read !== undefined && !read.ok;
}

export function deriveToday(input: TodayInput): TodaySummary {
  const grants = grantsFor(input.day.permissions);
  const focus = focusFor(grants);
  const money = grants.money && input.capabilities.billing;
  const arrivals = valueOf(input.arrivals, []);
  const departures = valueOf(input.departures, []);
  const units = valueOf<UnitMap | null>(input.units, null);

  const departuresRead: Read<readonly Departure[]> | undefined =
    input.departures === undefined
      ? undefined
      : failed(input.departures) || failed(input.departedToday)
        ? { ok: false }
        : input.departures;

  const summary: TodaySummary = {
    day: {
      propertyId: input.day.propertyId,
      propertyName: input.day.propertyName,
      timezone: input.day.timezone,
      currency: input.day.currency,
      businessDate: input.day.businessDate,
      calendarDate: input.day.calendarDate,
      cutoff: input.day.cutoff,
    },
    focus,
    mayBook:
      input.day.permissions.includes("front_desk.book") &&
      input.capabilities.frontDesk,
    attention: {
      items: attentionFrom(
        grants,
        money,
        arrivals,
        departures,
        units,
        valueOf<HousekeepingBoard | null>(input.board, null),
        valueOf<TodayMaintenance | null>(input.maintenance, null),
        input.day.businessDate,
      ),
      // Only the reads attention is built from; how many have already gone
      // is not one of them.
      complete: ![
        input.arrivals,
        input.departures,
        input.units,
        input.maintenance,
      ].some(failed),
    },
  };

  const arrivalsCard = section(input.arrivals, (rows) => ({
    expected: rows.length,
    checkedIn: rows.filter((row) => row.status === "checked_in").length,
    ready: rows.filter((row) => arrivalState(row) === "ready").length,
    notReady: rows.filter((row) => arrivalState(row) === "not_ready").length,
    rows: rows
      .filter(isToCome)
      .slice(0, LIST_LIMIT)
      .map((row): ArrivalRow => ({
        reservationId: row.reservationId,
        reference: row.reference,
        guestName: focus === "housekeeping" ? null : row.guestName,
        stayType: row.stayType,
        unit: unitOf(row),
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        state: arrivalState(row),
        blocker: row.checkInBlocker,
        mayCheckIn: row.canCheckIn && row.mayCheckIn,
      })),
  }));
  if (arrivalsCard && focus !== "housekeeping" && focus !== "finance") {
    summary.arrivals = arrivalsCard;
  }

  const departed = valueOf(input.departedToday, 0);
  const departuresCard = section(departuresRead, (rows) => {
    const overdue = rows.filter((row) => row.overdue).length;
    return {
      due: departed + rows.length - overdue,
      departed,
      overdue,
      longestOverdueDays: Math.max(
        0,
        ...rows
          .filter((row) => row.overdue)
          .map((row) => overdueDays(row.endsOn, input.day.businessDate)),
      ),
      rows: rows
        .slice(0, LIST_LIMIT)
        .map((row) => departureRow(row, money, input.day.businessDate)),
    };
  });
  if (departuresCard && focus !== "housekeeping" && focus !== "finance") {
    summary.departures = departuresCard;
  }

  // A card built partly from another read fails with it: a failed arrivals
  // read is not "nobody is arriving", and a figure computed as if it were
  // would be a wrong number shown as a right one (TD-S1-24).
  const movementsFailed = failed(input.arrivals) || failed(input.departures);
  const dependent = <T>(read: Read<T> | undefined): Read<T> | undefined =>
    read === undefined ? undefined : movementsFailed ? { ok: false } : read;

  // Occupancy is the desk's figure; the unit map is also read for
  // housekeeping, for what is out of service, and gives no card there.
  if (focus === "manager" || focus === "front_desk") {
    const occupancy = section(dependent(input.units), (map) =>
      occupancyFrom(map.counts, arrivals, departures),
    );
    if (occupancy) summary.occupancy = occupancy;
  }

  const rooms = section(dependent(input.board), (value) =>
    roomsFrom(value, arrivals, departures),
  );
  if (rooms) summary.rooms = rooms;

  if (input.folios !== undefined) {
    summary.money =
      failed(input.folios) || failed(input.departures)
        ? { status: "unavailable" }
        : {
            status: "ok",
            data: moneyFrom(
              input.departures === undefined ? null : departures,
              valueOf(input.folios, []),
              input.day.businessDate,
            ),
          };
  }

  if (focus === "manager") {
    const maintenance = section(input.maintenance, (value) => ({
      open:
        value.open.new + value.open.in_progress + value.open.waiting_for_parts,
      new: value.open.new,
      inProgress: value.open.in_progress,
      waitingForParts: value.open.waiting_for_parts,
      outOfOrder: value.outOfOrder,
    }));
    if (maintenance) summary.maintenance = maintenance;
  }

  // Checked again here, as the maintenance items are: a read handed in by
  // mistake still names nothing for a viewer who may not have it.
  if (focus === "manager" && grants.audit) {
    const activity = section(input.activity, activityFrom);
    if (activity) summary.activity = activity;
  }
  if (money && (focus === "manager" || focus === "finance")) {
    const charges = section(input.charges, chargesFrom);
    if (charges) summary.charges = charges;
  }
  if (focus === "manager") {
    const booked = section(input.calendar, bookedAheadFrom);
    if (booked) summary.booked = booked;
  }

  return summary;
}
