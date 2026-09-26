import type { CapabilityRef, CoreModule, WorkingDay } from "@ranza/core";
import type { FolioSummary, FoliosModule } from "@ranza/folios";
import type {
  HousekeepingBoard,
  HousekeepingModule,
} from "@ranza/housekeeping";
import type {
  Arrival,
  Departure,
  ReservationsModule,
} from "@ranza/reservations";
import type { AccommodationModule, UnitMap } from "@ranza/accommodation";
import {
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
  units: (propertyId: string) => Promise<UnitMap>;
  board: (propertyId: string) => Promise<HousekeepingBoard>;
  folios: (propertyId: string) => Promise<readonly FolioSummary[]>;
}

export interface TodayModules {
  core: CoreModule;
  reservations: ReservationsModule;
  accommodation: AccommodationModule;
  housekeeping: HousekeepingModule;
  folios: FoliosModule;
}

export function todayReads(modules: TodayModules, userId: string): TodayReads {
  return {
    workingDay: (propertyId, capabilities) =>
      modules.core.workingDay(userId, propertyId, capabilities),
    arrivals: (propertyId) =>
      modules.reservations.listArrivals(userId, propertyId),
    departures: (propertyId) =>
      modules.reservations.listDepartures(userId, propertyId, "due"),
    departedToday: (propertyId) =>
      modules.reservations.countDepartedToday(userId, propertyId),
    units: (propertyId) => modules.accommodation.listUnits(userId, propertyId),
    board: (propertyId) => modules.housekeeping.board(userId, propertyId),
    folios: (propertyId) => modules.folios.listFolios(userId, propertyId),
  };
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
  },
  report: Report,
): Promise<TodaySummary | null> {
  const day = await reads.workingDay(propertyId, [
    capabilities.frontDesk,
    capabilities.housekeeping,
    capabilities.billing,
  ]);
  if (!day) return null;

  const has = {
    frontDesk: day.capabilities[0] === true,
    housekeeping: day.capabilities[1] === true,
    billing: day.capabilities[2] === true,
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
  if (needs.units) {
    input.units = await attempt("units", () => reads.units(propertyId), report);
  }
  if (needs.rooms) {
    input.board = await attempt("rooms", () => reads.board(propertyId), report);
  }
  if (needs.folios) {
    input.folios = await attempt(
      "folios",
      () => reads.folios(propertyId),
      report,
    );
  }

  return deriveToday(input);
}
