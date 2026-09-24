/**
 * The public vocabulary of Maintenance (RANZ-33, blueprint 5.13 and 6.5): a
 * problem reported at a Property, the work on it, and the Unit it may hold out
 * of order (ADR 0032).
 *
 * Designed before it was written: the diagrams and the row-per-boundary table
 * are in `docs/features/maintenance/`, and the rules below point at the rows
 * that decided them. The unions mirror check constraints the module owns; the
 * database stays the authority.
 */

/**
 * The Entitlement module and Property capability every read carries and every
 * write policy names. A Property without it has no board, no rail entry, and
 * no out-of-order door (MT-S1-05).
 */
export const MAINTENANCE_CAPABILITY = {
  moduleKey: "maintenance",
  capabilityKey: "maintenance",
} as const;

/** `maintenance_requests_status_check`. */
export type RequestStatus =
  "new" | "in_progress" | "waiting_for_parts" | "done" | "cancelled";

/** The four columns of the board, in order. Cancelled is behind a filter. */
export const BOARD_STATES = [
  "new",
  "in_progress",
  "waiting_for_parts",
  "done",
] as const satisfies readonly RequestStatus[];

export type BoardState = (typeof BOARD_STATES)[number];

/** `maintenance_requests_priority_check`. */
export type Priority = "urgent" | "this_week" | "can_wait";

export const PRIORITIES = [
  "urgent",
  "this_week",
  "can_wait",
] as const satisfies readonly Priority[];

/** What a room returned to service comes back as (`maintenance_settings`). */
export type ReturnAs = "dirty" | "clean" | "inspected";

export const RETURN_AS = [
  "dirty",
  "clean",
  "inspected",
] as const satisfies readonly ReturnAs[];

/** `maintenance_requests_title_check` (MT-S1-09). */
export const TITLE = { min: 3, max: 200 } as const;

/** `maintenance_requests_details_check`. */
export const DETAILS = { max: 2000 } as const;

/** `maintenance_requests_cancel_reason_check` (MT-S1-15). */
export const CANCEL_REASON = { min: 3, max: 200 } as const;

/** A note returning a room, kept in the audit record (MT-S2-21). */
export const RETURN_NOTE = { max: 200 } as const;

/** `maintenance_equipment_*_check` (MT-S3-03). */
export const EQUIPMENT_NAME = { min: 1, max: 120 } as const;
export const EQUIPMENT_CATEGORY = { min: 1, max: 60 } as const;
export const EQUIPMENT_LOCATION = { min: 1, max: 120 } as const;
export const SERVICE_INTERVAL = { min: 1, max: 120 } as const;

/** How soon a service counts as due (MT-S3-04, MT-S4-01). */
export const DUE_WITHIN_DAYS = 14;

/** `maintenance_requests_vendor_check` (MT-S5-01). */
export const VENDOR = { max: 120 } as const;

/** `maintenance_requests_kind_check`. */
export type RequestKind = "fault" | "service";

/** How long a done or cancelled request stays on the board (MT-S1-10). */
export const RECENT_DAYS = 30;

/** Somebody at the Property, as the board names them: email is identity. */
export interface StaffName {
  userId: string;
  email: string | null;
}

/** The Unit a request is about. `roomName` is set when it is a bed. */
export interface RequestUnit {
  unitId: string;
  name: string;
  roomName: string | null;
}

/** A request's hold on its Unit, while it holds (ADR 0032). */
export interface RequestHold {
  since: string;
  /** `YYYY-MM-DD`, or null when nobody said. */
  expectedBackOn: string | null;
  /** The expected-back date has passed and the room is still out (MT-S2-13). */
  overdue: boolean;
}

/** A damage charge a request put on a Folio (MT-S5-03). */
export interface RequestCharge {
  lineId: string;
  amountMinor: number;
  currency: string;
  guestName: string | null;
  /** A reversal line cancels it on the Folio (MT-S5-08). */
  reversed: boolean;
}

