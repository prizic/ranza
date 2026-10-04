import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUDIT_READ_PERMISSION,
  CONFIGURATION_CAPABILITY,
  MIN_SEARCH_LENGTH,
  TODAY_CAPABILITY,
} from "@ranza/core";
import type {
  AuditEntry,
  AuditFilters,
  AuditNames,
  AuditPage,
  BillingNotice,
  CapabilityProperties,
  CapabilityRef,
  EntitledProperty,
  PropertySettings,
} from "@ranza/core";
import type { CloseTheDay } from "@ranza/business-day";
import type { PriceList } from "@ranza/rates";
import {
  FOLIO_CAPABILITY,
  POST_CHARGE_PERMISSION,
  POST_PAYMENT_PERMISSION,
  REVERSE_CHARGE_PERMISSION,
  REVERSE_PAYMENT_PERMISSION,
} from "@ranza/folios";
import {
  GUEST_SERVICES_CAPABILITY,
  GUEST_SERVICES_PERMISSIONS,
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
  type ServiceRequestCategory,
  type ServiceRequestItem,
  type ServiceRequestPriority,
  type ServiceRequestStatus,
} from "@ranza/guest-services";
import type { FolioDetail, FolioSummary } from "@ranza/folios";
import {
  BookingChangeError,
  FRONT_DESK_CAPABILITY,
  ReservationPeriodError,
  ROOM_CALENDAR_DEFAULT_LENGTH,
  ROOM_CALENDAR_LENGTHS,
} from "@ranza/reservations";
import type {
  Arrival,
  BookableUnit,
  ChangePreview,
  Departure,
  DeparturePreview,
  DepartureView,
  MovePreview,
  ReservationRow,
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
  RoomCalendarWindow,
  UnitAvailability,
} from "@ranza/reservations";
import { ROOMS_CAPABILITY } from "@ranza/accommodation";
import type {
  AccommodationUnitStatus,
  AccommodationUnitType,
  NewUnits,
  UnitCounts,
  UnitEntry,
  UnitMap,
  UnitsAdded,
  UnitState,
} from "@ranza/accommodation";
import { HOUSEKEEPING_CAPABILITY, MARK_BATCH } from "@ranza/housekeeping";
import type {
  HousekeepingBoard,
  HousekeepingRoom,
  HousekeepingStatus,
  InspectionSettings,
} from "@ranza/housekeeping";
import {
  BOARD_STATES,
  CANCEL_REASON,
  DETAILS,
  EQUIPMENT_CATEGORY,
  EQUIPMENT_LOCATION,
  EQUIPMENT_NAME,
  MAINTENANCE_CAPABILITY,
  PRIORITIES,
  RETURN_AS,
  RETURN_NOTE,
  SERVICE_INTERVAL,
  TITLE,
  VENDOR,
} from "@ranza/maintenance";
import type {
  BoardState,
  ChargeableStay,
  EquipmentItem,
  EquipmentRegister,
  MaintenanceBoard,
  MaintenanceRequestCard,
  MaintenanceSettings,
  OutOfOrderImpact,
  Priority,
  ReportOptions,
  RequestStatus,
  ReturnAs,
  RoomsMaintenance,
  SettingOverrides,
  SettingValues,
  UnitHold,
} from "@ranza/maintenance";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { displayName } from "./display-name";
import type { TodaySummary } from "./today-derive";
import { readTodaySummary, todayReads } from "./today-summary";
import {
  getMonthReport,
  getPropertyAnalytics,
  type AnalyticsRange,
  type DailyMetric,
  type MonthReport,
  type PaymentMethodBreakdown,
  type PropertyAnalytics,
} from "./analytics";

export type {
  AnalyticsRange,
  DailyMetric,
  MonthReport,
  PaymentMethodBreakdown,
  PropertyAnalytics,
};

