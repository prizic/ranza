import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  DATA_EXPORT_CREATE_PERMISSION,
  DataExportInputError,
  DataExportRefusedError,
  EXPORT_FORMATS,
  EXPORT_RESOURCE_TYPES,
  SCHEDULE_NAME,
  type CreateScheduleInput,
  type DataExportRecord,
  type ExportAbilities,
  type ExportDownloadRight,
  type ExportRange,
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
  range_from: string | null;
  range_to: string | null;
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
  /** The two conditions of a download, asked of the reader (`downloadRightOf`). */
  is_requester_or_wide: boolean;
  role_covers_datasets: boolean;
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
  /** Read with the list; a schedule just inserted has no run to report. */
  last_run_error?: string | null;
  last_run_id?: string | null;
  last_run_status?: string | null;
  next_run_at: Date;
  created_at: Date;
}

function downloadRightOf(row: RawDataExport): ExportDownloadRight {
  if (!row.is_requester_or_wide) return "not_requester";
  return row.role_covers_datasets ? "allowed" : "role_lacks_datasets";
}

function mapDataExport(row: RawDataExport): DataExportRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    resourceTypes: row.resource_types as ExportResourceType[],
    format: row.format as ExportFormat,
    range:
      row.range_from === null && row.range_to === null
        ? null
        : { from: row.range_from, to: row.range_to },
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
    download: downloadRightOf(row),
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
    lastRunError: (row.last_run_error ?? null) as ExportFailureReason | null,
    lastRunId: row.last_run_id ?? null,
    lastRunStatus: (row.last_run_status ?? null) as ExportStatus | null,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  };
}

