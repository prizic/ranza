import {
  EXPORT_ROW_LIMIT,
  ExportTooLargeError,
  type ExportResourceType,
} from "./contracts";
import type { ExportClient } from "./ports";

/**
 * What each dataset is written with, and the one database function that reads
 * it for an export's requester (`20260916010710`).
 *
 * The columns are listed here and not discovered from the first row, so that a
 * dataset with no rows is still a file with its header. Each function filters
 * to what the requester could read in the workspace, as they are now, and
 * refuses when they no longer may export that dataset; nothing here narrows or
 * widens that.
 *
 * Dates are read as text (`YYYY-MM-DD`): a calendar date is not an instant, and
 * a driver that turns one into a `Date` moves it by a day for somebody west of
 * the meridian.
 */
export interface DatasetReader {
  key: ExportResourceType;
  columns: readonly string[];
  read(tx: ExportClient, exportId: string): Promise<Record<string, unknown>[]>;
}

type Rows = Record<string, unknown>[];

export const DATASETS: Record<ExportResourceType, DatasetReader> = {
  residents_guests: {
    key: "residents_guests",
    columns: ["id", "full_name", "email", "phone", "created_at"],
    read: (tx, exportId) => tx.$queryRaw<Rows>`
      select id, full_name, email, phone, created_at
        from app.export_guests(${exportId}::uuid)`,
  },
  reservations_stays: {
    key: "reservations_stays",
    columns: [
      "reservation_id",
      "reference",
      "reservation_status",
      "stay_type",
      "property_id",
      "unit_id",
      "unit_name",
      "guest_id",
      "guest_name",
      "starts_on",
      "ends_on",
      "nightly_rate_minor",
      "rate_currency",
      "stay_id",
      "stay_status",
      "stay_unit_id",
      "stay_starts_on",
      "stay_ends_on",
      "departed_at",
      "created_at",
    ],
    read: (tx, exportId) => tx.$queryRaw<Rows>`
      select reservation_id, reference, reservation_status, stay_type,
             property_id, unit_id, unit_name, guest_id, guest_name,
             starts_on::text as starts_on, ends_on::text as ends_on,
             nightly_rate_minor, rate_currency, stay_id, stay_status,
             stay_unit_id, stay_starts_on::text as stay_starts_on,
             stay_ends_on::text as stay_ends_on, departed_at, created_at
        from app.export_reservations(${exportId}::uuid)`,
  },
  rooms_beds: {
    key: "rooms_beds",
    columns: [
      "id",
      "property_id",
      "parent_id",
      "name",
      "unit_type",
      "building",
      "floor",
      "capacity",
      "status",
      "status_reason",
      "created_at",
    ],
    read: (tx, exportId) => tx.$queryRaw<Rows>`
      select id, property_id, parent_id, name, unit_type, building, floor,
             capacity, status, status_reason, created_at
        from app.export_units(${exportId}::uuid)`,
  },
  folios_payments: {
    key: "folios_payments",
    columns: [
      "folio_id",
      "property_id",
      "stay_id",
      "currency",
      "folio_status",
      "folio_closed_at",
      "line_id",
      "line_type",
      "description",
      "amount_minor",
      "payment_method",
      "reverses_line_id",
      "source",
      "business_date",
      "posted_at",
    ],
    read: (tx, exportId) => tx.$queryRaw<Rows>`
      select folio_id, property_id, stay_id, currency, folio_status,
             folio_closed_at, line_id, line_type, description, amount_minor,
             payment_method, reverses_line_id, source,
             business_date::text as business_date, posted_at
        from app.export_folio_lines(${exportId}::uuid)`,
  },
  audit_log: {
    key: "audit_log",
    columns: [
      "id",
      "occurred_at",
      "location_id",
      "actor_id",
      "action",
      "subject_type",
      "subject_id",
      "reason",
      "context",
    ],
    read: (tx, exportId) => tx.$queryRaw<Rows>`
      select id, occurred_at, location_id, actor_id, action, subject_type,
             subject_id, reason, context
        from app.export_audit_records(${exportId}::uuid)`,
  },
};

/**
 * Reads a dataset, refusing to hand back one that was cut off. The function
 * returns one row more than the limit so "exactly the limit" and "more" can be
 * told apart; an export that would be short fails as `too_large` instead.
 */
export async function readDataset(
  tx: ExportClient,
  key: ExportResourceType,
  exportId: string,
): Promise<Rows> {
  const rows = await DATASETS[key].read(tx, exportId);
  if (rows.length > EXPORT_ROW_LIMIT) throw new ExportTooLargeError(key);
  return rows;
}
