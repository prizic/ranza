"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

export interface RetryOutcome {
  status: "idle" | "done" | "refused" | "error";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateIntegrations(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/integrations`);
  revalidatePath(`/${locale}/integrations?property=${propertyId}`);
}

/**
 * Server action to retry a failed integration operation.
 */
export async function retryOperationAction(
  locale: string,
  propertyId: string,
  operationId: string,
): Promise<RetryOutcome> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(propertyId) ||
    !UUID.test(operationId)
  ) {
    return { status: "refused", message: "Invalid parameters" };
  }

  const viewer = await currentViewer();
  if (!viewer) {
    return { status: "refused", message: "Unauthorized" };
  }

  try {
    const comp = getComposition();
    await comp.integrations.retryOperation(viewer.userId, {
      propertyId,
      operationId,
    });
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Retry failed",
    };
  }
}