/**
 * The single funnel from a request to tenant data (ADR 0007).
 *
 * Reading a tenant-owned table takes three steps, and skipping any one of them
 * produces the same symptom: policies see a null acting user, deny everything,
 * and the page renders empty. That fails safe and reads as a data problem,
 * which is the most expensive kind of bug to chase. So the three steps live
 * here, together, once:
 *
 *   1. validate the session          (Better Auth, the ranza_auth client)
 *   2. map the provider subject to a Ranza user id  (auth_identities)
 *   3. run the read inside withOrganizationContext  (the ranza_app client)
 *
 * Step 3 happens inside @ranza/core, so it cannot be forgotten by a caller.
 * Nothing outside src/server/ may import @ranza/db, a Ranza module or a
 * platform module, which .dependency-cruiser.cjs enforces and tests/boundaries
 * proves.
 */

// Re-exported so a page never imports @ranza/core directly. The boundary rule
// is absolute rather than carved out for constants: an exception is the crack
// through which a direct query eventually arrives.
export {
  AUDIT_READ_PERMISSION,
  CONFIGURATION_CAPABILITY,
  MIN_SEARCH_LENGTH,
  TODAY_CAPABILITY,
  FRONT_DESK_CAPABILITY,
  FOLIO_CAPABILITY,
  POST_CHARGE_PERMISSION,
  POST_PAYMENT_PERMISSION,
  REVERSE_CHARGE_PERMISSION,
  REVERSE_PAYMENT_PERMISSION,
  HOUSEKEEPING_CAPABILITY,
  MARK_BATCH,
  ROOMS_CAPABILITY,
  BOARD_STATES,
  CANCEL_REASON,
  DETAILS,
  MAINTENANCE_CAPABILITY,
  PRIORITIES,
  RETURN_AS,
  RETURN_NOTE,
  TITLE,
  EQUIPMENT_CATEGORY,
  EQUIPMENT_LOCATION,
  EQUIPMENT_NAME,
  SERVICE_INTERVAL,
  VENDOR,
  ROOM_CALENDAR_DEFAULT_LENGTH,
  ROOM_CALENDAR_LENGTHS,
  GUEST_SERVICES_CAPABILITY,
  GUEST_SERVICES_PERMISSIONS,
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
};
export type {
  ServiceRequestCategory,
  ServiceRequestItem,
  ServiceRequestPriority,
  ServiceRequestStatus,
  AccommodationUnitStatus,
  AccommodationUnitType,
  Arrival,
  AuditEntry,
  AuditFilters,
  AuditNames,
  AuditPage,
  BookableUnit,
  ChangePreview,
  CloseTheDay,
  DeparturePreview,
  Departure,
  FolioDetail,
  MovePreview,
  FolioSummary,
  HousekeepingBoard,
  HousekeepingRoom,
  HousekeepingStatus,
  InspectionSettings,
  BoardState,
  ChargeableStay,
  EquipmentItem,
  EquipmentRegister,
  MaintenanceBoard,
  MaintenanceRequestCard,
  MaintenanceSettings,
  OutOfOrderImpact,
  Priority,
  ReportOptions,
  RequestStatus,
  ReturnAs,
  RoomsMaintenance,
  SettingOverrides,
  SettingValues,
  UnitHold,
  NewUnits,
  PriceList,
  PropertySettings,
  ReservationRow,
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
  RoomCalendarWindow,
  UnitCounts,
  UnitEntry,
  UnitMap,
  UnitsAdded,
  UnitState,
};

export interface Viewer {
  /** Ranza user id — what app.current_user_id() returns. Never a subject. */
  userId: string;
  email: string;
  /**
   * What to call them: the name they signed up with, or the part of their
   * email before the @ when that is blank or is itself an address. Never the
   * whole address — a greeting is not where to print one.
   */
  name: string;
  /**
   * Whether this account carries a second factor. An authentication fact, not
   * an authorization one: it says how the session was obtained and never what
   * the Staff Member may reach.
   */
  twoFactorEnabled: boolean;
}

