import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import {
  WEBHOOK_EVENT_TYPES,
  type EndpointHealth,
  type EndpointsView,
  type FailedOperationPage,
  type FailedOperationQuery,
  type FailedOperationRecord,
  type OperationClosureInput,
  type OperationCommandInput,
  type OperationStatus,
  type RegisterEndpointInput,
  type RegisteredEndpoint,
  type RetryAllInput,
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

/**
 * The SQLSTATEs the functions in 20260916011200 raise, and what each means
 * here. Matched on the code the database sent and on nothing else: the text of
 * a message is not a contract, and a message that happens to contain five
 * digits is not a refusal.
 */
const REFUSALS: readonly [sqlState: string, reason: RefusalReason][] = [
  ["42501", "not_permitted"],
  ["23505", "duplicate_url"],
  ["23514", "reason_required"],
  ["54000", "too_many_endpoints"],
  ["55000", "test_in_flight"],
  ["22023", "unavailable"],
];

/** The SQLSTATE of a statement that failed in the database, when it did. */
function sqlStateOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { meta } = error as {
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  const code = meta?.driverAdapterError?.cause?.originalCode;
  return typeof code === "string" ? code : null;
}

/** A statement's failure as this module's refusal, or as it was for the host to report. */
function refusal(error: unknown): Error {
  const sqlState = sqlStateOf(error);
  const known = REFUSALS.find(([code]) => code === sqlState);
  if (known) return new IntegrationsRefusedError(known[1], { cause: error });
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
  urlMasked: boolean;
  eventTypes: string[];
  createdAt: Date;
  lastDeliveredAt: Date | null;
  queued: number;
  overdue: number;
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
  retryable: boolean;
  closedAt: Date | null;
  closedBy: string | null;
  closedReason: string | null;
}

/**
 * Outbound webhooks, and the failures an operator is shown (ADR 0045).
 *
 * Every command runs inside the acting user's request context (ADR 0007), and
 * the writes are functions that ask blueprint 3.5's gates themselves and write
 * their own audit record, so this module checks no permission and records
 * nothing: it validates what the caller typed and calls the function. Sending
 * is the worker's, not this module's; nothing here opens a connection to an
 * endpoint.
 */
export function createIntegrationsModule({ db }: IntegrationsDeps) {
  async function inContext<T>(
    userId: string,
    run: (client: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return attempting(() =>
      withOrganizationContext(db, { userId }, (tx) =>
        run(tx as unknown as PrismaClient),
      ),
    );
  }

  return {
    /**
     * The Organization's active endpoints and how each is doing, as far as the
     * viewer reaches: the counts come from deliveries the policies let them
     * read, so a Manager of one Property sees that Property's share. The address
     * is the database's answer to what this viewer may read of it.
     */
    async endpoints(
      userId: string,
      organizationId: string,
    ): Promise<EndpointsView> {
      return inContext(userId, async (client) => {
        const rows = await client.$queryRaw<EndpointRow[]>`
          select endpoint.id,
                 endpoint.organization_id as "organizationId",
                 endpoint.name, address.url,
                 address.url_masked as "urlMasked",
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
                    from public.webhook_deliveries as delivery
                   where delivery.endpoint_id = endpoint.id
                     and delivery.status in ('pending', 'retrying')
                     and delivery.next_attempt_at < now() - interval '5 minutes') as overdue,
                 (select count(*)::int
                    from public.failed_operations as failure
                   where failure.endpoint_id = endpoint.id
                     and failure.status in ('failed', 'retrying')) as "openFailures"
            from public.webhook_endpoints as endpoint
            join app.webhook_endpoint_urls(${organizationId}::uuid) as address
              on address.endpoint_id = endpoint.id
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

    /**
     * Failures at a Property, a page at a time: the ones still being asked
     * about, newest attempt first, or the ones that have been closed, newest
     * closure first, with who closed them and why.
     */
    async failedOperations(
      userId: string,
      propertyId: string,
      query: FailedOperationQuery,
    ): Promise<FailedOperationPage> {
      const closed = query.view === "closed";
      return inContext(userId, async (client) => {
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
                 delivery.last_response_excerpt as "lastResponseExcerpt",
                 (failure.delivery_id is not null
                    and failure.error <> 'source_mismatch') as retryable,
                 failure.closed_at as "closedAt",
                 failure.closed_by as "closedBy",
                 failure.closed_reason as "closedReason"
            from public.failed_operations as failure
            left join public.webhook_deliveries as delivery
              on delivery.id = failure.delivery_id
             and delivery.organization_id = failure.organization_id
           where failure.property_id = ${propertyId}::uuid
             and (failure.status in ('resolved', 'cancelled')) = ${closed}
           order by case when ${closed} then failure.closed_at
                         else failure.last_attempt_at end desc nulls last,
                    failure.id
           limit ${query.limit}::int offset ${query.offset}::int`;
        const records: FailedOperationRecord[] = rows.map((row) => ({
          ...row,
          status: row.status as OperationStatus,
        }));
        const [counted] = await client.$queryRaw<{ total: number }[]>`
          select count(*)::int as total
            from public.failed_operations as failure
           where failure.property_id = ${propertyId}::uuid
             and (failure.status in ('resolved', 'cancelled')) = ${closed}`;
        return { records, total: counted?.total ?? 0 };
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

      return inContext(userId, async (client) => {
        const [created] = await client.$queryRaw<{ endpointId: string }[]>`
          select app.create_webhook_endpoint(
                   ${input.organizationId}::uuid, ${name},
                   ${target.url.href}, ${eventTypes}::text[], ${secret}
                 ) as "endpointId"`;
        if (!created) throw new Error("the endpoint was not created");
        return { endpointId: created.endpointId, secret };
      });
    },

    /** Removes an endpoint: it stops receiving, and what was on its way is cancelled. */
    async removeEndpoint(userId: string, endpointId: string): Promise<void> {
      await inContext(
        userId,
        (client) =>
          client.$queryRaw`select app.remove_webhook_endpoint(${endpointId}::uuid)`,
      );
    },

    /** Queues a test event; the worker sends it on its next pass. */
    async sendTestEvent(userId: string, input: SendTestInput): Promise<void> {
      await inContext(
        userId,
        (client) =>
          client.$queryRaw`
          select app.send_webhook_test(
                   ${input.endpointId}::uuid, ${input.propertyId}::uuid)`,
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
      await inContext(
        userId,
        (client) =>
          client.$queryRaw`
          select app.retry_failed_operation(${input.operationId}::uuid)`,
      );
    },

    /** Stops a delivery that is still being retried. Who and why are kept. */
    async cancelOperation(
      userId: string,
      input: OperationClosureInput,
    ): Promise<void> {
      const reason = checkedReason(input.reason);
      await inContext(
        userId,
        (client) =>
          client.$queryRaw`
          select app.cancel_failed_operation(${input.operationId}::uuid, ${reason})`,
      );
    },

    /** Marks a delivery that has run out of attempts as dealt with elsewhere. */
    async resolveOperation(
      userId: string,
      input: OperationClosureInput,
    ): Promise<void> {
      const reason = checkedReason(input.reason);
      await inContext(
        userId,
        (client) =>
          client.$queryRaw`
          select app.resolve_failed_operation(${input.operationId}::uuid, ${reason})`,
      );
    },
    /**
     * Puts every failure at a Property that can be sent again back in the
     * queue, in one transaction, and says how many. Each goes through the same
     * function a single Retry does, so each is gated and audited on its own;
     * one the person may not retry refuses the lot rather than skipping it
     * quietly.
     */
    async retryAllOperations(
      userId: string,
      input: RetryAllInput,
    ): Promise<number> {
      return inContext(userId, async (client) => {
        const retried = await client.$queryRaw<{ id: string }[]>`
          select failure.id, app.retry_failed_operation(failure.id)
            from public.failed_operations as failure
           where failure.property_id = ${input.propertyId}::uuid
             and failure.status = 'failed'
             and failure.delivery_id is not null
             and failure.error <> 'source_mismatch'
           order by failure.last_attempt_at, failure.id`;
        return retried.length;
      });
    },
  };
}

export type IntegrationsModule = ReturnType<typeof createIntegrationsModule>;
