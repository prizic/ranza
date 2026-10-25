import type { BusinessDayModule, DaysWaiting } from "@ranza/business-day";
import type {
  AuditPage,
  CapabilityRef,
  CoreModule,
  WorkingDay,
} from "@ranza/core";
import type { ChargesPosted, FolioSummary, FoliosModule } from "@ranza/folios";
import type {
  HousekeepingBoard,
  HousekeepingModule,
} from "@ranza/housekeeping";
import type { MaintenanceModule, TodayMaintenance } from "@ranza/maintenance";
import type {
  Arrival,
  Departure,
  ReservationsModule,
  RoomCalendar,
} from "@ranza/reservations";
import type { AccommodationModule, UnitMap } from "@ranza/accommodation";
import {
  ACTIVITY_WINDOW_DAYS,
  BOOKED_AHEAD_NIGHTS,
  deriveToday,
  grantsFor,
  needsFor,
  type Read,
  type TodayInput,
  type TodaySummary,
} from "./today-derive";

/**
 * The reads Today is made of, for one viewer.
 *
 * Separate from the composition so the integration suite drives the real
 * path with real modules, as it does the worker; `viewer.ts` binds it to the
 * request's viewer.
 */
export interface TodayReads {
  workingDay: (
    propertyId: string,
    capabilities: readonly CapabilityRef[],
  ) => Promise<WorkingDay | null>;
  arrivals: (propertyId: string) => Promise<readonly Arrival[]>;
  departures: (propertyId: string) => Promise<readonly Departure[]>;
  departedToday: (propertyId: string) => Promise<number>;
  /** Everybody in house, whenever they are due to leave. */
  inHouse: (propertyId: string) => Promise<readonly Departure[]>;
  units: (propertyId: string) => Promise<UnitMap>;
  board: (propertyId: string) => Promise<HousekeepingBoard>;
  folios: (propertyId: string) => Promise<readonly FolioSummary[]>;
  maintenance: (propertyId: string) => Promise<TodayMaintenance>;
  /**
   * The newest records, newest first, of the log the viewer may read, from
   * the start of `since` on the Property's own clock.
   */
  activity: (propertyId: string, since: string) => Promise<AuditPage>;
  charges: (propertyId: string) => Promise<readonly ChargesPosted[]>;
  /** From the business date, the nights ahead. */
  calendar: (propertyId: string, from: string) => Promise<RoomCalendar>;
  daysWaiting: (propertyId: string) => Promise<DaysWaiting | null>;
}

export interface TodayModules {
  core: CoreModule;
  reservations: ReservationsModule;
  accommodation: AccommodationModule;
  housekeeping: HousekeepingModule;
  folios: FoliosModule;
  maintenance: MaintenanceModule;
  businessDay: BusinessDayModule;
}

export function todayReads(modules: TodayModules, userId: string): TodayReads {
  return {
    workingDay: (propertyId, capabilities) =>
      modules.core.workingDay(userId, propertyId, capabilities),
    arrivals: (propertyId) =>
      modules.reservations.listArrivals(userId, propertyId),
    departures: (propertyId) =>
      modules.reservations.listDepartures(userId, propertyId, "due"),
    departedToday: async (propertyId) =>
      (await modules.reservations.listDepartedToday(userId, propertyId)).length,
    inHouse: (propertyId) =>
      modules.reservations.listDepartures(userId, propertyId, "in_house"),
    units: (propertyId) => modules.accommodation.listUnits(userId, propertyId),
    board: (propertyId) => modules.housekeeping.board(userId, propertyId),
    folios: (propertyId) =>
      modules.folios.listFolios(userId, propertyId, { pending: true }),
    maintenance: (propertyId) =>
      modules.maintenance.todayView(userId, propertyId),
    activity: (propertyId, since) =>
      modules.core.auditLog(userId, propertyId, { from: since }),
    charges: (propertyId) =>
      modules.folios.chargesPostedToday(userId, propertyId),
    calendar: (propertyId, from) =>
      modules.reservations.listRoomCalendar(userId, propertyId, {
        from,
        days: BOOKED_AHEAD_NIGHTS,
      }),
    daysWaiting: (propertyId) =>
      modules.businessDay.daysWaiting(userId, propertyId),
  };
}

