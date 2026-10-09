export const DATA_EXPORT_CAPABILITY = "data_export" as const;

export const DATA_EXPORT_READ_PERMISSION = "data_export.read";
export const DATA_EXPORT_CREATE_PERMISSION = "data_export.create";

/**
 * The datasets an export can name. The database holds the same list in a check
 * constraint, and the permission each needs in
 * `app.data_export_resource_permissions()` (ADR 0043).
 */
export const EXPORT_RESOURCE_TYPES = [
  "residents_guests",
  "reservations_stays",
  "rooms_beds",
  "folios_payments",
  "audit_log",
] as const;

export type ExportResourceType = (typeof EXPORT_RESOURCE_TYPES)[number];

export const EXPORT_FORMATS = ["csv", "json"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportStatus =
  "pending" | "processing" | "ready" | "failed" | "expired";

export type ExportTriggerType = "on_demand" | "scheduled";
export type ScheduleFrequency = "daily" | "weekly" | "monthly";
export type ScheduleStatus = "active" | "paused";

/**
 * Why an export failed, as a code a screen says in the reader's language. The
 * exception behind `internal_error` goes to the worker's log and nowhere else.
 */
export const EXPORT_FAILURE_REASONS = [
  "requester_not_permitted",
  "too_large",
  "worker_stopped",
  "internal_error",
] as const;

export type ExportFailureReason = (typeof EXPORT_FAILURE_REASONS)[number];

/**
 * A dataset is cut off, and the export fails as `too_large`, rather than
 * handed over short. The database bounds the file at the same size.
 */
export const EXPORT_ROW_LIMIT = 100_000;
export const EXPORT_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

/** The bounds the database holds a schedule's name to. */
export const SCHEDULE_NAME = { min: 1, max: 200 } as const;

/** The names the worker's context carries (ADR 0018). */
export const EXPORT_JOBS = {
  run: "data_export.run",
  schedule: "data_export.schedule",
  sweep: "data_export.sweep",
} as const;

/** An export, as the list and the detail show it. Never its file. */
export interface DataExportRecord {
  id: string;
  organizationId: string;
  requesterId: string;
  requesterName: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  status: ExportStatus;
  triggerType: ExportTriggerType;
  scheduleId: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  recordCounts: Record<string, number>;
  error: ExportFailureReason | null;
  expiresAt: Date | null;
  requestedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ExportScheduleRecord {
  id: string;
  organizationId: string;
  createdBy: string;
  createdByName: string;
  name: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  frequency: ScheduleFrequency;
  status: ScheduleStatus;
  lastRunAt: Date | null;
  nextRunAt: Date;
  createdAt: Date;
}

/** A file a download hands over: only to somebody the database let through. */
export interface ExportFile {
  fileName: string;
  format: ExportFormat;
  content: string;
}

export interface RequestExportInput {
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  /**
   * The name the requester signed up with, when they gave one. Without it the
   * export records their address cut to `local@***`; the database cuts any
   * address it is handed regardless.
   */
  requesterName: string | null;
}

export interface CreateScheduleInput {
  name: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  frequency: ScheduleFrequency;
  creatorName: string | null;
}

/** One export the worker could not finish, with the exception to log. */
export interface ExportFailure {
  exportId: string;
  reason: ExportFailureReason;
  error: unknown;
}

export interface ProcessExportsReport {
  processed: number;
  succeeded: number;
  failures: ExportFailure[];
  /**
   * Exports whose failure could not be written down either. They stay where
   * they are, and the stalled sweep fails them when it finds them.
   */
  unrecorded: { exportId: string; error: unknown }[];
}

export interface ProcessSchedulesReport {
  schedulesEvaluated: number;
  exportsTriggered: number;
  failures: { scheduleId: string; error: unknown }[];
}

export interface SweepExportsReport {
  stalled: number;
  expired: number;
  failures: { exportId: string; error: unknown }[];
}

/** The input a request or schedule was given is not one the database could hold. */
export class DataExportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataExportInputError";
  }
}

/**
 * A request or a download was refused. One error for every reason, so that
 * "you may not" cannot be told from "there is no such thing" (ADR 0012).
 */
export class DataExportRefusedError extends Error {
  constructor() {
    super("that export request was refused");
    this.name = "DataExportRefusedError";
  }
}

/** A dataset has more rows than an export carries, or the file is too big. */
export class ExportTooLargeError extends Error {
  constructor(readonly dataset: string) {
    super(`the ${dataset} dataset is too large to export`);
    this.name = "ExportTooLargeError";
  }
}
