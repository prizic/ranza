"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  DataExportInputError,
  DataExportRefusedError,
  type DataExportRecord,
  type ExportFormat,
  type ExportResourceType,
  type ExportScheduleRecord,
  type ScheduleFrequency,
  type ScheduleStatus,
} from "@ranza/data-export";

export type {
  DataExportRecord,
  ExportFormat,
  ExportResourceType,
  ExportScheduleRecord,
  ScheduleFrequency,
  ScheduleStatus,
};
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * What an action did, as a word the screen says in the reader's language.
 * Never a message: the exception behind `error` goes to the log, and a refusal
 * is the database's and says nothing about why.
 */
export interface DataExportActionResult {
  status: "idle" | "done" | "refused" | "error";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateDataExport(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/data-export`);
  revalidatePath(`/${locale}/data-export?property=${propertyId}`);
}

/**
 * Turns what a command threw into the word the screen shows, and reports the
 * ones that are not a refusal. A refusal is expected and carries nothing worth
 * logging; anything else is a defect or an outage and is never shown as a
 * message, but is never quiet either.
 */
function answer(
  event: string,
  context: Record<string, unknown>,
  error: unknown,
): DataExportActionResult {
  if (
    error instanceof DataExportRefusedError ||
    error instanceof DataExportInputError
  ) {
    return { status: "refused" };
  }
  console.error(event, context, error);
  return { status: "error" };
}

/**
 * The Organization's exports, for the Property the screen is opened from. A
 * failure is the page's, not an empty list: a list that reads empty when the
 * database is down is a list that says nobody exported anything.
 */
export async function listDataExports(
  propertyId: string,
): Promise<DataExportRecord[]> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(propertyId)) return [];
  try {
    return await getComposition().dataExport.listExports(
      viewer.userId,
      propertyId,
    );
  } catch (error) {
    console.error(
      "data_export.list_failed",
      { propertyId, userId: viewer.userId },
      error,
    );
    throw error;
  }
}

/** The Organization's export schedules, for the same Property. */
export async function listExportSchedules(
  propertyId: string,
): Promise<ExportScheduleRecord[]> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(propertyId)) return [];
  try {
    return await getComposition().dataExport.listSchedules(
      viewer.userId,
      propertyId,
    );
  } catch (error) {
    console.error(
      "data_export.schedules_list_failed",
      { propertyId, userId: viewer.userId },
      error,
    );
    throw error;
  }
}

/**
 * Asks for an export. That is all this does: the worker picks the request up
 * and produces the file, and the screen shows it pending until it has.
 */
export async function requestDataExportAction(
  locale: string,
  propertyId: string,
  input: {
    resourceTypes: ExportResourceType[];
    format: ExportFormat;
  },
): Promise<DataExportActionResult> {
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "refused" };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().dataExport.requestExport(viewer.userId, propertyId, {
      resourceTypes: input.resourceTypes,
      format: input.format,
      requesterName: viewer.signedUpAs,
    });
  } catch (error) {
    return answer(
      "data_export.request_failed",
      { propertyId, userId: viewer.userId },
      error,
    );
  }
  revalidateDataExport(locale, propertyId);
  return { status: "done" };
}

/** Sets up an export that repeats. */
export async function createExportScheduleAction(
  locale: string,
  propertyId: string,
  input: {
    name: string;
    resourceTypes: ExportResourceType[];
    format: ExportFormat;
    frequency: ScheduleFrequency;
  },
): Promise<DataExportActionResult> {
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "refused" };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().dataExport.createSchedule(
      viewer.userId,
      propertyId,
      {
        name: input.name,
        resourceTypes: input.resourceTypes,
        format: input.format,
        frequency: input.frequency,
        creatorName: viewer.signedUpAs,
      },
    );
  } catch (error) {
    return answer(
      "data_export.schedule_create_failed",
      { propertyId, userId: viewer.userId },
      error,
    );
  }
  revalidateDataExport(locale, propertyId);
  return { status: "done" };
}

/** Pauses a schedule, or resumes it. */
export async function toggleExportScheduleAction(
  locale: string,
  propertyId: string,
  scheduleId: string,
  status: ScheduleStatus,
): Promise<DataExportActionResult> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(scheduleId)
  ) {
    return { status: "refused" };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().dataExport.updateScheduleStatus(
      viewer.userId,
      scheduleId,
      status,
    );
  } catch (error) {
    return answer(
      "data_export.schedule_update_failed",
      { scheduleId, userId: viewer.userId },
      error,
    );
  }
  revalidateDataExport(locale, propertyId);
  return { status: "done" };
}
