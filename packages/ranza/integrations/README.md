# @ranza/integrations

The first integration: an outbound webhook (blueprint 5.15, 5.16, 13 Phase 5,
[ADR 0045](../../../docs/adr/0045-the-first-integration-is-a-signed-outbound-webhook-the-worker-sends-and-refuses-private-addresses.md)).
An Organization registers an HTTPS address and chooses events; the worker posts
each one to it as signed JSON; what did not arrive is on the Integrations screen
with what the receiver said and when it is tried next.

## What this module owns

The `webhook_endpoints`, `webhook_endpoint_secrets` and `webhook_deliveries`
tables and the `failed_operations` view of them, with their constraints, policies
and the functions that write them, in
[`prisma/migrations/20260916011200_an_organization_registers_a_webhook`](../../../prisma/migrations/20260916011200_an_organization_registers_a_webhook/migration.sql).

## Two halves

**The workspace's** (`createIntegrationsModule({ db })`, `db` is `ranza_app`):

```ts
const integrations = createIntegrationsModule({ db });
await integrations.endpoints(userId, organizationId); // { endpoints, mayManage }
await integrations.failedOperations(userId, propertyId);
await integrations.registerEndpoint(userId, {
  organizationId,
  name,
  url,
  eventTypes,
}); // { endpointId, secret }
await integrations.removeEndpoint(userId, endpointId);
await integrations.sendTestEvent(userId, { endpointId, propertyId });
await integrations.retryOperation(userId, { operationId });
await integrations.cancelOperation(userId, { operationId, reason });
await integrations.resolveOperation(userId, { operationId, reason });
```

Every write is a database function that asks blueprint 3.5's gates itself, and
the module records who did it in the audit log (`webhook_endpoint.registered`,
`.removed`, `.test_sent`, `failed_operation.retried`, `.cancelled`, `.resolved`).
Nothing here opens a connection to an endpoint.

**The worker's** (`createWebhookDelivery({ db, allowLoopbackHttp })`, `db` is
`ranza_worker`):

```ts
const { processDueDeliveries } = createWebhookDelivery({ db });
await processDueDeliveries(); // { due, outcomes, unrecorded }
```

It lists the due deliveries, claims each in its own Organization's context,
reads the signing secret for the one it holds, makes the request with no
transaction open, and records the outcome. The retry schedule, the state of a
delivery and the failure an operator is shown are all decided in the database
(`app.record_webhook_attempt`).

## Files

| File           | What it is                                                            |
| -------------- | --------------------------------------------------------------------- |
| `module.ts`    | The workspace's commands and reads                                    |
| `delivery.ts`  | The worker's pass: due, claim, secret, send, record                   |
| `transport.ts` | One attempt over `node:http(s)`, and how an answer is judged          |
| `target.ts`    | Which addresses a webhook may be registered with and connected to     |
| `signing.ts`   | `X-Ranza-Signature`, and the verification a receiver does             |
| `contracts.ts` | Types, and the six events that can be subscribed to                   |
| `errors.ts`    | Why a command did not happen, as codes the host says in its own words |

## What a receiver gets

`POST` with `Content-Type: application/json` and:

| Header                                | Meaning                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `X-Ranza-Signature: sha256=<hex>`     | HMAC-SHA256, keyed with the endpoint's secret, of `<timestamp>.<body>`      |
| `X-Ranza-Timestamp`                   | Unix seconds the request was made; reject one that is too old               |
| `Idempotency-Key`, `X-Ranza-Event-Id` | The outbox event id, or the delivery id for a test; the same on every retry |
| `X-Ranza-Delivery`, `X-Ranza-Attempt` | The delivery's id, and which attempt this is                                |
| `X-Ranza-Event`                       | The event type                                                              |

The body is `{ id, type, occurredAt, organizationId, propertyId, data }`, where
`data` holds ids, dates, amounts and statuses and never anything a person typed.
Delivery is at least once, so a receiver treats a repeated `Idempotency-Key` as
the same event.

## Rules

- Receives its client; never reads the environment or `process.env` (ADR 0006).
  The one flag that widens where a webhook may be sent (plain http to this
  machine, for tests) is read by the worker's composition root, which refuses to
  start with it in production.
- Row-level security and the functions' own checks are the boundary; this
  module checks no permission.
- Never deletes history: an endpoint is removed by status, and a failure is
  closed with who and why.
- No role holds a grant on the signing secrets. The worker reads one through
  `app.webhook_delivery_secret()` for a delivery it holds the lease on.