/**
 * Resolves the request's session to a Ranza user, or null when there is none.
 *
 * `cache` scopes the result to one request, so a layout and the page beneath it
 * validate the session once between them.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  // Read first, and before anything else touches the composition: this is what
  // marks every page below as request-scoped, so none of them is prerendered
  // with somebody else's session or with no session at all.
  const requestHeaders = await headers();

  const { auth, linkRanzaUser } = getComposition();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  // Idempotent, and the designed seam of ADR 0005: an authenticated subject
  // always has a Ranza user, but that user belongs to no Organization until a
  // membership is granted. Provisioning it here grants nothing.
  const userId = await linkRanzaUser({
    subject: session.user.id,
    email: session.user.email,
  });
  return {
    userId,
    email: session.user.email,
    name: displayName(session.user.name, session.user.email),
    twoFactorEnabled: session.user.twoFactorEnabled === true,
  };
});

/**
 * Sends an unauthenticated visitor to sign in rather than to an empty page.
 *
 * Every page calls it, not only the layout. Moving between pages is a client
 * navigation that renders the new page and leaves the layout above it as it
 * was, so a session ended since the last full load (ADR 0027) is noticed here
 * or not at all — and not noticing it looks like empty pages under a shell
 * still showing somebody's email.
 */
export async function requireViewer(locale: SupportedLocale): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect(localizeHref(locale, "sign-in"));
  return viewer;
}

/**
 * Every Property the viewer may use `capability` in — the only tenant read the
 * application performs.
 *
 * Empty for an unauthenticated visitor, for a user with no membership, and for
 * a Property whose Organization lost the Entitlement. Those are different
 * situations with deliberately identical answers: what a viewer may not reach
 * should not be distinguishable from what does not exist.
 */
export const entitledProperties = cache(
  async (capability: CapabilityRef): Promise<readonly EntitledProperty[]> => {
    const viewer = await currentViewer();
    if (!viewer) return [];
    return getComposition().core.listEntitledProperties(
      viewer.userId,
      capability,
    );
  },
);

/**
 * `entitledProperties` for several capabilities, answered in one read.
 *
 * For the shell, which asks about every destination at once: one transaction
 * rather than one per destination, which on a full page load was more
 * connections at once than the pool holds. Same gates, same answers.
 */
export async function entitledPropertiesByCapability(
  capabilities: readonly CapabilityRef[],
): Promise<readonly CapabilityProperties[]> {
  const viewer = await currentViewer();
  if (!viewer) {
    return capabilities.map((capability) => ({ capability, properties: [] }));
  }
  return getComposition().core.listEntitledPropertiesByCapability(
    viewer.userId,
    capabilities,
  );
}

/**
 * The Reservations arriving today at one Property — the Front Office read.
 *
 * It does not re-check that the viewer may reach `propertyId`. A Property they
 * cannot reach produces an empty list, because the policies and the capability
 * gate inside the module decide that, and a second check here would be the
 * weaker of the two while inviting somebody to trust it instead.
 *
 * Not `cache`d on the capability the way `entitledProperties` is: this list
 * changes when somebody checks a Guest in, and a request that does so then
 * re-reads must see the result.
 */
export async function arrivals(
  propertyId: string,
): Promise<readonly Arrival[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listArrivals(viewer.userId, propertyId);
}

/**
 * The room calendar for one Property over one window (RANZ-25).
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer cannot
 * reach comes back with no Units because the policies and the capability gate
 * decide that, not a condition here. Null only when nobody is signed in.
 *
 * Not `cache`d: it is polled, and a check-in elsewhere must show on the next
 * read.
 */
export async function roomCalendar(
  propertyId: string,
  window: RoomCalendarWindow,
): Promise<RoomCalendar | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().reservations.listRoomCalendar(
    viewer.userId,
    propertyId,
    window,
  );
}

/**
 * What changing a booking to these nights would do, for the Change booking
 * dialog (blueprint 18.6, AB-S1-07).
 *
 * `refused` is every reason the booking is not the viewer's to change — out of
 * reach, arrived, finished, never existed — as one answer, like every refusal
 * on the front desk. `invalidPeriod` is the dates the viewer typed. Anything
 * else is thrown, for the route to log.
 */
