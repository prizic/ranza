import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import type {
  CreateScheduleInput,
  DataExportRecord,
  ExportFormat,
  ExportResourceType,
  ExportScheduleRecord,
  ExportStatus,
  ExportTriggerType,
  ProcessExportsReport,
  ProcessSchedulesReport,
  RequestExportInput,
  ScheduleFrequency,
  ScheduleStatus,
} from "./contracts";
import type { DataExportDeps } from "./ports";

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
  file_content: string | null;
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
    fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : null,
    fileContent: row.file_content,
    recordCounts:
      typeof row.record_counts === "object" && row.record_counts !== null
        ? (row.record_counts as Record<string, number>)
        : {},
    error: row.error,
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

function computeNextRun(frequency: ScheduleFrequency): Date {
  const next = new Date();
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function toCsvString(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h])).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

export function createDataExportModule({ db }: DataExportDeps) {
  return {
    /**
     * Lists recent data exports for the user's organization.
     */
    async listExports(userId: string): Promise<DataExportRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<RawDataExport[]>`
          select id, organization_id, requester_id, requester_name, resource_types,
                 format, status, trigger_type, schedule_id, file_name, file_size_bytes,
                 file_content, record_counts, error, expires_at, requested_at,
                 completed_at, created_at
            from public.data_exports
           order by requested_at desc
           limit 50
        `;
        return rows.map(mapDataExport);
      });
    },

    /**
     * Fetches a single data export by ID.
     */
    async getExport(
      userId: string,
      exportId: string,
    ): Promise<DataExportRecord | null> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<RawDataExport[]>`
          select id, organization_id, requester_id, requester_name, resource_types,
                 format, status, trigger_type, schedule_id, file_name, file_size_bytes,
                 file_content, record_counts, error, expires_at, requested_at,
                 completed_at, created_at
            from public.data_exports
           where id = ${exportId}::uuid
           limit 1
        `;
        if (rows.length === 0 || !rows[0]) return null;
        return mapDataExport(rows[0]);
      });
    },

    /**
     * Creates an on-demand data export request with status 'pending'.
     */
    async requestExport(
      userId: string,
      input: RequestExportInput,
    ): Promise<DataExportRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        // Resolve user name and organization
        const [user] = await client.$queryRaw<{ email: string }[]>`
          select email from public.users where id = ${userId}::uuid
        `;
        const requesterName = user?.email || "Staff Member";

        const [membership] = await client.$queryRaw<
          { organization_id: string }[]
        >`
          select organization_id from public.organization_memberships
           where user_id = ${userId}::uuid
             and status = 'active'
           limit 1
        `;

        if (!membership) {
          throw new Error("User has no active organization membership");
        }

        const orgId = membership.organization_id;
        const resourceTypesArray = input.resourceTypes;

        const [created] = await client.$queryRaw<RawDataExport[]>`
          insert into public.data_exports (
            organization_id, requester_id, requester_name, resource_types,
            format, status, trigger_type
          ) values (
            ${orgId}::uuid, ${userId}::uuid, ${requesterName}, ${resourceTypesArray}::text[],
            ${input.format}, 'pending', 'on_demand'
          )
          returning id, organization_id, requester_id, requester_name, resource_types,
                    format, status, trigger_type, schedule_id, file_name, file_size_bytes,
                    file_content, record_counts, error, expires_at, requested_at,
                    completed_at, created_at
        `;

        if (!created) {
          throw new Error("Failed to create export record");
        }
        return mapDataExport(created);
      });
    },

    /**
     * Lists export schedules for the user's organization.
     */
    async listSchedules(userId: string): Promise<ExportScheduleRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<RawExportSchedule[]>`
          select id, organization_id, created_by, name, resource_types,
                 format, frequency, status, last_run_at, next_run_at, created_at
            from public.export_schedules
           order by created_at desc
        `;
        return rows.map(mapExportSchedule);
      });
    },

    /**
     * Creates an automated export schedule.
     */
    async createSchedule(
      userId: string,
      input: CreateScheduleInput,
    ): Promise<ExportScheduleRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const [membership] = await client.$queryRaw<
          { organization_id: string }[]
        >`
          select organization_id from public.organization_memberships
           where user_id = ${userId}::uuid
             and status = 'active'
           limit 1
        `;

        if (!membership) {
          throw new Error("User has no active organization membership");
        }

        const orgId = membership.organization_id;
        const nextRunAt = computeNextRun(input.frequency);
        const resourceTypesArray = input.resourceTypes;

        const [created] = await client.$queryRaw<RawExportSchedule[]>`
          insert into public.export_schedules (
            organization_id, created_by, name, resource_types,
            format, frequency, status, next_run_at
          ) values (
            ${orgId}::uuid, ${userId}::uuid, ${input.name}, ${resourceTypesArray}::text[],
            ${input.format}, ${input.frequency}, 'active', ${nextRunAt}
          )
          returning id, organization_id, created_by, name, resource_types,
                    format, frequency, status, last_run_at, next_run_at, created_at
        `;

        if (!created) {
          throw new Error("Failed to create export schedule");
        }
        return mapExportSchedule(created);
      });
    },

    /**
     * Updates an export schedule's active/paused status.
     */
    async updateScheduleStatus(
      userId: string,
      scheduleId: string,
      status: ScheduleStatus,
    ): Promise<void> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        await client.$executeRaw`
          update public.export_schedules
             set status = ${status}, updated_at = now()
           where id = ${scheduleId}::uuid
        `;
      });
    },

    /**
     * Worker routine to process all pending data exports.
     */
    async processPendingExports(): Promise<ProcessExportsReport> {
      const pending = await db.$queryRaw<
        { export_id: string; organization_id: string }[]
      >`
        select export_id, organization_id from app.pending_data_exports()
      `;

      let succeeded = 0;
      let failed = 0;

      for (const item of pending) {
        try {
          await db.$transaction(async (tx) => {
            const client = tx as unknown as PrismaClient;
            await client.$executeRawUnsafe(
              "select app.set_worker_context($1::uuid, 'data_export')",
              item.organization_id,
            );

            // Fetch export request
            const [exportRow] = await client.$queryRaw<RawDataExport[]>`
              select id, organization_id, requester_id, requester_name, resource_types,
                     format, status, trigger_type, schedule_id, file_name, file_size_bytes,
                     file_content, record_counts, error, expires_at, requested_at,
                     completed_at, created_at
                from public.data_exports
               where id = ${item.export_id}::uuid
            `;

            if (!exportRow || exportRow.status !== "pending") {
              return;
            }

            // Move to processing
            await client.$executeRaw`
              update public.data_exports
                 set status = 'processing', updated_at = now()
               where id = ${item.export_id}::uuid
            `;

            const resourceTypes =
              exportRow.resource_types as ExportResourceType[];
            const format = exportRow.format as ExportFormat;
            const exportData: Record<string, Record<string, unknown>[]> = {};
            const recordCounts: Record<string, number> = {};

            // 1. Residents & Guests
            if (resourceTypes.includes("residents_guests")) {
              const guests = await client.$queryRaw<Record<string, unknown>[]>`
                select id, first_name as "firstName", last_name as "lastName",
                       email, phone, nationality, identification_number as "idNumber",
                       created_at as "createdAt"
                  from public.guests
                 where organization_id = ${item.organization_id}::uuid
                 order by created_at desc
              `;
              exportData.residents_guests = guests;
              recordCounts.residents_guests = guests.length;
            }

            // 2. Reservations & Stays
            if (resourceTypes.includes("reservations_stays")) {
              const reservations = await client.$queryRaw<
                Record<string, unknown>[]
              >`
                select r.id, r.confirmation_code as "confirmationCode",
                       r.status, r.arrival_date as "arrivalDate",
                       r.departure_date as "departureDate",
                       s.id as "stayId", s.status as "stayStatus"
                  from public.reservations r
                  left join public.stays s on s.reservation_id = r.id
                 where r.organization_id = ${item.organization_id}::uuid
                 order by r.created_at desc
              `;
              exportData.reservations_stays = reservations;
              recordCounts.reservations_stays = reservations.length;
            }

            // 3. Rooms & Beds
            if (resourceTypes.includes("rooms_beds")) {
              const rooms = await client.$queryRaw<Record<string, unknown>[]>`
                select id, property_id as "propertyId", unit_number as "unitNumber",
                       unit_type as "unitType", floor_number as "floorNumber",
                       status, max_occupancy as "maxOccupancy"
                  from public.accommodation_units
                 where organization_id = ${item.organization_id}::uuid
                 order by unit_number asc
              `;
              exportData.rooms_beds = rooms;
              recordCounts.rooms_beds = rooms.length;
            }

            // 4. Folios & Payments
            if (resourceTypes.includes("folios_payments")) {
              const folios = await client.$queryRaw<Record<string, unknown>[]>`
                select f.id, f.property_id as "propertyId", f.status,
                       f.currency, fl.id as "lineId", fl.line_type as "lineType",
                       fl.amount, fl.posted_at as "postedAt"
                  from public.folios f
                  left join public.folio_lines fl on fl.folio_id = f.id
                 where f.organization_id = ${item.organization_id}::uuid
                 order by f.created_at desc
              `;
              exportData.folios_payments = folios;
              recordCounts.folios_payments = folios.length;
            }

            // 5. Audit Log
            if (resourceTypes.includes("audit_log")) {
              const logs = await client.$queryRaw<Record<string, unknown>[]>`
                select id, action, actor_user_id as "actorUserId",
                       actor_type as "actorType", location,
                       occurred_at as "occurredAt"
                  from audit.events
                 where organization_id = ${item.organization_id}::uuid
                 order by occurred_at desc
                 limit 1000
              `;
              exportData.audit_log = logs;
              recordCounts.audit_log = logs.length;
            }

            // Format payload
            let fileContent: string;
            let fileName: string;
            const shortId = item.export_id.slice(0, 8);

            if (format === "json") {
              fileContent = JSON.stringify(exportData, null, 2);
              fileName = `export-${shortId}.json`;
            } else {
              // CSV format
              const sections: string[] = [];
              for (const [key, rows] of Object.entries(exportData)) {
                sections.push(
                  `--- DATASET: ${key} (${rows.length} records) ---`,
                );
                if (rows.length > 0 && rows[0]) {
                  const headers = Object.keys(rows[0]);
                  sections.push(toCsvString(headers, rows));
                } else {
                  sections.push("No records");
                }
                sections.push("\n");
              }
              fileContent = sections.join("\n");
              fileName = `export-${shortId}.csv`;
            }

            const fileSizeBytes = Buffer.byteLength(fileContent, "utf8");
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7-day retention

            await client.$executeRaw`
              update public.data_exports
                 set status = 'ready',
                     file_name = ${fileName},
                     file_size_bytes = ${fileSizeBytes}::bigint,
                     file_content = ${fileContent},
                     record_counts = ${JSON.stringify(recordCounts)}::jsonb,
                     completed_at = now(),
                     expires_at = ${expiresAt},
                     updated_at = now()
               where id = ${item.export_id}::uuid
            `;
          });
          succeeded++;
        } catch (err) {
          failed++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          await db.$executeRaw`
            update public.data_exports
               set status = 'failed',
                   error = ${errorMessage},
                   updated_at = now()
             where id = ${item.export_id}::uuid
          `.catch(() => {});
        }
      }

      return {
        processed: pending.length,
        succeeded,
        failed,
      };
    },

    /**
     * Worker routine to evaluate due export schedules and trigger exports.
     */
    async processDueSchedules(): Promise<ProcessSchedulesReport> {
      const due = await db.$queryRaw<
        { schedule_id: string; organization_id: string }[]
      >`
        select schedule_id, organization_id from app.export_schedules_due()
      `;

      let exportsTriggered = 0;

      for (const item of due) {
        try {
          await db.$transaction(async (tx) => {
            const client = tx as unknown as PrismaClient;
            await client.$executeRawUnsafe(
              "select app.set_worker_context($1::uuid, 'data_export')",
              item.organization_id,
            );

            const [schedule] = await client.$queryRaw<RawExportSchedule[]>`
              select id, organization_id, created_by, name, resource_types,
                     format, frequency, status, last_run_at, next_run_at, created_at
                from public.export_schedules
               where id = ${item.schedule_id}::uuid
            `;

            if (!schedule || schedule.status !== "active") return;

            const nextRunAt = computeNextRun(
              schedule.frequency as ScheduleFrequency,
            );

            // Create triggered export record
            await client.$executeRaw`
              insert into public.data_exports (
                organization_id, requester_id, requester_name, resource_types,
                format, status, trigger_type, schedule_id
              ) values (
                ${item.organization_id}::uuid, ${schedule.created_by}::uuid,
                ${"Scheduled (" + schedule.name + ")"},
                ${schedule.resource_types}::text[],
                ${schedule.format}, 'pending', 'scheduled', ${schedule.id}::uuid
              )
            `;

            // Update schedule next run
            await client.$executeRaw`
              update public.export_schedules
                 set last_run_at = now(),
                     next_run_at = ${nextRunAt},
                     updated_at = now()
               where id = ${schedule.id}::uuid
            `;

            exportsTriggered++;
          });
        } catch {
          // Continue to next schedule on error
        }
      }

      return {
        schedulesEvaluated: due.length,
        exportsTriggered,
      };
    },
  };
}
