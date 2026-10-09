import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  DataExportInputError,
  DataExportRefusedError,
  EXPORT_FORMATS,
  EXPORT_RESOURCE_TYPES,
  SCHEDULE_NAME,
  type CreateScheduleInput,
  type DataExportRecord,
  type ExportFailureReason,
  type ExportFile,
  type ExportFormat,
  type ExportResourceType,
  type ExportScheduleRecord,
  type ExportStatus,
  type ExportTriggerType,
  type RequestExportInput,
  type ScheduleFrequency,
  type ScheduleStatus,
} from "./contracts";
import { requesterLabel } from "./label";
import type { DataExportDeps } from "./ports";

/**
 * The Staff Member's half of exporting (ADR 0043).
 *
 * A request is an insert of what was asked for and nothing else; the database
 * stamps the rest, and a job outside this process moves it on. Nothing here
 * decides whether somebody may ask for a dataset, or whether they may have the
 * file: the insert policy and `app.read_data_export_file()` do, and a refusal
 * is the database's, surfaced as one error that cannot be told from there
 * being nothing (ADR 0012).
 *
 * The list never selects a file. The runtime role has no SELECT on the column,
 * so this module could not read one by mistake.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";

/** Whether a failure carries a SQLSTATE, from the driver's meta and its message. */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

interface RawDataExport {
  id: string;
  organization_id: string;
  requester_id: string;
  requester_name: string;
  resource_types: string[];
  format: string;
  status: string;
  trigger_type: string;
  schedule_id: string | null;
  file_name: string | null;
  file_size_bytes: string | number | bigint | null;
  record_counts: unknown;
  error: string | null;
  expires_at: Date | null;
  requested_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

interface RawExportSchedule {
  id: string;
  organization_id: string;
  created_by: string;
  created_by_name: string;
  name: string;
  resource_types: string[];
  format: string;
  frequency: string;
  status: string;
  last_run_at: Date | null;
  next_run_at: Date;
  created_at: Date;
}

function mapDataExport(row: RawDataExport): DataExportRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    resourceTypes: row.resource_types as ExportResourceType[],
    format: row.format as ExportFormat,
    status: row.status as ExportStatus,
    triggerType: row.trigger_type as ExportTriggerType,
    scheduleId: row.schedule_id,
    fileName: row.file_name,
    fileSizeBytes:
      row.file_size_bytes === null ? null : Number(row.file_size_bytes),
    recordCounts:
      typeof row.record_counts === "object" && row.record_counts !== null
        ? (row.record_counts as Record<string, number>)
        : {},
    error: row.error as ExportFailureReason | null,
    expiresAt: row.expires_at,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapExportSchedule(row: RawExportSchedule): ExportScheduleRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    name: row.name,
    resourceTypes: row.resource_types as ExportResourceType[],
    format: row.format as ExportFormat,
    frequency: row.frequency as ScheduleFrequency,
    status: row.status as ScheduleStatus,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  };
}

/** Datasets and format as the database would hold them, or the reason it would not. */
function assertRequest(resourceTypes: readonly string[], format: string): void {
  if (resourceTypes.length === 0) {
    throw new DataExportInputError("at least one dataset must be chosen");
  }
  const known: readonly string[] = EXPORT_RESOURCE_TYPES;
  if (
    resourceTypes.some((type) => !known.includes(type)) ||
    new Set(resourceTypes).size !== resourceTypes.length
  ) {
    throw new DataExportInputError(
      "the datasets chosen are not a set of known ones",
    );
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new DataExportInputError("that format is not offered");
  }
}

/** The Organization of a Property the acting Staff Member reaches, or a refusal. */
async function organizationOf(
  tx: AuditClient,
  propertyId: string,
): Promise<string> {
  const [property] = await tx.$queryRaw<{ organization_id: string }[]>`
    select organization_id from public.properties
     where id = ${propertyId}::uuid`;
  if (!property) throw new DataExportRefusedError();
  return property.organization_id;
}

async function emailOf(tx: AuditClient, userId: string): Promise<string> {
  const [user] = await tx.$queryRaw<{ email: string }[]>`
    select email from public.users where id = ${userId}::uuid`;
  if (!user) throw new DataExportRefusedError();
  return user.email;
}

