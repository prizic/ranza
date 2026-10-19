"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  type DataExportInputProblem,
  type DataExportRecord,
  type ExportAbilities,
  type ExportFormat,
  type ExportRange,
  type ExportResourceType,
  type ExportScheduleRecord,
  type ScheduleFrequency,
  type ScheduleStatus,
} from "@ranza/data-export";

export type {
  DataExportRecord,
  ExportAbilities,
  ExportFormat,
  ExportRange,
  ExportResourceType,
  ExportScheduleRecord,
  ScheduleFrequency,
  ScheduleStatus,
};
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * What an action did, as data the screen words in the reader's language.
 * Never a message: the exception behind `error` goes to the log. A refusal
 * names the datasets the requester's role will not cover, because that is the
 * answer to "what can I ask for", which the form shows anyway; it never says
 * more than that (ADR 0012).
 */
export type DataExportActionResult =
  | { status: "idle" }
  | { status: "done" }
  | { status: "refused"; datasets: ExportResourceType[] }
  | { status: "invalid"; problem: DataExportInputProblem }
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateDataExport(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/data-export`);
  revalidatePath(`/${locale}/data-export?property=${propertyId}`);
}

/**
 * Whether an error is the named one of the data-export module. By name and not
 * `instanceof`: a Server Action is bundled apart from the page that built the
 * composition, and a class reached through both is two classes, so a refusal
 * thrown by one failed the other's `instanceof` and was reported as an outage.
 */
function isNamed(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

/**
 * Turns what a command threw into the data the screen words, and reports the
 * ones that are not a refusal. A refusal is expected and carries nothing worth
 * logging; anything else is a defect or an outage and is never shown as a
 * message, but is never quiet either.
 */
function answer(
  event: string,
  context: Record<string, unknown>,
  error: unknown,
): DataExportActionResult {
  if (isNamed(error, "DataExportRefusedError")) {
    const { datasets } = error as { datasets?: ExportResourceType[] };
    return { status: "refused", datasets: datasets ?? [] };
  }
  if (isNamed(error, "DataExportInputError")) {
    const { problem } = error as { problem?: DataExportInputProblem };
    if (problem) return { status: "invalid", problem };
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
 * What the acting Staff Member may ask for from this Property, so the form can
 * say which datasets it will refuse before anybody presses it. Nobody who can
 * read this screen learns more than the insert policy would tell them on
 * submit.
 */
export async function exportAbilities(
  propertyId: string,
): Promise<ExportAbilities> {
  const none: ExportAbilities = {
    mayCreate: false,
    datasets: {
      residents_guests: false,
      reservations_stays: false,
      rooms_beds: false,
      folios_payments: false,
      audit_log: false,
    },
  };
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(propertyId)) return none;
  try {
    return await getComposition().dataExport.exportAbilities(
      viewer.userId,
      propertyId,
    );
  } catch (error) {
    console.error(
      "data_export.abilities_failed",
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
    range?: ExportRange | null;
  },
): Promise<DataExportActionResult> {
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "refused", datasets: [] };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused", datasets: [] };

  try {
    await getComposition().dataExport.requestExport(viewer.userId, propertyId, {
      resourceTypes: input.resourceTypes,
      format: input.format,
      range: input.range ?? null,
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
    return { status: "refused", datasets: [] };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused", datasets: [] };

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
    return { status: "refused", datasets: [] };
  }
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused", datasets: [] };

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
