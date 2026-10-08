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

export type ExportStatus = "pending" | "processing" | "ready" | "failed";

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
  status: ExportStatus;
  triggerType: ExportTriggerType;
  scheduleId: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileContent: string | null;
  recordCounts: Record<string, number>;
  error: string | null;
  expiresAt: Date | null;
  requestedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ExportScheduleRecord {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  resourceTypes: ExportResourceType[];
  format: ExportFormat;
  frequency: ScheduleFrequency;
  status: ScheduleStatus;
  lastRunAt: Date | null;
  nextRunAt: Date;
  createdAt: Date;
}