export type BookingChangePreview =
  | { kind: "preview"; preview: ChangePreview }
  | { kind: "refused" }
  | { kind: "invalidPeriod" };

export async function bookingChangePreview(
  reservationId: string,
  startsOn: string,
  endsOn: string | null,
): Promise<BookingChangePreview> {
  const viewer = await currentViewer();
  if (!viewer) return { kind: "refused" };
  try {
    const preview = await getComposition().reservations.previewChange(
      viewer.userId,
      reservationId,
      startsOn,
      endsOn,
    );
    return { kind: "preview", preview };
  } catch (error: unknown) {
    if (error instanceof ReservationPeriodError)
      return { kind: "invalidPeriod" };
    if (error instanceof BookingChangeError) return { kind: "refused" };
    throw error;
  }
}

/**
 * Which Units are taken over the nights a booking is being made for, for the
 * New reservation dialog to mark (RG-S4-06).
 *
 * `invalidPeriod` is the dates the viewer typed and `refused` is no viewer;
 * anything else is thrown, for the route to log and the dialog to treat as "could
 * not check", which leaves every Unit choosable.
 */
export type BookingAvailability =
  | { kind: "ready"; unavailable: readonly UnitAvailability[] }
  | { kind: "refused" }
  | { kind: "invalidPeriod" };

export async function bookingAvailability(
  propertyId: string,
  startsOn: string,
  endsOn: string | null,
): Promise<BookingAvailability> {
  const viewer = await currentViewer();
  if (!viewer) return { kind: "refused" };
  try {
    const unavailable =
      await getComposition().reservations.listUnavailableUnits(
        viewer.userId,
        propertyId,
        startsOn,
        endsOn,
      );
    return { kind: "ready", unavailable };
  } catch (error: unknown) {
    if (error instanceof ReservationPeriodError)
      return { kind: "invalidPeriod" };
    throw error;
  }
}

/**
 * What changing an in-house Guest's departure would do, for the Change
 * departure dialog (amend-booking slice 2). The same three answers as
 * `bookingChangePreview`, for the same reasons.
 */
export type DepartureChangePreview =
  | { kind: "preview"; preview: DeparturePreview }
  | { kind: "refused" }
  | { kind: "invalidPeriod" };

export async function departureChangePreview(
  stayId: string,
  endsOn: string | null,
): Promise<DepartureChangePreview> {
  const viewer = await currentViewer();
  if (!viewer) return { kind: "refused" };
  try {
    const preview = await getComposition().reservations.previewDeparture(
      viewer.userId,
      stayId,
      endsOn,
    );
    return { kind: "preview", preview };
  } catch (error: unknown) {
    if (error instanceof ReservationPeriodError)
      return { kind: "invalidPeriod" };
    if (error instanceof BookingChangeError) return { kind: "refused" };
    throw error;
  }
}

/**
 * Where an in-house Guest could be moved, for the Move Guest dialog
 * (amend-booking slice 3).
 */
export type GuestMovePreview =
  { kind: "preview"; preview: MovePreview } | { kind: "refused" };

export async function guestMovePreview(
  stayId: string,
): Promise<GuestMovePreview> {
  const viewer = await currentViewer();
  if (!viewer) return { kind: "refused" };
  try {
    const preview = await getComposition().reservations.previewMove(
      viewer.userId,
      stayId,
    );
    return { kind: "preview", preview };
  } catch (error: unknown) {
    if (error instanceof BookingChangeError) return { kind: "refused" };
    throw error;
  }
}

/**
 * The Stays in house at one Property: those due to leave today and any already
 * overdue, or with `in_house` everybody — the early leaver and the open-ended
 * Resident a front desk also checks out.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer cannot
 * reach produces an empty list because the policies and the capability gate
 * decide that, not a condition here.
 */
export async function departures(
  propertyId: string,
  view: DepartureView = "due",
): Promise<readonly Departure[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listDepartures(
    viewer.userId,
    propertyId,
    view,
  );
}