/** Datasets and format as the database would hold them, or the reason it would not. */
function assertRequest(resourceTypes: readonly string[], format: string): void {
  if (resourceTypes.length === 0) {
    throw new DataExportInputError(
      "at least one dataset must be chosen",
      "no_datasets",
    );
  }
  const known: readonly string[] = EXPORT_RESOURCE_TYPES;
  if (
    resourceTypes.some((type) => !known.includes(type)) ||
    new Set(resourceTypes).size !== resourceTypes.length
  ) {
    throw new DataExportInputError(
      "the datasets chosen are not a set of known ones",
      "unknown_dataset",
    );
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new DataExportInputError(
      "that format is not offered",
      "unknown_format",
    );
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `YYYY-MM-DD` names a day that exists, which `2026-02-30` does not. */
function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

/**
 * The days a request names, as the database would hold them: real days, the
 * first not after the last, and none at all when neither is given.
 */
function assertRange(
  range: ExportRange | null | undefined,
): ExportRange | null {
  const from = range?.from || null;
  const to = range?.to || null;
  if (from === null && to === null) return null;
  if ((from !== null && !isDay(from)) || (to !== null && !isDay(to))) {
    throw new DataExportInputError(
      "a range is made of days",
      "range_not_a_day",
    );
  }
  if (from !== null && to !== null && from > to) {
    throw new DataExportInputError(
      "a range cannot end before it starts",
      "range_backwards",
    );
  }
  return { from, to };
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

/**
 * What the acting Staff Member may ask for in an Organization, from the same
 * functions the insert policy asks (`app.has_organization_permission`,
 * `app.may_export`): so that a refusal can name what it will not cover, and a
 * form can say so before it is pressed. The policy still decides every request;
 * this decides nothing.
 */
async function abilitiesWithin(
  tx: AuditClient,
  organizationId: string,
): Promise<ExportAbilities> {
  const rows = await tx.$queryRaw<{ resource: string; allowed: boolean }[]>`
    select resource, app.may_export(${organizationId}::uuid, array[resource]) as allowed
      from unnest(${[...EXPORT_RESOURCE_TYPES]}::text[]) as resource`;
  const [create] = await tx.$queryRaw<{ allowed: boolean }[]>`
    select app.has_organization_permission(
             ${organizationId}::uuid, ${DATA_EXPORT_CREATE_PERMISSION}) as allowed`;
  const mayCreate = create?.allowed === true;
  const allowedBy = new Map(rows.map((row) => [row.resource, row.allowed]));
  return {
    mayCreate,
    datasets: Object.fromEntries(
      EXPORT_RESOURCE_TYPES.map((type) => [
        type,
        mayCreate && allowedBy.get(type) === true,
      ]),
    ) as ExportAbilities["datasets"],
  };
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
                 format, range_from::text as range_from, range_to::text as range_to,
                 status, trigger_type, schedule_id, file_name,
                 file_size_bytes, record_counts, error, expires_at,
                 requested_at, completed_at, created_at,
                 (requester_id = app.current_user_id()
                    or app.has_organization_wide_reach(organization_id))
                   as is_requester_or_wide,
                 app.may_export(organization_id, resource_types)
                   as role_covers_datasets
            from public.data_exports
           where organization_id = (
                   select organization_id from public.properties
                    where id = ${propertyId}::uuid)
           order by requested_at desc, id
           limit 50`;
        return rows.map(mapDataExport);
      });
    },

    /**
     * What the acting Staff Member may ask for from this Property: asked of the
     * same functions the insert policy asks, so a form can say which datasets
     * it will refuse before anybody presses it.
     */
    async exportAbilities(
      userId: string,
      propertyId: string,
    ): Promise<ExportAbilities> {
      return withOrganizationContext(db, { userId }, async (tx) =>
        abilitiesWithin(tx, await organizationOf(tx, propertyId)),
      );
    },

    /** One export, without its file. */
    async getExport(
      userId: string,
      exportId: string,
    ): Promise<DataExportRecord | null> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const [row] = await tx.$queryRaw<RawDataExport[]>`
          select id, organization_id, requester_id, requester_name, resource_types,
                 format, range_from::text as range_from, range_to::text as range_to,
                 status, trigger_type, schedule_id, file_name,
                 file_size_bytes, record_counts, error, expires_at,
                 requested_at, completed_at, created_at,
                 (requester_id = app.current_user_id()
                    or app.has_organization_wide_reach(organization_id))
                   as is_requester_or_wide,
                 app.may_export(organization_id, resource_types)
                   as role_covers_datasets
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
      const range = assertRange(input.range);
      return withOrganizationContext(db, { userId }, async (tx) => {
        const organizationId = await organizationOf(tx, propertyId);
        const requesterName = requesterLabel(
          input.requesterName,
          await emailOf(tx, userId),
        );

        // Asked before the insert, because a refused insert aborts the
        // transaction and leaves nothing to ask afterwards. The policy below
        // still decides; this only learns what to say.
        const abilities = await abilitiesWithin(tx, organizationId);
        const uncovered = input.resourceTypes.filter(
          (type) => !abilities.datasets[type],
        );
        if (uncovered.length > 0) throw new DataExportRefusedError(uncovered);

        // The days mean the clock of the Property the request is made from,
        // as the audit screen's date filter does.
        const [property] = range
          ? await tx.$queryRaw<{ timezone: string }[]>`
              select timezone from public.properties
               where id = ${propertyId}::uuid`
          : [];

        let created: RawDataExport | undefined;
        try {
          [created] = await tx.$queryRaw<RawDataExport[]>`
            insert into public.data_exports
              (organization_id, requester_id, requester_name, resource_types,
               format, range_from, range_to, range_timezone)
            values
              (${organizationId}::uuid, ${userId}::uuid, ${requesterName},
               ${input.resourceTypes}::text[], ${input.format},
               ${range?.from ?? null}::date, ${range?.to ?? null}::date,
               ${range ? (property?.timezone ?? "UTC") : null})
            returning id, organization_id, requester_id, requester_name,
                      resource_types, format, range_from::text as range_from,
                      range_to::text as range_to, status, trigger_type,
                      schedule_id, file_name, file_size_bytes, record_counts,
                      error, expires_at, requested_at, completed_at, created_at,
                      (requester_id = app.current_user_id()
                         or app.has_organization_wide_reach(organization_id))
                        as is_requester_or_wide,
                      app.may_export(organization_id, resource_types)
                        as role_covers_datasets`;
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
            ...(range?.from ? { rangeFrom: range.from } : {}),
            ...(range?.to ? { rangeTo: range.to } : {}),
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
          select schedule.id, schedule.organization_id, schedule.created_by,
                 schedule.created_by_name, schedule.name, schedule.resource_types,
                 schedule.format, schedule.frequency, schedule.status,
                 schedule.last_run_at,
                 latest.id as last_run_id, latest.status as last_run_status,
                 latest.error as last_run_error,
                 schedule.next_run_at, schedule.created_at
            from public.export_schedules as schedule
            left join lateral (
                   select run.id, run.status, run.error
                     from public.data_exports as run
                    where run.schedule_id = schedule.id
                    order by run.requested_at desc, run.id
                    limit 1) as latest on true
           where schedule.organization_id = (
                   select organization_id from public.properties
                    where id = ${propertyId}::uuid)
           order by schedule.created_at desc, schedule.id`;
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
        throw new DataExportInputError(
          "a schedule needs a name",
          "name_missing",
        );
      }
      return withOrganizationContext(db, { userId }, async (tx) => {
        const organizationId = await organizationOf(tx, propertyId);
        const creatorName = requesterLabel(
          input.creatorName,
          await emailOf(tx, userId),
        );

        const abilities = await abilitiesWithin(tx, organizationId);
        const uncovered = input.resourceTypes.filter(
          (type) => !abilities.datasets[type],
        );
        if (uncovered.length > 0) throw new DataExportRefusedError(uncovered);

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
