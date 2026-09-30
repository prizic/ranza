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

export interface ServiceRequestOutcome {
  status: "idle" | "done" | "invalid" | "refused";
  number?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateRequests(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/guest-experience`);
  revalidatePath(`/${locale}/guest-experience?property=${propertyId}`);
}

/**
 * Server action to log a new service request.
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

  const title = (formData.get("title") as string)?.trim();
  const details = (formData.get("details") as string)?.trim() || null;
  const category =
    (formData.get("category") as ServiceRequestCategory) || "other";
  const priority =
    (formData.get("priority") as ServiceRequestPriority) || "normal";
  const unitId =
    (formData.get("accommodationUnitId") as string)?.trim() || null;
  const guestId = (formData.get("guestId") as string)?.trim() || null;

  if (!title || title.length < 3 || title.length > 200) {
    return { status: "invalid" };
  }
  if (details && details.length > 2000) {
    return { status: "invalid" };
  }
  if (unitId && !UUID.test(unitId)) {
    return { status: "invalid" };
  }
  if (guestId && !UUID.test(guestId)) {
    return { status: "invalid" };
  }

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
        guestId,
      },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done", number: created.number };
  } catch (error) {
    console.error("Failed to create service request:", error);
    return { status: "refused" };
  }
}

/**
 * Server action to update a request's status, resolution notes, or cancel reason.
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

  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  try {
    await getComposition().guestServices.updateRequest(
      viewer.userId,
      requestId,
      {
        status,
        ...(status === "cancelled"
          ? { cancelReason: notes ?? "Cancelled" }
          : {}),
        ...(status === "resolved" ? { resolutionNotes: notes ?? null } : {}),
      },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    console.error("Failed to update service request status:", error);
    return { status: "refused" };
  }
}

/**
 * Server action to assign a request to a staff member.
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
      {
        assignedToUserId,
      },
    );

    revalidateRequests(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    console.error("Failed to assign service request:", error);
    return { status: "refused" };
  }
}
