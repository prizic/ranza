import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  WEBHOOK_EVENT_TYPES,
  type EndpointHealth,
  type EndpointsView,
  type FailedOperationRecord,
  type OperationClosureInput,
  type OperationCommandInput,
  type OperationStatus,
  type RegisterEndpointInput,
  type RegisteredEndpoint,
  type SendTestInput,
  type WebhookEndpointRecord,
} from "./contracts";
import {
  ClosureInputError,
  EndpointInputError,
  IntegrationsRefusedError,
  type RefusalReason,
} from "./errors";
import type { IntegrationsDeps } from "./ports";
import { generateSecret } from "./signing";
import { checkTargetUrl } from "./target";

const NAME_MAX = 80;
const REASON_MIN = 3;
const REASON_MAX = 500;

/** The SQLSTATEs the functions in 20260916011200 raise, and what each means here. */
const REFUSALS: readonly [code: string, reason: RefusalReason][] = [
  ["42501", "not_permitted"],
  ["23505", "duplicate_url"],
  ["54000", "too_many_endpoints"],
  ["55000", "test_in_flight"],
  ["22023", "unavailable"],
];

function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

/** A statement's failure as this module's refusal, or as it was for the host to report. */
function refusal(error: unknown): Error {
  for (const [code, reason] of REFUSALS) {
    if (raised(error, code)) {
      return new IntegrationsRefusedError(reason, { cause: error });
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function attempting<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw refusal(error);
  }
}

function checkedEventTypes(requested: readonly string[]): string[] {
  const unique = [...new Set(requested)];
  if (unique.length === 0) {
    throw new EndpointInputError({ field: "events", reason: "none" });
  }
  const known: readonly string[] = WEBHOOK_EVENT_TYPES;
  if (unique.some((eventType) => !known.includes(eventType))) {
    throw new EndpointInputError({ field: "events", reason: "unknown" });
  }
  return unique;
}

function checkedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new EndpointInputError({ field: "name", reason: "empty" });
  }
  if (trimmed.length > NAME_MAX) {
    throw new EndpointInputError({ field: "name", reason: "too_long" });
  }
  return trimmed;
}

function checkedReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN) {
    throw new ClosureInputError("reason_too_short");
  }
  if (trimmed.length > REASON_MAX) {
    throw new ClosureInputError("reason_too_long");
  }
  return trimmed;
}

function healthOf(
  openFailures: number,
  lastDeliveredAt: Date | null,
): EndpointHealth {
  if (openFailures > 0) return "failing";
  return lastDeliveredAt === null ? "unused" : "delivering";
}

interface EndpointRow {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  eventTypes: string[];
  createdAt: Date;
  lastDeliveredAt: Date | null;
  queued: number;
  openFailures: number;
}

interface FailedOperationRow {
  id: string;
  propertyId: string;
  endpointId: string | null;
  endpointName: string;
  operation: string;
  error: string;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  due: boolean;
  lastAttemptAt: Date;
  lastStatusCode: number | null;
  lastResponseExcerpt: string | null;
}

/**
 * Outbound webhooks, and the failures an operator is shown (ADR 0045).
 *
 * Every command runs inside the acting user's request context (ADR 0007), and
 * the writes are functions that ask blueprint 3.5's gates themselves, so this
 * module checks no permission: it validates what the caller typed, calls the
 * function, and records who did it. Sending is the worker's, not this
 * module's; nothing here opens a connection to an endpoint.
 */
