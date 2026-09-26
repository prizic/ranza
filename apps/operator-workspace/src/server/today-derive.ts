import type { WorkingDay } from "@ranza/core";
import type { FolioSummary } from "@ranza/folios";
import type { HousekeepingBoard } from "@ranza/housekeeping";
import type { TodayMaintenance } from "@ranza/maintenance";
import type {
  Arrival,
  CheckInBlocker,
  Departure,
  ReservationStayType,
} from "@ranza/reservations";
import type { UnitCounts, UnitMap } from "@ranza/accommodation";

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

export interface Money {
  amountMinor: number;
  currency: string;
}

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
}

export interface DepartureRow {
  stayId: string;
  reference: string | null;
  guestName: string;
  unit: UnitLabel;
  endsOn: string | null;
  overdue: boolean;
  /** Present only for a viewer holding finance.manage_folio. */
  balance?: Money;
  folioId?: string;
}

export interface ArrivalsCard {
  expected: number;
  checkedIn: number;
  rows: readonly ArrivalRow[];
}

export interface DeparturesCard {
  /** Due on the business date: gone today plus still here. Overdue apart. */
  due: number;
  departed: number;
  overdue: number;
  rows: readonly DepartureRow[];
}

export interface OccupancyCard {
  sellable: number;
  inHouse: number;
  /** In house, less departures still due, plus arrivals still to come. */
  expectedTonight: number;
}

export type CleanPriority =
  "arrival" | "inspect_for_arrival" | "leaving" | "queue";

export interface CleanRow {
  unitId: string;
  name: string;
  floor: number | null;
  priority: CleanPriority;
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
  /** Rooms arrivals are waiting on, not yet ready. */
  arrivalsWaiting: number;
  cleanFirst: readonly CleanRow[];
  cleanFirstTotal: number;
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
}

export function grantsFor(permissions: readonly string[]): Grants {
  const has = (key: string) => permissions.includes(key);
  return {
    frontDesk: has("front_desk.check_in") || has("front_desk.check_out"),
    housekeeping: has("housekeeping.update_status"),
    finance: has("finance.manage_folio") || has("finance.post_charge"),
    manager: has("staff.administer") || has("audit.read"),
    money: has("finance.manage_folio"),
    maintenance: has("maintenance.report") || has("maintenance.manage"),
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

function departureRow(departure: Departure, money: boolean): DepartureRow {
  return {
    stayId: departure.stayId,
    reference: departure.reference,
    guestName: departure.guestName,
    unit: unitOf(departure),
    endsOn: departure.endsOn,
    overdue: departure.overdue,
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
  const toCome = arrivals.filter((a) => a.status !== "checked_in").length;
  const expected = counts.inHouse + toCome - departures.length;
  return {
    sellable: counts.sellable,
    inHouse: counts.inHouse,
    expectedTonight: Math.min(counts.sellable, Math.max(0, expected)),
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
    arrivals
      .filter((arrival) => arrival.status !== "checked_in")
      .map((arrival) => roomNameOf(arrival)),
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

export function roomsFrom(
  board: HousekeepingBoard,
  arrivals: readonly Arrival[],
  departures: readonly Departure[],
): RoomsCard {
  const inService = board.rooms.filter((room) => !room.outOfService);
  const floors = new Map<number | null, FloorReadiness>();
  for (const room of board.rooms) {
    const floor = floors.get(room.floor) ?? {
      floor: room.floor,
      ready: 0,
      total: 0,
    };
    floor.total += 1;
    if (room.ready && !room.outOfService) floor.ready += 1;
    floors.set(room.floor, floor);
  }
  const queue = cleanFirst(board, arrivals, departures);
  const notReadyFor = new Set(
    arrivals
      .filter(
        (arrival) => arrival.status !== "checked_in" && !arrival.unitIsReady,
      )
      .map((arrival) => arrival.reservationId),
  );
  return {
    total: board.rooms.length,
    ready: inService.filter((room) => room.ready).length,
    awaitingInspection: inService.filter(
      (room) => room.status === "clean" && !room.ready,
    ).length,
    dirty: inService.filter((room) => room.status === "dirty").length,
    outOfService: board.rooms.length - inService.length,
    floors: [...floors.values()].sort(
      (a, b) => (a.floor ?? Infinity) - (b.floor ?? Infinity),
    ),
    arrivalsWaiting: notReadyFor.size,
    cleanFirst: queue.slice(0, LIST_LIMIT),
    cleanFirstTotal: queue.length,
  };
}

export function moneyFrom(
  departures: readonly Departure[] | null,
  folios: readonly FolioSummary[],
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

  const owingRows = departures.filter(
    (departure) => departure.balanceMinor > 0,
  );
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
      .map((row) => departureRow(row, true)),
  };
  return card;
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
 * A room is listed once. An urgent request holding it absorbs its holds and
 * carries the date it was due back, if that has passed; otherwise a hold past
 * its return is the item, the earliest-due one when several hold the room;
 * otherwise the plain out-of-service item names the lowest-numbered request.
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
      dueOn: holds ? (overdueOf(holds)?.expectedBackOn ?? null) : null,
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
    } else if (rooms && !arrival.unitIsReady) {
      items.push({
        ...base,
        kind: "not_ready",
        unit: unitOf(arrival),
        guestName: desk ? arrival.guestName : null,
        reference: desk ? arrival.reference : null,
      });
    }
  }

  for (const departure of departures) {
    const owing = money && departure.balanceMinor > 0;
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
    rows: rows
      .filter((row) => row.status !== "checked_in")
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
      rows: rows.slice(0, LIST_LIMIT).map((row) => departureRow(row, money)),
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

  return summary;
}
