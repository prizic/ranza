"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import type {
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestStatus,
} from "@ranza/guest-services";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * What a command on a service request did. The outcome carries no English: the
 * component chooses the sentence from `status`, in the reader's language, and
 * every reason the module can tell apart has a status of its own (RANZ-54).
 */
export interface ServiceRequestOutcome {
  status:
    | "idle"
    | "done"
    | "invalid"
    /** The viewer is not signed in, or the database said no for a reason it does not give. */
    | "refused"
    /** The write changed nothing: the request left the viewer's reach, or their permission did. */
    | "unavailable"
    | "resolvedCannotCancel"
    | "cancelledReopensToNew";
  number?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database's own limits on a reason: three to two hundred characters. */
const REASON = { min: 3, max: 200 } as const;
const TITLE = { min: 3, max: 200 } as const;
const TEXT_MAX = 2000;

function revalidateRequests(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/guest-experience`);
  revalidatePath(`/${locale}/guest-experience?property=${propertyId}`);
}

/**
 * What a refused command becomes. A failure this does not recognise is a
 * defect, not an outcome to show as a refusal, so it is rethrown for the
 * framework to report.
 */
function outcomeOf(error: unknown): ServiceRequestOutcome {
  if (error instanceof Error) {
    if (error.name === "ServiceRequestRefusedError") {
      return { status: "refused" };
    }
    if (error.name === "ServiceRequestUnavailableError") {
      return { status: "unavailable" };
    }
    if (error.name === "ServiceRequestStateError") {
      return {
        status: (error as Error & { reason: ServiceRequestOutcome["status"] })
          .reason,
      };
    }
  }
  throw error;
}

function validLength(
  value: string,
  { min, max }: { min: number; max: number },
) {
  return value.length >= min && value.length <= max;
}

/**
 * Server action to log a new service request. The Guest in the room is read by
 * the module from its Stay, never from the form (GX-07).
 */
export async function createServiceRequest(
  locale: string,
  propertyId: string,
  _prevState: ServiceRequestOutcome,
  formData: FormData,
): Promise<ServiceRequestOutcome> {
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "invalid" };
  }

  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim() || null;
  const category =
    (formData.get("category") as ServiceRequestCategory) || "other";
  const priority =
    (formData.get("priority") as ServiceRequestPriority) || "normal";
  const unitId =
    String(formData.get("accommodationUnitId") ?? "").trim() || null;

  if (!validLength(title, TITLE)) return { status: "invalid" };
  if (details && details.length > TEXT_MAX) return { status: "invalid" };
  if (unitId && !UUID.test(unitId)) return { status: "invalid" };

  try {
    const created = await getComposition().guestServices.createRequest(
      viewer.userId,
      {
        propertyId,
        title,
        details,
        category,
        priority,
        accommodationUnitId: unitId,
      },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done", number: created.number };
  } catch (error: unknown) {
    return outcomeOf(error);
  }
}

/**
 * Server action to move a request along. Reopening a cancelled request goes
 * to `new` and clears its reason, which the database insists on as a pair; a
 * resolved one reopens to `in_progress` and keeps its notes.
 */
export async function updateServiceRequestStatus(
  locale: string,
  propertyId: string,
  requestId: string,
  status: ServiceRequestStatus,
  notes?: string | null,
): Promise<ServiceRequestOutcome> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(requestId)
  ) {
    return { status: "invalid" };
  }
  if (status === "cancelled" && !validLength(notes?.trim() ?? "", REASON)) {
    return { status: "invalid" };
  }
  if (notes && notes.length > TEXT_MAX) return { status: "invalid" };

  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().guestServices.updateRequest(
      viewer.userId,
      requestId,
      {
        status,
        ...(status === "cancelled" ? { cancelReason: notes?.trim() } : {}),
        ...(status === "new" ? { cancelReason: null } : {}),
        ...(status === "resolved" ? { resolutionNotes: notes ?? null } : {}),
      },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done" };
  } catch (error: unknown) {
    revalidateRequests(locale, propertyId);
    return outcomeOf(error);
  }
}

/**
 * Server action to assign a request to a staff member, or to nobody.
 */
export async function assignServiceRequest(
  locale: string,
  propertyId: string,
  requestId: string,
  assignedToUserId: string | null,
): Promise<ServiceRequestOutcome> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(requestId) ||
    (assignedToUserId && !UUID.test(assignedToUserId))
  ) {
    return { status: "invalid" };
  }

  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().guestServices.updateRequest(
      viewer.userId,
      requestId,
      { assignedToUserId },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done" };
  } catch (error: unknown) {
    revalidateRequests(locale, propertyId);
    return outcomeOf(error);
  }
}