/**
 * Close the day at one Property: the day waiting to be closed, what is still
 * open on it, and the recent closes — or null when the viewer cannot reach the
 * Property with the front desk, which is the same answer for one that does not
 * exist.
 *
 * Not `cache`d: closing, a no-show and a cancellation all change it, and the
 * request that made one re-reads.
 */
export async function closeTheDay(
  propertyId: string,
): Promise<CloseTheDay | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().businessDay.getCloseTheDay(viewer.userId, propertyId);
}

/**
 * The Property's current and upcoming Reservations — the booking list.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer cannot
 * reach produces an empty list because the policies and the capability gate
 * decide that, not a condition here.
 *
 * Not `cache`d, for the same reason none of the front-desk reads are: taking a
 * booking changes this, and the request that took one then re-reads must see it.
 */
export async function reservations(
  propertyId: string,
): Promise<readonly ReservationRow[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listReservations(
    viewer.userId,
    propertyId,
  );
}

/**
 * The Property's business date for the booking form (RG-S1-10), or null where
 * the viewer cannot book. Not `cache`d, like the other front-desk reads: the
 * cutoff can pass between two requests.
 */
export async function bookingDay(propertyId: string): Promise<string | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().reservations.bookingDay(viewer.userId, propertyId);
}

/**
 * The Units a booking may be placed on.
 *
 * Every Unit in service, not the free ones. Which are taken over particular
 * nights is `bookingAvailability`, read as the dates are chosen and used to
 * mark, so a list filtered here cannot go stale under somebody pressing the
 * button. The exclusion constraint still decides at saving.
 */
export async function bookableUnits(
  propertyId: string,
): Promise<readonly BookableUnit[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listBookableUnits(
    viewer.userId,
    propertyId,
  );
}

/**
 * The Folios at one Property, with the balance of each — the Finance read.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer
 * cannot reach produces an empty list because the policies and the capability
 * gate decide that, not a condition here.
 *
 * Not `cache`d, for the same reason the front-desk reads are not: posting a
 * charge changes this, and a request that posts one then re-reads must see it.
 */
export async function folios(
  propertyId: string,
): Promise<readonly FolioSummary[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().folios.listFolios(viewer.userId, propertyId);
}

/**
 * One Folio and its lines.
 *
 * Null for a Folio the viewer cannot reach and for one that does not exist,
 * which are the same answer on purpose — a `?folio=` somebody guessed must be
 * indistinguishable from one that was never there.
 */
export async function folio(folioId: string): Promise<FolioDetail | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().folios.folioDetail(viewer.userId, folioId);
}

/**
 * Every Unit at one Property and what each is doing tonight (RB-S1-01).
 *
 * Same funnel and same non-checking: a Property the viewer cannot reach,
 * or one whose capability is off, produces an empty list because the policies
 * and the capability gate decide that, not a condition here.
 */
export async function rooms(propertyId: string): Promise<UnitMap> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      today: new Date().toISOString().slice(0, 10),
      units: [],
      counts: {
        rooms: 0,
        sellable: 0,
        inHouse: 0,
        reserved: 0,
        free: 0,
        blocked: 0,
        outOfService: 0,
      },
    };
  }
  return getComposition().accommodation.listUnits(viewer.userId, propertyId);
}

/**
 * Every room at one Property and whether it needs cleaning (HK-S1-13).
 *
 * Same funnel and same non-checking: a Property the viewer cannot reach, or
 * one without housekeeping, produces an empty board because the policies and
 * the capability gate decide that, not a condition here. Not `cache`d: a
 * request that marks a room and then reads must see its own mark.
 */
export async function housekeepingBoard(
  propertyId: string,
): Promise<HousekeepingBoard> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      rooms: [],
      counts: { rooms: 0, dirty: 0, clean: 0, inspected: 0, ready: 0 },
      mayMark: false,
    };
  }
  return getComposition().housekeeping.board(viewer.userId, propertyId);
}

