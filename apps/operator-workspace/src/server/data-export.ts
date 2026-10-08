"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import type {
  DataExportRecord,
  ExportFormat,
  ExportResourceType,
  ExportScheduleRecord,
  ScheduleFrequency,
  ScheduleStatus,
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

export interface DataExportActionResult {
  status: "idle" | "done" | "refused" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateDataExport(locale: string, propertyId?: string): void {
  revalidatePath(`/${locale}/data-export`);
  if (propertyId) {
    revalidatePath(`/${locale}/data-export?property=${propertyId}`);
  }
}

/**
 * Server query: Lists recent data exports for the current viewer's organization.
 */
export async function listDataExports(): Promise<DataExportRecord[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  try {
    return await getComposition().dataExport.listExports(viewer.userId);
  } catch {
    return [];
  }
}

/**
 * Server query: Lists automated export schedules for the viewer's organization.
 */
export async function listExportSchedules(): Promise<ExportScheduleRecord[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  try {
    return await getComposition().dataExport.listSchedules(viewer.userId);
  } catch {
    return [];
  }
}

/**
 * Server query: Fetches a single export by ID.
 */
export async function getDataExport(
  exportId: string,
): Promise<DataExportRecord | null> {
  if (!UUID.test(exportId)) return null;
  const viewer = await currentViewer();
  if (!viewer) return null;
  try {
    return await getComposition().dataExport.getExport(viewer.userId, exportId);
  } catch {
    return null;
  }
}

/**
 * Server action: Requests a new on-demand data export.
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
    return { status: "refused", message: "Invalid parameters" };
  }

  if (!input.resourceTypes || input.resourceTypes.length === 0) {
    return {
      status: "refused",
      message: "At least one dataset must be selected",
    };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  try {
    const comp = getComposition();
    await comp.dataExport.requestExport(viewer.userId, {
      resourceTypes: input.resourceTypes,
      format: input.format,
    });
    // Trigger immediate background worker pass if available
    comp.dataExport.processPendingExports().catch(() => {});
    revalidateDataExport(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to request export",
    };
  }
}

/**
 * Server action: Creates an automated export schedule.
 */
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
    return { status: "refused", message: "Invalid parameters" };
  }

  if (!input.name || input.name.trim().length === 0) {
    return { status: "refused", message: "Schedule name is required" };
  }

  if (!input.resourceTypes || input.resourceTypes.length === 0) {
    return {
      status: "refused",
      message: "At least one dataset must be selected",
    };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  try {
    const comp = getComposition();
    await comp.dataExport.createSchedule(viewer.userId, {
      name: input.name.trim(),
      resourceTypes: input.resourceTypes,
      format: input.format,
      frequency: input.frequency,
    });
    revalidateDataExport(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to create schedule",
    };
  }
}

/**
 * Server action: Toggles an export schedule between active and paused.
 */
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
    return { status: "refused", message: "Invalid parameters" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  try {
    const comp = getComposition();
    await comp.dataExport.updateScheduleStatus(
      viewer.userId,
      scheduleId,
      status,
    );
    revalidateDataExport(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to update schedule",
    };
  }
}
