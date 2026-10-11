import type { PrismaClient } from "@ranza/db";

/** What the workspace must provide (ADR 0006): the RLS-subject client, nothing else. */
export interface IntegrationsDeps {
  readonly db: PrismaClient;
}

/**
 * What the worker must provide.
 *
 * `db` is the worker's client (`ranza_worker`), never the runtime one.
 * `allowLoopbackHttp` exists so a test can run a receiver on this machine; the
 * worker's composition root refuses to set it in production (ADR 0045).
 */
export interface WebhookDeliveryDeps {
  readonly db: PrismaClient;
  readonly allowLoopbackHttp?: boolean;
}
