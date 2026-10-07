import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import type {
  ConnectIntegrationInput,
  FailedOperationRecord,
  IntegrationRecord,
  IntegrationStatus,
  OperationStatus,
  RecordFailureInput,
  RetryOperationInput,
  RetryOperationResult,
} from "./contracts";
import type { IntegrationsDeps } from "./ports";

interface RawIntegration {
  id: string;
  organization_id: string;
  property_id: string;
  key: string;
  name: string;
  category: string;
  status: string;
  detail: string | null;
  config: unknown;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawFailedOperation {
  id: string;
  organization_id: string;
  property_id: string;
  integration_id: string | null;
  integration_name: string;
  operation: string;
  error: string;
  status: string;
  attempts: number;
  payload: unknown;
  last_attempt_at: Date;
  created_at: Date;
  updated_at: Date;
}

function mapIntegration(row: RawIntegration): IntegrationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    key: row.key,
    name: row.name,
    category: row.category,
    status: row.status as IntegrationStatus,
    detail: row.detail,
    config: (row.config as Record<string, unknown>) ?? {},
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFailedOperation(row: RawFailedOperation): FailedOperationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    integrationId: row.integration_id,
    integrationName: row.integration_name,
    operation: row.operation,
    error: row.error,
    status: row.status as OperationStatus,
    attempts: row.attempts,
    payload: (row.payload as Record<string, unknown>) ?? {},
    lastAttemptAt: row.last_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createIntegrationsModule({ db }: IntegrationsDeps) {
  return {
    /**
     * Lists all integrations configured at a Property.
     * Filtered by RLS to properties and permissions the viewer holds.
     */
    async integrations(
      userId: string,
      propertyId: string,
    ): Promise<IntegrationRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<RawIntegration[]>`
          select id, organization_id, property_id, key, name, category,
                 status, detail, config, last_sync_at, created_at, updated_at
            from public.integrations
           where property_id = ${propertyId}::uuid
           order by name asc
        `;
        return rows.map(mapIntegration);
      });
    },

    /**
     * Lists all active failed operations at a Property.
     * Returns operations with status = 'failed' or 'retrying'.
     */
    async failedOperations(
      userId: string,
      propertyId: string,
    ): Promise<FailedOperationRecord[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const rows = await client.$queryRaw<RawFailedOperation[]>`
          select id, organization_id, property_id, integration_id, integration_name,
                 operation, error, status, attempts, payload, last_attempt_at,
                 created_at, updated_at
            from public.failed_operations
           where property_id = ${propertyId}::uuid
             and status in ('failed', 'retrying')
           order by last_attempt_at desc
        `;
        return rows.map(mapFailedOperation);
      });
    },

    /**
     * Connects an integration at a Property.
     */
    async connectIntegration(
      userId: string,
      input: ConnectIntegrationInput,
    ): Promise<IntegrationRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const configJson = JSON.stringify(input.config ?? {});
        const rows = await client.$queryRaw<RawIntegration[]>`
          insert into public.integrations
            (property_id, organization_id, key, name, category, status, last_sync_at, config)
          select p.id, p.organization_id, ${input.key}, ${input.name}, ${input.category},
                 'connected', now(), ${configJson}::jsonb
            from public.properties p
           where p.id = ${input.propertyId}::uuid
          on conflict (property_id, key) do update
            set status = 'connected',
                detail = null,
                last_sync_at = now(),
                updated_at = now()
          returning id, organization_id, property_id, key, name, category,
                    status, detail, config, last_sync_at, created_at, updated_at
        `;
        const first = rows[0];
        if (!first) {
          throw new Error("Unable to connect integration");
        }
        return mapIntegration(first);
      });
    },

    /**
     * Records an external system integration failure.
     * Callable by worker or application when an external integration dispatch fails.
     */
    async recordFailure(
      userId: string,
      input: RecordFailureInput,
    ): Promise<FailedOperationRecord> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const payloadJson = JSON.stringify(input.payload ?? {});

        // 1. Ensure integration row exists in error status
        await client.$executeRaw`
          insert into public.integrations
            (property_id, organization_id, key, name, category, status, detail, last_sync_at)
          select p.id, p.organization_id, ${input.integrationKey}, ${input.integrationName},
                 'Distribution', 'error', ${input.error}, now()
            from public.properties p
           where p.id = ${input.propertyId}::uuid
          on conflict (property_id, key) do update
            set status = 'error',
                detail = ${input.error},
                last_sync_at = now(),
                updated_at = now()
        `;

        // 2. Insert or update failed operation
        const rows = await client.$queryRaw<RawFailedOperation[]>`
          insert into public.failed_operations
            (property_id, organization_id, integration_name, operation, error, status, attempts, payload, last_attempt_at)
          select p.id, p.organization_id, ${input.integrationName}, ${input.operation},
                 ${input.error}, 'failed', 1, ${payloadJson}::jsonb, now()
            from public.properties p
           where p.id = ${input.propertyId}::uuid
          returning id, organization_id, property_id, integration_id, integration_name,
                    operation, error, status, attempts, payload, last_attempt_at,
                    created_at, updated_at
        `;
        const first = rows[0];
        if (!first) {
          throw new Error("Unable to record failed operation");
        }
        return mapFailedOperation(first);
      });
    },

    /**
     * Retries a failed operation.
     * When successful, marks operation resolved and restores integration status to connected if no other failures remain.
     */
    async retryOperation(
      userId: string,
      input: RetryOperationInput,
    ): Promise<RetryOperationResult> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;

        // Fetch failed operation
        const ops = await client.$queryRaw<RawFailedOperation[]>`
          select id, organization_id, property_id, integration_id, integration_name,
                 operation, error, status, attempts, payload, last_attempt_at,
                 created_at, updated_at
            from public.failed_operations
           where id = ${input.operationId}::uuid
             and property_id = ${input.propertyId}::uuid
             and status in ('failed', 'retrying')
           for update
        `;

        const op = ops[0];
        if (!op) {
          throw new Error("Failed operation not found or already resolved");
        }

        // Mark as resolved
        await client.$executeRaw`
          update public.failed_operations
             set status = 'resolved',
                 updated_at = now()
           where id = ${input.operationId}::uuid
        `;

        // Check if other failed operations remain for this integration
        const remaining = await client.$queryRaw<{ count: bigint }[]>`
          select count(*)::bigint as count
            from public.failed_operations
           where property_id = ${input.propertyId}::uuid
             and integration_name = ${op.integration_name}
             and status in ('failed', 'retrying')
        `;

        const remainingCount = Number(remaining[0]?.count ?? 0);
        if (remainingCount === 0) {
          await client.$executeRaw`
            update public.integrations
               set status = 'connected',
                   detail = null,
                   last_sync_at = now(),
                   updated_at = now()
             where property_id = ${input.propertyId}::uuid
               and name = ${op.integration_name}
          `;
        }

        return {
          ok: true,
          operationId: op.id,
          integrationName: op.integration_name,
        };
      });
    },
  };
}