export interface MaintenanceRequestCard {
  requestId: string;
  /** Per Property; shown as MT-12. */
  number: number;
  title: string;
  details: string | null;
  status: RequestStatus;
  kind: RequestKind;
  priority: Priority;
  unit: RequestUnit | null;
  equipment: { equipmentId: string; name: string } | null;
  /** What the repair cost, in minor units of `currency` (MT-S5-01). */
  costMinor: number | null;
  currency: string;
  vendor: string | null;
  charges: readonly RequestCharge[];
  assignee: (StaffName & { reachesProperty: boolean }) | null;
  reporter: StaffName;
  reportedAt: string;
  statusChangedAt: string;
  cancelReason: string | null;
  hold: RequestHold | null;
}

export interface MaintenanceCounts {
  new: number;
  in_progress: number;
  waiting_for_parts: number;
  done: number;
  cancelled: number;
  outOfOrder: number;
}

export interface MaintenanceBoard {
  /** The Property's own day, `YYYY-MM-DD`. */
  today: string;
  requests: readonly MaintenanceRequestCard[];
  counts: MaintenanceCounts;
  /**
   * What the reader holds, so the screen shows only what they may do. Hiding a
   * control is courtesy; the policies are the boundary.
   */
  mayReport: boolean;
  mayManage: boolean;
  mayTakeOutOfOrder: boolean;
  /** `finance.post_charge` where the Property does billing (MT-S5-05). */
  mayCharge: boolean;
}

/** A Unit the report form offers, with whatever stops it being held. */
export interface ReportableUnit {
  unitId: string;
  name: string;
  roomName: string | null;
  status: "available" | "occupied" | "out_of_service" | "blocked";
}

export interface ReportOptions {
  units: readonly ReportableUnit[];
  /** Equipment in use at the Property, for a problem with no room (MT-S3-07). */
  equipment: readonly { equipmentId: string; name: string; where: string }[];
  /** Everybody who reaches the Property, for the assignee picker. */
  assignees: readonly StaffName[];
}

/** Who a Unit going out of order affects (MT-S2-09, MT-S2-10). */
export interface OutOfOrderImpact {
  inHouse: readonly {
    unitName: string;
    guestName: string | null;
    endsOn: string | null;
  }[];
  reservations: readonly {
    unitName: string;
    guestName: string | null;
    startsOn: string;
    endsOn: string | null;
  }[];
}

/** One Unit held out of order, for the Rooms screen (MT-S2-28). */
export interface UnitHold {
  unitId: string;
  requestId: string;
  number: number;
  expectedBackOn: string | null;
}

/** What Rooms shows of maintenance at a Property. */
export interface RoomsMaintenance {
  holds: readonly UnitHold[];
  /** Whether Rooms offers "Report a problem" (MT-S1-24). */
  mayReport: boolean;
}

export interface SettingValues {
  assigneeRequired: boolean;
  returnOnDone: boolean;
  returnAs: ReturnAs;
}

/** A Property's own answers; null follows the Organization default. */
export interface SettingOverrides {
  assigneeRequired: boolean | null;
  returnOnDone: boolean | null;
  returnAs: ReturnAs | null;
}

export interface MaintenanceSettings {
  organizationDefault: SettingValues;
  propertyOverride: SettingOverrides;
  effective: SettingValues;
  mayConfigure: boolean;
  /** Also needs reach to every Property the default governs (MT-S2-23). */
  mayConfigureDefault: boolean;
}

/** The product's own answers when nobody has said anything (MT-S2-22). */
export const PRODUCT_DEFAULTS: SettingValues = {
  assigneeRequired: false,
  returnOnDone: true,
  returnAs: "dirty",
};

/** What an item's dates and open requests say about it (MT-S3-04). */
export type EquipmentCondition = "working" | "due" | "overdue" | "fault";