/** The day the activity card reads from: the business date, less the window. */
function activitySince(businessDate: string): string {
  const since = new Date(`${businessDate}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - ACTIVITY_WINDOW_DAYS);
  return since.toISOString().slice(0, 10);
}

/** Where a section's failure goes; the server logs it, a test collects it. */
export type Report = (section: string, error: unknown) => void;

async function attempt<T>(
  section: string,
  read: () => Promise<T>,
  report: Report,
): Promise<Read<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    report(section, error);
    return { ok: false };
  }
}

/**
 * One Property's Today, or null when the viewer does not have Today there.
 *
 * The reads run one after another, never side by side: each is its own
 * transaction, and several at once on every load and every poll is the pool
 * exhaustion #58 fixed in the layout. Only the reads the viewer's focus and
 * the Property's capabilities need are asked at all, and one failing leaves
 * the others standing (TD-S1-24).
 */
export async function readTodaySummary(
  reads: TodayReads,
  propertyId: string,
  capabilities: {
    frontDesk: CapabilityRef;
    housekeeping: CapabilityRef;
    billing: CapabilityRef;
    maintenance: CapabilityRef;
  },
  report: Report,
): Promise<TodaySummary | null> {
  const day = await reads.workingDay(propertyId, [
    capabilities.frontDesk,
    capabilities.housekeeping,
    capabilities.billing,
    capabilities.maintenance,
  ]);
  if (!day) return null;

  const has = {
    frontDesk: day.capabilities[0] === true,
    housekeeping: day.capabilities[1] === true,
    billing: day.capabilities[2] === true,
    maintenance: day.capabilities[3] === true,
  };
  const needs = needsFor(grantsFor(day.permissions), has);
  const input: TodayInput = { day, capabilities: has };

  if (needs.arrivals) {
    input.arrivals = await attempt(
      "arrivals",
      () => reads.arrivals(propertyId),
      report,
    );
  }
  if (needs.departures) {
    input.departures = await attempt(
      "departures",
      () => reads.departures(propertyId),
      report,
    );
  }
  if (needs.departed) {
    input.departedToday = await attempt(
      "departedToday",
      () => reads.departedToday(propertyId),
      report,
    );
  }
  if (needs.inHouse) {
    input.inHouse = await attempt(
      "inHouse",
      () => reads.inHouse(propertyId),
      report,
    );
  }
  if (needs.units) {
    input.units = await attempt("units", () => reads.units(propertyId), report);
  }
  if (needs.rooms) {
    input.board = await attempt("rooms", () => reads.board(propertyId), report);
  }
  if (needs.maintenance) {
    input.maintenance = await attempt(
      "maintenance",
      () => reads.maintenance(propertyId),
      report,
    );
  }
  if (needs.folios) {
    input.folios = await attempt(
      "folios",
      () => reads.folios(propertyId),
      report,
    );
  }
  if (needs.activity) {
    input.activity = await attempt(
      "activity",
      () => reads.activity(propertyId, activitySince(day.businessDate)),
      report,
    );
  }
  if (needs.charges) {
    input.charges = await attempt(
      "charges",
      () => reads.charges(propertyId),
      report,
    );
  }
  if (needs.calendar) {
    input.calendar = await attempt(
      "calendar",
      () => reads.calendar(propertyId, day.businessDate),
      report,
    );
  }
  if (needs.closeDay) {
    input.daysWaiting = await attempt(
      "daysWaiting",
      () => reads.daysWaiting(propertyId),
      report,
    );
  }

  return deriveToday(input);
}
