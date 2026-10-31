import type { CapabilityRef, OperatingModel } from "@ranza/core";

/**
 * The public vocabulary of leave (izin) and the nightly roll call (yoklama)
 * (RANZ-101, docs/features/leave-and-attendance).
 *
 * A night is the business night that begins on a date, so the roll call a
 * Property takes after dark on the 3rd is the night of the 3rd, even if the
 * last student answers at ten past midnight (ADR 0021).
 */

/** The Property capability the roll call and leave are offered under. */
export const ATTENDANCE_CAPABILITY: CapabilityRef = {
  moduleKey: "front_office",
  capabilityKey: "attendance",
};

export const TAKE_ATTENDANCE_PERMISSION = "attendance.take";
export const GRANT_LEAVE_PERMISSION = "leave.grant";

/** The table's own bounds, so a form's `maxLength` and the rule cannot drift. */
export const LEAVE_REASON = { min: 2, max: 300 } as const;

/** The most nights one leave may cover: the table's `planned_to_night - from_night < 366`. */
export const LEAVE_NIGHTS_MAX = 366;

/**
 * The curfew a Property starts with when nobody has set one. This is the
 * operating model choosing a default (ADR 0057): it is applied here, in the
 * application, and no function in the database reads the model. A Property
 * that sets its curfew, or sets none, is not asked again.
 */
export const DEFAULT_CURFEW: Readonly<Record<OperatingModel, string | null>> = {
  dormitory: "23:00",
  hotel: null,
};

/** `HH:MM`, the form a curfew is typed and shown in. */
export const CURFEW_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Mark = "present" | "absent";

/**
 * Where a Resident stands on a night. A Resident on leave is on leave
 * whatever has been marked: leave outranks a mark, so a leave granted after
 * a mistaken "absent" settles it, and one cancelled brings it back.
 */
export type NightStatus = "present" | "absent" | "on_leave" | "not_called";

export interface LeaveOnNight {
  leaveId: string;
  fromNight: string;
  toNight: string;
  /** Null unless the viewer holds `leave.grant`: the database hides the rest. */
  reason: string | null;
}

/** One Resident in house, with where they sleep and where they stand tonight. */
export interface RollCallRow {
  stayId: string;
  residentName: string | null;
  building: string | null;
  floor: number | null;
  roomName: string;
  /** Null when the room is let whole. */
  bedName: string | null;
  status: NightStatus;
  /** When the current mark was made; null when none. */
  markedAt: string | null;
  leave: LeaveOnNight | null;
}

/**
 * The figures of a night. `absent` is the Residents marked absent who are not
 * on leave, which is what a warden calls missing; `notCalled` is those with no
 * mark and no leave.
 */
export interface AttendanceFigures {
  inHouse: number;
  onLeave: number;
  present: number;
  absent: number;
  notCalled: number;
}

/** A leave that is granted and not over, for the list beside the roll call. */
export interface CurrentLeave {
  leaveId: string;
  stayId: string;
  residentName: string | null;
  fromNight: string;
  toNight: string;
  plannedToNight: string;
  /** Null unless the viewer holds `leave.grant`. */
  reason: string | null;
  /** The viewer holds `leave.grant`: the row may offer to end or cancel it. */
  mayClose: boolean;
  /** No night of it has passed, so it can be cancelled; otherwise it is ended. */
  begun: boolean;
}

export interface RollCall {
  propertyId: string;
  night: string;
  /** `HH:MM`, or null when the Property has none. */
  curfew: string | null;
  /** Whether it is the Property's setting, or the application's default. */
  curfewIsDefault: boolean;
  curfewPassed: boolean;
  figures: AttendanceFigures;
  rows: RollCallRow[];
  leaves: CurrentLeave[];
  mayTake: boolean;
  mayGrant: boolean;
  mayConfigure: boolean;
}

/** What Today shows: the figures and whether the curfew has passed. */
export interface TonightFigures extends AttendanceFigures {
  propertyId: string;
  night: string;
  curfewPassed: boolean;
}

export interface NewLeave {
  stayId: string;
  fromNight: string;
  toNight: string;
  reason: string;
}

export interface RecordedAttendance {
  /** Revisions written. */
  recorded: number;
  /** Answers already as asked, which write nothing. */
  unchanged: number;
}

/** A thing the caller may not do, or cannot do to that Resident or leave. */
export class AttendanceRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceRefusedError";
  }
}

/** A value outside what the table accepts, naming the field. */
export class AttendanceInputError extends Error {
  constructor(
    message: string,
    readonly field:
      "stayId" | "fromNight" | "toNight" | "reason" | "curfew" | "night",
  ) {
    super(message);
    this.name = "AttendanceInputError";
  }
}

/** The Resident is already away on some of those nights. */
export class LeaveOverlapsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveOverlapsError";
  }
}

/** The leave is over already, or the way of closing it does not fit its state. */
export class LeaveClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaveClosedError";
  }
}
