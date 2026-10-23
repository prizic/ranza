"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  ClosureInputError,
  EndpointInputError,
  IntegrationsRefusedError,
  type ClosureInputRejection,
  type EndpointInputRejection,
  type RefusalReason,
} from "@ranza/integrations";
import { getComposition } from "./composition";
import { currentViewer, permittedProperties } from "./viewer";

/**
 * The Integrations screen's commands (ADR 0045).
 *
 * Every command runs under the acting user's context (ADR 0007), and the
 * functions in the database decide whether it lands (ADR 0012), so nothing
 * here checks a permission. An outcome carries no English: the screen chooses
 * the words from `status` and the reason, and the exception behind `error`
 * goes to the log and never to the page.
 */

export type IntegrationsOutcome =
  | { status: "idle" }
  | { status: "done" }
  /** How many stopped deliveries were put back in the queue. */
  | { status: "retried"; count: number }
  /** The signing secret of a new endpoint. The only time anything returns it. */
  | { status: "registered"; secret: string }
  | { status: "invalid"; rejection: EndpointInputRejection }
  | { status: "reason_invalid"; reason: ClosureInputRejection }
  | { status: "refused"; reason: RefusalReason }
  /** Something the module did not expect; it has been reported. */
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matched by name as well, because a server bundle may hold two copies. */
function named(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

function outcomeOf(
  command: string,
  context: Record<string, string>,
  error: unknown,
): IntegrationsOutcome {
  if (named(error, "EndpointInputError")) {
    return {
      status: "invalid",
      rejection: (error as EndpointInputError).rejection,
    };
  }
  if (named(error, "ClosureInputError")) {
    return {
      status: "reason_invalid",
      reason: (error as ClosureInputError).reason,
    };
  }
  if (named(error, "IntegrationsRefusedError")) {
    return {
      status: "refused",
      reason: (error as IntegrationsRefusedError).reason,
    };
  }
  console.error(`integrations.${command}_failed`, context, error);
  return { status: "error" };
}

function revalidateIntegrations(locale: string, propertyId: string): void {
  revalidatePath(`/${locale}/integrations`);
  revalidatePath(`/${locale}/integrations?property=${propertyId}`);
}

/** The signed-in user, when the call names a locale and ids that can be real. */
async function actor(
  locale: string,
  ...ids: readonly string[]
): Promise<{ userId: string } | null> {
  if (!isSupportedLocale(locale) || !ids.every((id) => UUID.test(id))) {
    return null;
  }
  return currentViewer();
}

const REFUSED: IntegrationsOutcome = {
  status: "refused",
  reason: "not_permitted",
};

/**
 * Registers an endpoint at the Organization of the Property the viewer is
 * working in. The Organization is never taken from the request: it is found
 * among the Properties where the viewer holds `integrations.manage`.
 */
export async function registerEndpointAction(
  locale: string,
  propertyId: string,
  input: { name: string; url: string; eventTypes: readonly string[] },
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId);
  if (!viewer) return REFUSED;

  const permitted = await permittedProperties("integrations.manage");
  const organizationId = permitted.find(
    (property) => property.propertyId === propertyId,
  )?.organizationId;
  if (!organizationId) return REFUSED;

  try {
    const { secret } = await getComposition().integrations.registerEndpoint(
      viewer.userId,
      { organizationId, ...input },
    );
    revalidateIntegrations(locale, propertyId);
    return { status: "registered", secret };
  } catch (error) {
    return outcomeOf("register_endpoint", { propertyId }, error);
  }
}

export async function removeEndpointAction(
  locale: string,
  propertyId: string,
  endpointId: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId, endpointId);
  if (!viewer) return REFUSED;
  try {
    await getComposition().integrations.removeEndpoint(
      viewer.userId,
      endpointId,
    );
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return outcomeOf("remove_endpoint", { propertyId, endpointId }, error);
  }
}

export async function sendTestEventAction(
  locale: string,
  propertyId: string,
  endpointId: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId, endpointId);
  if (!viewer) return REFUSED;
  try {
    await getComposition().integrations.sendTestEvent(viewer.userId, {
      endpointId,
      propertyId,
    });
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return outcomeOf("send_test_event", { propertyId, endpointId }, error);
  }
}

export async function retryOperationAction(
  locale: string,
  propertyId: string,
  operationId: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId, operationId);
  if (!viewer) return REFUSED;
  try {
    await getComposition().integrations.retryOperation(viewer.userId, {
      operationId,
    });
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return outcomeOf("retry_operation", { propertyId, operationId }, error);
  }
}

export async function retryAllOperationsAction(
  locale: string,
  propertyId: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId);
  if (!viewer) return REFUSED;
  try {
    const retried = await getComposition().integrations.retryAllOperations(
      viewer.userId,
      { propertyId },
    );
    revalidateIntegrations(locale, propertyId);
    return { status: "retried", count: retried };
  } catch (error) {
    return outcomeOf("retry_all_operations", { propertyId }, error);
  }
}

export async function cancelOperationAction(
  locale: string,
  propertyId: string,
  operationId: string,
  reason: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId, operationId);
  if (!viewer) return REFUSED;
  try {
    await getComposition().integrations.cancelOperation(viewer.userId, {
      operationId,
      reason,
    });
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return outcomeOf("cancel_operation", { propertyId, operationId }, error);
  }
}

export async function resolveOperationAction(
  locale: string,
  propertyId: string,
  operationId: string,
  reason: string,
): Promise<IntegrationsOutcome> {
  const viewer = await actor(locale, propertyId, operationId);
  if (!viewer) return REFUSED;
  try {
    await getComposition().integrations.resolveOperation(viewer.userId, {
      operationId,
      reason,
    });
    revalidateIntegrations(locale, propertyId);
    return { status: "done" };
  } catch (error) {
    return outcomeOf("resolve_operation", { propertyId, operationId }, error);
  }
}
