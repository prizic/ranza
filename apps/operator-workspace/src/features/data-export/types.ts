/**
 * Data export types and constants for operator workspace UI.
 *
 * Restated rather than imported from `@ranza/data-export`: nothing outside
 * `src/server/` may import a Ranza domain module (ADR 0007), as doing so
 * risks importing server/Prisma code into browser bundles and bypasses the
 * server funnel.
 */

export const EXPORT_RESOURCE_TYPES = [
  "residents_guests",
  "reservations_stays",
  "rooms_beds",
  "folios_payments",
  "audit_log",
] as const;

export type ExportResourceType = (typeof EXPORT_RESOURCE_TYPES)[number];

export type ExportFormat = "csv" | "json";

/**
 * The limits an export is held to, restated for the screen that words them.
 * `tests/unit/data-export-screen.test.ts` compares them with the module's.
 */
export const EXPORT_ROW_LIMIT = 100_000;
export const EXPORT_FILE_LIMIT_MEGABYTES = 25;
export const EXPORT_RETENTION_DAYS = 7;

/** The datasets a range of dates cuts. Guests and rooms come whole. */
export const RANGE_CUT_DATASETS: readonly ExportResourceType[] = [
  "reservations_stays",
  "folios_payments",
  "audit_log",
];

/** Everything but the rooms: the datasets that are about people or what was done to them. */
export const PERSONAL_DATASETS: readonly ExportResourceType[] = [
  "residents_guests",
  "reservations_stays",
  "folios_payments",
  "audit_log",
];

/** A calendar day, `YYYY-MM-DD`; either end of a range may be missing. */
export interface ExportRange {
  from: string | null;
  to: string | null;
}

export interface ExportAbilities {
  mayCreate: boolean;
  datasets: Record<ExportResourceType, boolean>;
}

export type ExportStatus =
  "pending" | "processing" | "ready" | "failed" | "expired";

/** Why an export failed, as a code the screen says in the reader's language. */
export type ExportFailureReason =
  "requester_not_permitted" | "too_large" | "worker_stopped" | "internal_error";

/**
 * Whether the reader may fetch a ready export's file, and which condition they
 * fail when they may not. Asked of the database's own rule when the list is
 * read, so the row can say so before the click.
 */
export type ExportDownloadRight =
  "allowed" | "not_requester" | "role_lacks_datasets";

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type ScheduleStatus = "active" | "paused";

export type ExportTriggerType = "on_demand" | "scheduled";

export interface DataExportRecord {
  id: string;
  organizationId: string;
  requesterId: string;
  requesterName: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
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
  lastRunError: ExportFailureReason | null;
  /** The export the latest run made, which History lists, and how it stands. */
  lastRunId: string | null;
  lastRunStatus: ExportStatus | null;
  nextRunAt: Date;
  createdAt: Date;
}
