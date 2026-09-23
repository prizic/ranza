"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  HousekeepingInputError,
  HousekeepingRefusedError,
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
