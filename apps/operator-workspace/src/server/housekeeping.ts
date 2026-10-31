"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  HousekeepingInputError,
  HousekeepingRefusedError,
  isStayoverCadence,
  type StayoverCadence,
} from "@ranza/housekeeping";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Marking rooms from the Housekeeping screen (RANZ-28).
 *
 * The mark goes through the composition root under the acting user's context
 * (ADR 0007); the write policies decide whether it lands (ADR 0012), so
 * nothing here checks a permission.
 */

export interface MarkOutcome {
  status: "idle" | "done" | "invalid" | "refused";
  /** How many rooms the mark reached, once beds were folded into rooms. */
  marked?: number;
}

/**
 * A form field that must be an id. Anything else is a malformed request, which
 * is "invalid" rather than a Postgres cast error surfacing as a crash.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRefused(error: unknown): error is HousekeepingRefusedError {
  return (
    error instanceof HousekeepingRefusedError ||
    (error instanceof Error && error.name === "HousekeepingRefusedError")
  );
}

function isInvalid(error: unknown): error is HousekeepingInputError {
  return (
    error instanceof HousekeepingInputError ||
    (error instanceof Error && error.name === "HousekeepingInputError")
  );
}

/**
 * The board and every screen that reads readiness: arrivals warns about a
 * dirty room, and Rooms lists the same Units.
 */
function revalidateHousekeeping(locale: string): void {
  revalidatePath(`/${locale}/housekeeping`);
  revalidatePath(`/${locale}/arrivals`);
  revalidatePath(`/${locale}/rooms`);
}

/**
 * `unitId` repeats once per selected room; `status` is the mark. Copy is chosen
 * by the component from `status`, so an outcome carries no English.
 */
export async function markRooms(
  _previous: MarkOutcome,
  form: FormData,
): Promise<MarkOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };

  const unitIds = form.getAll("unitId").map(String);
  const status = String(form.get("status") ?? "");
  if (!unitIds.every((id) => UUID.test(id))) return { status: "invalid" };

  try {
    const { marked } = await getComposition().housekeeping.markUnits(
      viewer.userId,
      { unitIds, status },
    );
    revalidateHousekeeping(locale);
    return { status: "done", marked };
  } catch (error: unknown) {
    if (isInvalid(error)) return { status: "invalid" };
    if (isRefused(error)) {
      // A board older than the viewer's reach, or a permission taken away
      // while the page was open: the next read shows them what is true now.
      revalidateHousekeeping(locale);
      return { status: "refused" };
    }
    throw error;
  }
}

export interface InspectionOutcome {
  status: "idle" | "done" | "invalid" | "refused";
}

/**
 * Changing whether rooms are inspected after cleaning (slice 3).
 *
 * `scope` is `property` or `organization`; `value` is `on`, `off`, or — for a
 * Property only — `default`, which clears its own answer so it follows the
 * Organization again (HK-S3-10). The policies decide who may (HK-S3-05,
 * HK-S3-07); nothing here checks.
 */
export async function setInspection(
  _previous: InspectionOutcome,
  form: FormData,
): Promise<InspectionOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };
  const propertyId = String(form.get("propertyId") ?? "");
  const scope = String(form.get("scope") ?? "");
  const value = String(form.get("value") ?? "");
  if (!UUID.test(propertyId)) return { status: "invalid" };

  const housekeeping = getComposition().housekeeping;
  try {
    if (scope === "property" && ["on", "off", "default"].includes(value)) {
      await housekeeping.setPropertyInspection(
        viewer.userId,
        propertyId,
        value === "default" ? null : value === "on",
      );
    } else if (scope === "organization" && ["on", "off"].includes(value)) {
      await housekeeping.setOrganizationInspection(
        viewer.userId,
        propertyId,
        value === "on",
      );
    } else {
      return { status: "invalid" };
    }
  } catch (error: unknown) {
    if (isRefused(error)) {
      revalidateHousekeeping(locale);
      return { status: "refused" };
    }
    throw error;
  }

  // What ready means moved, so every screen that reads readiness is stale.
  revalidateHousekeeping(locale);
  return { status: "done" };
}

export interface StayoverOutcome {
  status: "idle" | "done" | "invalid" | "refused";
  /** False when the room had already been cleaned today. */
  recorded?: boolean;
}

/**
 * A room somebody is staying in was cleaned (HK-S4-08). `unitId` is the room.
 * The policy decides who may and which Unit; the date and who pressed are the
 * database's.
 */
export async function markStayoverCleaned(
  _previous: StayoverOutcome,
  form: FormData,
): Promise<StayoverOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };
  const unitId = String(form.get("unitId") ?? "");
  if (!UUID.test(unitId)) return { status: "invalid" };

  try {
    const { recorded } =
      await getComposition().housekeeping.markStayoverCleaned(
        viewer.userId,
        unitId,
      );
    revalidateHousekeeping(locale);
    return { status: "done", recorded };
  } catch (error: unknown) {
    if (isRefused(error)) {
      revalidateHousekeeping(locale);
      return { status: "refused" };
    }
    throw error;
  }
}

/** Takes back today's press on a room (HK-S4-13). */
export async function undoStayoverCleaned(
  _previous: StayoverOutcome,
  form: FormData,
): Promise<StayoverOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };
  const unitId = String(form.get("unitId") ?? "");
  if (!UUID.test(unitId)) return { status: "invalid" };

  try {
    await getComposition().housekeeping.undoStayoverCleaned(
      viewer.userId,
      unitId,
    );
    revalidateHousekeeping(locale);
    return { status: "done" };
  } catch (error: unknown) {
    if (isRefused(error)) {
      revalidateHousekeeping(locale);
      return { status: "refused" };
    }
    throw error;
  }
}

/**
 * Reads the schedule a form sent: `kind` is `default`, `none`, `every_n_days`
 * or `weekly`, with the number that kind needs. Null for `default`; undefined
 * for anything the database would refuse.
 */
function cadenceFrom(form: FormData): StayoverCadence | null | undefined {
  const kind = String(form.get("kind") ?? "");
  if (kind === "default") return null;
  const candidate =
    kind === "none"
      ? { kind }
      : kind === "every_n_days"
        ? { kind, everyDays: Number(form.get("everyDays")) }
        : kind === "weekly"
          ? { kind, weekday: Number(form.get("weekday")) }
          : null;
  return isStayoverCadence(candidate) ? candidate : undefined;
}

/**
 * Changing how often rooms in use are cleaned at one Property (HK-S4-02). The
 * policies decide who may (HK-S4-04); nothing here checks.
 */
export async function setStayover(
  _previous: StayoverOutcome,
  form: FormData,
): Promise<StayoverOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { status: "invalid" };
  const propertyId = String(form.get("propertyId") ?? "");
  if (!UUID.test(propertyId)) return { status: "invalid" };
  const cadence = cadenceFrom(form);
  if (cadence === undefined) return { status: "invalid" };

  try {
    await getComposition().housekeeping.setStayoverCadence(
      viewer.userId,
      propertyId,
      cadence,
    );
  } catch (error: unknown) {
    if (isRefused(error)) {
      revalidateHousekeeping(locale);
      return { status: "refused" };
    }
    if (isInvalid(error)) return { status: "invalid" };
    throw error;
  }

  revalidateHousekeeping(locale);
  revalidatePath(`/${locale}/configuration`);
  return { status: "done" };
}