/**
 * Whether rooms at this Property are inspected before they are ready, and
 * whether the viewer may change that (HK-S3-09). Null where there is nothing to
 * configure: out of reach, or no housekeeping.
 */
export async function housekeepingInspection(
  propertyId: string,
): Promise<InspectionSettings | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().housekeeping.inspectionSettings(
    viewer.userId,
    propertyId,
  );
}

/**
 * Every Property the viewer reaches in an Organization where they hold
 * `permission` — the gate for a destination no package selection may remove.
 *
 * `cache`d like `entitledProperties`: the layout and the page beneath it ask
 * the same question in one request.
 */
export const permittedProperties = cache(
  async (permission: string): Promise<readonly EntitledProperty[]> => {
    const viewer = await currentViewer();
    if (!viewer) return [];
    return getComposition().core.listPermittedProperties(
      viewer.userId,
      permission,
    );
  },
);

/**
 * The Organizations whose Subscription is past due, for an Owner (ADR 0040).
 * Asked once per full load by the shell.
 */
export async function billingNotices(): Promise<readonly BillingNotice[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().core.billingNotices(viewer.userId);
}

/**
 * One Property's Today for the viewer, or null when they do not have Today
 * there — the same answer as for a Property that does not exist.
 *
 * A section whose read fails is logged here and marked unavailable; the rest
 * of the page stands (TD-S1-24).
 */
export async function todaySummary(
  propertyId: string,
): Promise<TodaySummary | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return readTodaySummary(
    todayReads(getComposition(), viewer.userId),
    propertyId,
    {
      frontDesk: FRONT_DESK_CAPABILITY,
      housekeeping: HOUSEKEEPING_CAPABILITY,
      billing: FOLIO_CAPABILITY,
      maintenance: MAINTENANCE_CAPABILITY,
    },
    (section, error) =>
      console.error("today.section_failed", {
        section,
        propertyId,
        userId: viewer.userId,
        error,
      }),
  );
}

const NO_AUDIT: AuditPage = {
  entries: [],
  total: 0,
  nextCursor: null,
  labels: {},
  locations: {},
  roles: {},
};

/**
 * One page of the audit log, opened from a Property — what was done, by whom,
 * where, and why.
 *
 * Same funnel and same non-checking as `arrivals`: the permission is asked in
 * the database, in the same transaction as the read, and the read policy
 * decides which records the viewer reaches. A Property they cannot open the
 * log from produces an empty page rather than an error (ADR 0031).
 *
 * Not `cache`d, for the same reason the front-desk reads are not: a request
 * that reverses a charge and then reads must see the record it just caused.
 */
export async function auditLog(
  propertyId: string,
  filters: AuditFilters,
): Promise<AuditPage> {
  const viewer = await currentViewer();
  if (!viewer) return NO_AUDIT;
  return getComposition().core.auditLog(viewer.userId, propertyId, filters);
}

/**
 * One audit record by id — so a link to it keeps working however many
 * records are written after it. Null for one that does not exist and one the
 * viewer may not read, alike.
 */
export async function auditRecord(
  propertyId: string,
  recordId: string,
): Promise<(AuditNames & { entry: AuditEntry }) | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().core.auditRecord(viewer.userId, propertyId, recordId);
}

/**
 * One Property's settings for the Configuration screen, and whether the viewer
 * may change them (ADR 0036). Null for a Property they cannot reach or where
 * configuration is not available.
 *
 * Not `cache`d: saving changes this, and the request that saved re-reads it.
 */
export async function propertySettings(
  propertyId: string,
): Promise<PropertySettings | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().core.propertySettings(viewer.userId, propertyId);
}

/**
 * The timezones a Property may be set to — both Postgres and this runtime know
 * them. Read once per process: the list is the time zone database, which
 * changes when Postgres or Node is upgraded, never between two requests, and
 * reading it costs a scan of every zone on every render.
 */
let zones: Promise<readonly string[]> | undefined;

