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

/**
 * A calendar day as a request carries it, `YYYY-MM-DD`. The datasets made of
 * dated rows (reservations and stays, folio lines, the audit log) are cut to
 * the days between the first and the last, both included; guests and rooms are
 * lists and are never cut.
 */
export interface ExportRange {
  from: string | null;
  to: string | null;
}

/** The datasets a range cuts. The others come whole whatever the range. */
export const RANGE_CUT_DATASETS = [
  "reservations_stays",
  "folios_payments",
  "audit_log",
] as const satisfies readonly ExportResourceType[];

/** The bounds the database holds a schedule's name to. */
export const SCHEDULE_NAME = { min: 1, max: 200 } as const;

/** The names the worker's context carries (ADR 0018). */
export const EXPORT_JOBS = {
  run: "data_export.run",
  schedule: "data_export.schedule",
  sweep: "data_export.sweep",
} as const;

/**
 * Whether the person reading an export may fetch its file, and if not which of
 * the two conditions `app.read_data_export_file()` asks is the one they fail:
 * the file is the requester's or the reader's reach is the whole Organization,
 * and the reader's role still covers every dataset in it. The function decides
 * every download; this is the same question asked early, so a row can say so
 * and not offer a button that sends the reader back with a refusal.
 */
export type ExportDownloadRight =
  "allowed" | "not_requester" | "role_lacks_datasets";

/** An export, as the list and the detail show it. Never its file. */
export interface DataExportRecord {
  id: string;
  organizationId: string;
  requesterId: string;
  requesterName: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  /** The days the dated datasets were cut to, when they were. */
  range: ExportRange | null;
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
  /** For the person who asked the module: not a fact of the export. */
  download: ExportDownloadRight;
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
  /**
   * How the schedule's latest run ended, when it failed: a paused schedule
   * whose latest run failed `requester_not_permitted` was paused for that.
   */
  lastRunError: ExportFailureReason | null;
  /** The export the schedule's latest run made, and how it stands. */
  lastRunId: string | null;
  lastRunStatus: ExportStatus | null;
  nextRunAt: Date;
  createdAt: Date;
}

/**
 * What the acting Staff Member may ask for at a Property: whether they may
 * request an export at all, and each dataset by the permission it needs. The
 * insert policy decides a request; this is the same question asked early, so a
 * form can say so instead of failing on submit.
 */
export interface ExportAbilities {
  mayCreate: boolean;
  datasets: Record<ExportResourceType, boolean>;
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
  /** Cuts the dated datasets; null or absent: every date. */
  range?: ExportRange | null;
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

/** Why a request could not be made as it was written, as a code a screen words. */
export type DataExportInputProblem =
  | "no_datasets"
  | "unknown_dataset"
  | "unknown_format"
  | "range_not_a_day"
  | "range_backwards"
  | "name_missing";

/** The input a request or schedule was given is not one the database could hold. */
export class DataExportInputError extends Error {
  constructor(
    message: string,
    readonly problem: DataExportInputProblem,
  ) {
    super(message);
    this.name = "DataExportInputError";
  }
}

/**
 * A request or a download was refused. One error for every reason, so that
 * "you may not" cannot be told from "there is no such thing" (ADR 0012).
 *
 * A request that the requester's own role cannot make carries which of the
 * datasets they named it will not cover, because that is theirs to know: it is
 * the answer to "what can I ask for", which the form shows anyway.
 */
export class DataExportRefusedError extends Error {
  constructor(readonly datasets: readonly ExportResourceType[] = []) {
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