export function createIntegrationsModule({ db }: IntegrationsDeps) {
  async function operationScope(
    tx: Parameters<typeof recordWithin>[0],
    operationId: string,
  ): Promise<{ organizationId: string; propertyId: string }> {
    const [scope] = await tx.$queryRaw<
      { organizationId: string; propertyId: string }[]
    >`
      select organization_id as "organizationId", property_id as "propertyId"
        from public.failed_operations
       where id = ${operationId}::uuid`;
    if (!scope) throw new IntegrationsRefusedError("not_permitted");
    return scope;
  }

  async function endpointOrganization(
    tx: Parameters<typeof recordWithin>[0],
    endpointId: string,
  ): Promise<string> {
    const [row] = await tx.$queryRaw<{ organizationId: string }[]>`
      select organization_id as "organizationId"
        from public.webhook_endpoints
       where id = ${endpointId}::uuid`;
    if (!row) throw new IntegrationsRefusedError("not_permitted");
    return row.organizationId;
  }

  return {
    /**
     * The Organization's active endpoints and how each is doing, as far as the
     * viewer reaches: the counts come from deliveries the policies let them
     * read, so a Manager of one Property sees that Property's share.
     */
    async endpoints(
      userId: string,
      organizationId: string,
    ): Promise<EndpointsView> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<EndpointRow[]>`
          select endpoint.id,
                 endpoint.organization_id as "organizationId",
                 endpoint.name, endpoint.url,
                 endpoint.event_types as "eventTypes",
                 endpoint.created_at as "createdAt",
                 (select max(delivery.delivered_at)
                    from public.webhook_deliveries as delivery
                   where delivery.endpoint_id = endpoint.id) as "lastDeliveredAt",
                 (select count(*)::int
                    from public.webhook_deliveries as delivery
                   where delivery.endpoint_id = endpoint.id
                     and delivery.status in ('pending', 'retrying')) as queued,
                 (select count(*)::int
                    from public.failed_operations as failure
                   where failure.endpoint_id = endpoint.id
                     and failure.status in ('failed', 'retrying')) as "openFailures"
            from public.webhook_endpoints as endpoint
           where endpoint.organization_id = ${organizationId}::uuid
             and endpoint.status = 'active'
           order by endpoint.created_at, endpoint.id`;

        const [manage] = await client.$queryRaw<{ may: boolean }[]>`
          select app.has_organization_wide_reach(${organizationId}::uuid)
             and app.has_organization_permission(
                   ${organizationId}::uuid, 'integrations.manage') as may`;

        const endpoints: WebhookEndpointRecord[] = rows.map((row) => ({
          ...row,
          health: healthOf(row.openFailures, row.lastDeliveredAt),
        }));
        return { endpoints, mayManage: manage?.may === true };
      });
    },

    /** Deliveries at a Property that have not arrived and are still being asked about. */
    async failedOperations(
      userId: string,
      propertyId: string,
    ): Promise<FailedOperationRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<FailedOperationRow[]>`
          select failure.id,
                 failure.property_id as "propertyId",
                 failure.endpoint_id as "endpointId",
                 failure.integration_name as "endpointName",
                 failure.operation, failure.error, failure.status,
                 failure.attempts,
                 failure.next_attempt_at as "nextAttemptAt",
                 coalesce(failure.next_attempt_at <= now(), false) as due,
                 failure.last_attempt_at as "lastAttemptAt",
                 delivery.last_status_code as "lastStatusCode",
                 delivery.last_response_excerpt as "lastResponseExcerpt"
            from public.failed_operations as failure
            left join public.webhook_deliveries as delivery
              on delivery.id = failure.delivery_id
             and delivery.organization_id = failure.organization_id
           where failure.property_id = ${propertyId}::uuid
             and failure.status in ('failed', 'retrying')
           order by failure.last_attempt_at desc, failure.id`;
        return rows.map((row) => ({
          ...row,
          status: row.status as OperationStatus,
        }));
      });
    },

    /**
     * Registers an endpoint and returns its signing secret, once. The secret is
     * generated here, written by the function to a table `ranza_app` cannot
     * read, and handed back only in this return value.
     */
    async registerEndpoint(
      userId: string,
      input: RegisterEndpointInput,
    ): Promise<RegisteredEndpoint> {
      const name = checkedName(input.name);
      const eventTypes = checkedEventTypes(input.eventTypes);
      const target = checkTargetUrl(input.url.trim());
      if (!target.ok) throw new EndpointInputError(target.rejection);
      const secret = generateSecret();

      return attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const [created] = await client.$queryRaw<{ endpointId: string }[]>`
            select app.create_webhook_endpoint(
                     ${input.organizationId}::uuid, ${name},
                     ${target.url.href}, ${eventTypes}::text[], ${secret}
                   ) as "endpointId"`;
          if (!created) throw new Error("the endpoint was not created");

          await recordWithin(tx, {
            organizationId: input.organizationId,
            actorId: userId,
            action: "webhook_endpoint.registered",
            subjectType: "webhook_endpoint",
            subjectId: created.endpointId,
            context: { host: target.url.hostname, eventTypes },
          });
          return { endpointId: created.endpointId, secret };
        }),
      );
    },

    /** Removes an endpoint: it stops receiving, and what was on its way is cancelled. */
    async removeEndpoint(userId: string, endpointId: string): Promise<void> {
      await attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const organizationId = await endpointOrganization(tx, endpointId);
          await client.$queryRaw`
            select app.remove_webhook_endpoint(${endpointId}::uuid)`;
          await recordWithin(tx, {
            organizationId,
            actorId: userId,
            action: "webhook_endpoint.removed",
            subjectType: "webhook_endpoint",
            subjectId: endpointId,
          });
        }),
      );
    },

    /** Queues a test event; the worker sends it on its next pass. */
    async sendTestEvent(userId: string, input: SendTestInput): Promise<void> {
      await attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const organizationId = await endpointOrganization(
            tx,
            input.endpointId,
          );
          await client.$queryRaw`
            select app.send_webhook_test(
                     ${input.endpointId}::uuid, ${input.propertyId}::uuid)`;
          await recordWithin(tx, {
            organizationId,
            locationId: input.propertyId,
            actorId: userId,
            action: "webhook_endpoint.test_sent",
            subjectType: "webhook_endpoint",
            subjectId: input.endpointId,
          });
        }),
      );
    },

    /**
     * Puts the delivery back in the queue, due now. Nothing is resolved here:
     * the failure closes when a delivery arrives.
     */
    async retryOperation(
      userId: string,
      input: OperationCommandInput,
    ): Promise<void> {
      await attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const scope = await operationScope(tx, input.operationId);
          await client.$queryRaw`
            select app.retry_failed_operation(${input.operationId}::uuid)`;
          await recordWithin(tx, {
            organizationId: scope.organizationId,
            locationId: scope.propertyId,
            actorId: userId,
            action: "failed_operation.retried",
            subjectType: "failed_operation",
            subjectId: input.operationId,
          });
        }),
      );
    },

    /** Stops a delivery that is still being retried. Who and why are kept. */
    async cancelOperation(
      userId: string,
      input: OperationClosureInput,
    ): Promise<void> {
      const reason = checkedReason(input.reason);
      await attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const scope = await operationScope(tx, input.operationId);
          await client.$queryRaw`
            select app.cancel_failed_operation(
                     ${input.operationId}::uuid, ${reason})`;
          await recordWithin(tx, {
            organizationId: scope.organizationId,
            locationId: scope.propertyId,
            actorId: userId,
            action: "failed_operation.cancelled",
            subjectType: "failed_operation",
            subjectId: input.operationId,
            reason,
          });
        }),
      );
    },

    /** Marks a delivery that has run out of attempts as dealt with elsewhere. */
    async resolveOperation(
      userId: string,
      input: OperationClosureInput,
    ): Promise<void> {
      const reason = checkedReason(input.reason);
      await attempting(() =>
        withOrganizationContext(db, { userId }, async (tx) => {
          const client = tx as unknown as PrismaClient;
          const scope = await operationScope(tx, input.operationId);
          await client.$queryRaw`
            select app.resolve_failed_operation(
                     ${input.operationId}::uuid, ${reason})`;
          await recordWithin(tx, {
            organizationId: scope.organizationId,
            locationId: scope.propertyId,
            actorId: userId,
            action: "failed_operation.resolved",
            subjectType: "failed_operation",
            subjectId: input.operationId,
            reason,
          });
        }),
      );
    },
  };
}

export type IntegrationsModule = ReturnType<typeof createIntegrationsModule>;