export async function timezoneNames(): Promise<readonly string[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  zones ??= getComposition()
    .core.timezoneNames(viewer.userId)
    .catch((error: unknown) => {
      // A failed read is not the answer; the next request asks again.
      zones = undefined;
      throw error;
    });
  return zones;
}

/**
 * Every open request at one Property, and the ones done or cancelled in the
 * last thirty days, with what the viewer may do (MT-S1-10).
 *
 * Same funnel and same non-checking as the housekeeping board: a Property the
 * viewer cannot reach, or one without maintenance, produces an empty board
 * because the database decides that. Not `cache`d: a request that moves a card
 * and then reads must see its own move.
 */
export async function maintenanceBoard(
  propertyId: string,
): Promise<MaintenanceBoard> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      today: new Date().toISOString().slice(0, 10),
      requests: [],
      counts: {
        new: 0,
        in_progress: 0,
        waiting_for_parts: 0,
        done: 0,
        cancelled: 0,
        outOfOrder: 0,
      },
      mayReport: false,
      mayManage: false,
      mayTakeOutOfOrder: false,
      mayCharge: false,
    };
  }
  return getComposition().maintenance.board(viewer.userId, propertyId);
}

/** The Units and the assignees the report form offers (MT-S1-18). */
export async function maintenanceReportOptions(
  propertyId: string,
): Promise<ReportOptions> {
  const viewer = await currentViewer();
  if (!viewer) return { units: [], assignees: [], equipment: [] };
  return getComposition().maintenance.reportOptions(viewer.userId, propertyId);
}

/**
 * What a Property's Maintenance setting says and inherits, and whether the
 * viewer may change it. Null where there is nothing to configure.
 */
/**
 * The Property's price list for the Configuration screen's Rates section
 * (ADR 0038). Null where configuration is not available to the viewer.
 */
export async function priceList(propertyId: string): Promise<PriceList | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().rates.getPriceList(viewer.userId, propertyId);
}

export async function maintenanceSettings(
  propertyId: string,
): Promise<MaintenanceSettings | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().maintenance.settings(viewer.userId, propertyId);
}

/**
 * What Rooms shows of maintenance: the Units a request holds out of order, and
 * whether the viewer may report a problem there (MT-S2-28, MT-S1-24). Empty
 * and false where maintenance is not available: Rooms is the front desk's,
 * and a Property may have it without maintenance.
 */
export async function roomsMaintenance(
  propertyId: string,
): Promise<RoomsMaintenance> {
  const viewer = await currentViewer();
  if (!viewer) return { holds: [], mayReport: false };
  return getComposition().maintenance.roomsView(viewer.userId, propertyId);
}

/**
 * The equipment register at one Property, each item with its condition and
 * next service; the service plan is the same read by date (MT-S3-04, MT-S4-01).
 */
export async function equipmentRegister(
  propertyId: string,
): Promise<EquipmentRegister> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      today: new Date().toISOString().slice(0, 10),
      items: [],
      mayManageEquipment: false,
      mayReport: false,
    };
  }
  return getComposition().maintenance.equipmentRegister(
    viewer.userId,
    propertyId,
  );
}

/**
 * Derives operational and financial analytics metrics for a Property.
 * Returns null if the viewer cannot reach the Property or lacks the analytics capability.
 */
export async function propertyAnalytics(
  propertyId: string,
  range?: string | null,
): Promise<PropertyAnalytics | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getPropertyAnalytics(viewer.userId, propertyId, range);
}

/**
 * One calendar month of a Property, explained.
 * Null if the viewer cannot reach the Property or lacks the analytics capability:
 * the screen shows its not-found state, not an empty month (AN-S2-16).
 */
export async function propertyMonthReport(
  propertyId: string,
  month?: string | null,
): Promise<MonthReport | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getMonthReport(viewer.userId, propertyId, month);
}

/**
 * Reads service requests at a Property.
 */
export async function propertyServiceRequests(
  propertyId: string,
): Promise<ServiceRequestItem[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];

  return getComposition().guestServices.requests(viewer.userId, propertyId);
}
