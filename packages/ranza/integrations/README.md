# @ranza/integrations

Channels, payment providers, door locks, and external integrations (blueprint 5.15, 5.16, Phase 5).
Manages external system connectivity, failure recording, operation visibility, and operational retry.

## What this module owns

The `integrations` and `failed_operations` tables, their constraints, and row-level security policies — in
[`prisma/migrations/20260916010000_integrations_and_failures`](../../../prisma/migrations/20260916010000_integrations_and_failures/migration.sql).

## Contract

```ts
import { createIntegrationsModule } from "@ranza/integrations";

const integrationsModule = createIntegrationsModule({ db });
await integrationsModule.integrations(userId, propertyId);
await integrationsModule.failedOperations(userId, propertyId);
await integrationsModule.connectIntegration(userId, data);
await integrationsModule.recordFailure(userId, failure);
await integrationsModule.retryOperation(userId, { operationId, propertyId });
```

- `integrations(userId, propertyId)`: Returns integrations configured for a Property with status (`connected`, `error`, `not_connected`).
- `failedOperations(userId, propertyId)`: Lists operations that failed with external systems, their error message, and attempt count.
- `connectIntegration(userId, input)`: Connects an external integration.
- `recordFailure(userId, input)`: Records a failed external operation and moves integration to `error` status.
- `retryOperation(userId, input)`: Retries an operation, marking it resolved upon success and returning integration to `connected` when all failures are cleared.

## Rules

- Receives its client; never reads the environment or process.env (ADR 0006).
- Row-level security enforces tenant boundaries and permissions (`integrations.view`, `integrations.manage`).
- Never deletes operational history: resolved operations remain or are tracked.