export interface EquipmentItem {
  equipmentId: string;
  name: string;
  category: string;
  unit: RequestUnit | null;
  location: string | null;
  serviceIntervalMonths: number | null;
  lastServicedOn: string | null;
  /** When the next service falls due; null with no interval. */
  nextServiceOn: string | null;
  condition: EquipmentCondition;
  retired: boolean;
  /** The open fault that makes it `fault`, if any. */
  openFault: { requestId: string; number: number } | null;
  /** The open work order the plan shows instead of its button (MT-S4-03). */
  openWorkOrder: { requestId: string; number: number } | null;
}

export interface EquipmentRegister {
  today: string;
  items: readonly EquipmentItem[];
  mayManageEquipment: boolean;
  mayReport: boolean;
}

export interface EquipmentInput {
  name: string;
  category: string;
  unitId: string | null;
  location: string | null;
  serviceIntervalMonths: number | null;
  lastServicedOn: string | null;
}

/**
 * A change to an item, with the last-serviced date the form was opened on. A
 * date the person did not touch is not theirs to write: a work order done
 * while the form was open recorded a service, and it stays (MT-S3-05).
 */
export interface EquipmentChange extends EquipmentInput {
  lastServicedOnWas: string | null;
}

/** A Stay a damage charge may go on: it used the room, and its Folio is open. */
export interface ChargeableStay {
  stayId: string;
  folioId: string;
  guestName: string | null;
  unitName: string;
  inHouse: boolean;
  endsOn: string | null;
  currency: string;
}

export interface Reported {
  requestId: string;
  number: number;
}

/** What a move did to the room the request holds, if any (MT-S2-14/15). */
export interface Moved {
  /** The room came back into service with this move. */
  returned: boolean;
  /** The request still holds its room after the move. */
  stillOutOfOrder: boolean;
  /** The request let go of its room, and another request still holds it. */
  heldElsewhere: boolean;
}

/**
 * The request was malformed: a title out of bounds, an unknown state or
 * priority, a date that is not one. Raised before any statement runs.
 */
export class MaintenanceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaintenanceInputError";
  }
}

/**
 * Nothing was written. One refusal for every reason — out of reach, not
 * available at the Property, a lapsed Subscription, a missing permission, no
 * such request — because telling them apart would tell a caller what exists
 * where they cannot see.
 */
export class MaintenanceRefusedError extends Error {
  constructor(options?: ErrorOptions) {
    super("that maintenance change was refused", options);
    this.name = "MaintenanceRefusedError";
  }
}

/** Somebody moved the request first (MT-S1-14). Carries where it is now. */
export class RequestMovedError extends Error {
  constructor(readonly current: RequestStatus) {
    super("that request has been moved since it was read");
    this.name = "RequestMovedError";
  }
}

/** The setting asks for an assignee before work starts (MT-S2-25). */
export class AssigneeRequiredError extends Error {
  constructor() {
    super("work on a request starts with somebody assigned to it");
    this.name = "AssigneeRequiredError";
  }
}

/** The assignee does not reach the request's Property (MT-S1-19). */
export class AssigneeOutOfReachError extends Error {
  constructor() {
    super("the assignee does not reach this Property");
    this.name = "AssigneeOutOfReachError";
  }
}

/**
 * Letting go of a room needs `maintenance.take_out_of_order`, which the actor
 * does not hold: cancelling a request that holds its room, or returning it.
 */
export class ReleaseNeedsPermissionError extends Error {
  constructor() {
    super("returning that room needs maintenance.take_out_of_order");
    this.name = "ReleaseNeedsPermissionError";
  }
}

/** A blocked Unit is not taken out of order (MT-S2-08). */
export class UnitBlockedError extends Error {
  constructor() {
    super("a blocked Unit is not taken out of order");
    this.name = "UnitBlockedError";
  }
}

/**
 * Taking the Unit out of order affects somebody, and the desk has not seen who
 * yet (MT-S2-09, MT-S2-10). Nothing was written; the same call with the
 * acknowledgement goes ahead.
 */
export class OutOfOrderImpactError extends Error {
  constructor(readonly impact: OutOfOrderImpact) {
    super("taking that Unit out of order affects Guests or bookings");
    this.name = "OutOfOrderImpactError";
  }
}