export function createDataExportModule({ db }: DataExportDeps) {
  return {
    /**
     * The Organization's recent exports, newest first: who asked, what, and how
     * it ended. The Organization is the one the Property belongs to, so a Staff
     * Member in two sees one at a time.
     */
    async listExports(
      userId: string,
      propertyId: string,
    ): Promise<DataExportRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const rows = await tx.$queryRaw<RawDataExport[]>`
          select id, organization_id, requester_id, requester_name, resource_types,
                 format, status, trigger_type, schedule_id, file_name,
                 file_size_bytes, record_counts, error, expires_at,
                 requested_at, completed_at, created_at
            from public.data_exports
           where organization_id = (
                   select organization_id from public.properties
                    where id = ${propertyId}::uuid)
           order by requested_at desc, id
           limit 50`;
        return rows.map(mapDataExport);
      });
    },

    /** One export, without its file. */
    async getExport(
      userId: string,
      exportId: string,
    ): Promise<DataExportRecord | null> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const [row] = await tx.$queryRaw<RawDataExport[]>`
          select id, organization_id, requester_id, requester_name, resource_types,
                 format, status, trigger_type, schedule_id, file_name,
                 file_size_bytes, record_counts, error, expires_at,
                 requested_at, completed_at, created_at
            from public.data_exports
           where id = ${exportId}::uuid`;
        return row ? mapDataExport(row) : null;
      });
    },

    /**
     * Asks for an export of an Organization's data, and records that it was
     * asked. Nothing is produced here: the request is pending until the worker
     * claims it, and is refused now if the requester could not export a dataset
     * they named.
     */
    async requestExport(
      userId: string,
      propertyId: string,
      input: RequestExportInput,
    ): Promise<DataExportRecord> {
      assertRequest(input.resourceTypes, input.format);
      return withOrganizationContext(db, { userId }, async (tx) => {
        const organizationId = await organizationOf(tx, propertyId);
        const requesterName = requesterLabel(
          input.requesterName,
          await emailOf(tx, userId),
        );

        let created: RawDataExport | undefined;
        try {
          [created] = await tx.$queryRaw<RawDataExport[]>`
            insert into public.data_exports
              (organization_id, requester_id, requester_name, resource_types, format)
            values
              (${organizationId}::uuid, ${userId}::uuid, ${requesterName},
               ${input.resourceTypes}::text[], ${input.format})
            returning id, organization_id, requester_id, requester_name,
                      resource_types, format, status, trigger_type, schedule_id,
                      file_name, file_size_bytes, record_counts, error,
                      expires_at, requested_at, completed_at, created_at`;
        } catch (error) {
          if (raised(error, INSUFFICIENT_PRIVILEGE)) {
            throw new DataExportRefusedError();
          }
          throw error;
        }
        if (!created) throw new DataExportRefusedError();

        await recordWithin(tx, {
          organizationId,
          actorId: userId,
          action: "data_export.requested",
          subjectType: "data_export",
          subjectId: created.id,
          context: {
            resourceTypes: input.resourceTypes,
            format: input.format,
          },
        });
        return mapDataExport(created);
      });
    },

    /**
     * The file of a ready export, to whoever the database lets have it, and a
     * record in the audit log that they did. Both happen in one transaction: a
     * file is never handed over unrecorded. Null for every reason there is no
     * file for this person — not theirs, not ready, expired, never existed.
     */
    async downloadExport(
      userId: string,
      exportId: string,
    ): Promise<ExportFile | null> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const [file] = await tx.$queryRaw<
          {
            organization_id: string;
            file_name: string;
            format: ExportFormat;
            file_content: string;
            resource_types: string[];
          }[]
        >`
          select organization_id, file_name, format, file_content, resource_types
            from app.read_data_export_file(${exportId}::uuid)`;
        if (!file) return null;

        await recordWithin(tx, {
          organizationId: file.organization_id,
          actorId: userId,
          action: "data_export.downloaded",
          subjectType: "data_export",
          subjectId: exportId,
          context: {
            resourceTypes: file.resource_types,
            format: file.format,
            bytes: Buffer.byteLength(file.file_content, "utf8"),
          },
        });
        return {
          fileName: file.file_name,
          format: file.format,
          content: file.file_content,
        };
      });
    },

    /** The Organization's export schedules. */
    async listSchedules(
      userId: string,
      propertyId: string,
    ): Promise<ExportScheduleRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const rows = await tx.$queryRaw<RawExportSchedule[]>`
          select id, organization_id, created_by, created_by_name, name,
                 resource_types, format, frequency, status, last_run_at,
                 next_run_at, created_at
            from public.export_schedules
           where organization_id = (
                   select organization_id from public.properties
                    where id = ${propertyId}::uuid)
           order by created_at desc, id`;
        return rows.map(mapExportSchedule);
      });
    },

    /**
     * Sets up an export that repeats. Its first run is one step from now, and
     * every run is checked as its creator is when it runs, not when it was set
     * up (ADR 0043).
     */
    async createSchedule(
      userId: string,
      propertyId: string,
      input: CreateScheduleInput,
    ): Promise<ExportScheduleRecord> {
      assertRequest(input.resourceTypes, input.format);
      const name = input.name.trim();
      if (name.length < SCHEDULE_NAME.min || name.length > SCHEDULE_NAME.max) {
        throw new DataExportInputError("a schedule needs a name");
      }
      return withOrganizationContext(db, { userId }, async (tx) => {
        const organizationId = await organizationOf(tx, propertyId);
        const creatorName = requesterLabel(
          input.creatorName,
          await emailOf(tx, userId),
        );

        let created: RawExportSchedule | undefined;
        try {
          [created] = await tx.$queryRaw<RawExportSchedule[]>`
            insert into public.export_schedules
              (organization_id, created_by, created_by_name, name,
               resource_types, format, frequency)
            values
              (${organizationId}::uuid, ${userId}::uuid, ${creatorName}, ${name},
               ${input.resourceTypes}::text[], ${input.format}, ${input.frequency})
            returning id, organization_id, created_by, created_by_name, name,
                      resource_types, format, frequency, status, last_run_at,
                      next_run_at, created_at`;
        } catch (error) {
          if (
            raised(error, INSUFFICIENT_PRIVILEGE) ||
            raised(error, CHECK_VIOLATION)
          ) {
            throw new DataExportRefusedError();
          }
          throw error;
        }
        if (!created) throw new DataExportRefusedError();
        return mapExportSchedule(created);
      });
    },

    /** Pauses a schedule or resumes it. The only change a schedule takes. */
    async updateScheduleStatus(
      userId: string,
      scheduleId: string,
      status: ScheduleStatus,
    ): Promise<void> {
      await withOrganizationContext(db, { userId }, async (tx) => {
        const changed = await tx.$queryRaw<{ id: string }[]>`
          update public.export_schedules
             set status = ${status}, updated_at = now()
           where id = ${scheduleId}::uuid
          returning id`;
        // A policy that refuses an update matches no row rather than raising
        // (ADR 0012), so "no row" is the refusal.
        if (changed.length === 0) throw new DataExportRefusedError();
      });
    },
  };
}

export type DataExportModule = ReturnType<typeof createDataExportModule>;
