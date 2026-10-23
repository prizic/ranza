import { createDayCloser, type DayCloser } from "@ranza/business-day";
import {
  assertUnprivileged,
  createPrismaClient,
  type PrismaClient,
} from "@ranza/db";
import {
  createOutboxDispatcher,
  type OutboxDispatcher,
} from "@ranza/platform-outbox";
import { createExportRunner, type ExportRunner } from "@ranza/data-export";
import {
  createWebhookDelivery,
  type WebhookDelivery,
} from "@ranza/integrations";

/**
 * The composition root, and the only file in this application that reads the
 * environment or opens a connection (ADR 0006). A boundary fixture proves the
 * rule fires, because "only this file" is otherwise a convention.
 *
 * It mirrors `apps/operator-workspace/src/server/composition.ts`, including
 * the role check both request hosts make before they serve (`assertUnprivileged`
 * from `@ranza/db`, ADR 0018), and adds a refusal they do not need: the runtime
 * connection, whose role has no worker context. A worker runs unattended —
 * nobody watches its first request succeed — so it makes its checks before it
 * dispatches anything.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set before the worker can run`);
  }
  return value;
}

/**
 * Whether a webhook may be sent over plain http to this machine, which exists
 * so a test can run a receiver here. A deployment sets NODE_ENV=production, and
 * a production worker told to allow it refuses to start rather than quietly
 * widening the one guard standing between an endpoint's URL and the network the
 * worker lives in (ADR 0045).
 */
function allowsLoopbackWebhooks(): boolean {
  if (process.env.WEBHOOK_ALLOW_LOOPBACK_HTTP !== "true") return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WEBHOOK_ALLOW_LOOPBACK_HTTP must not be set in production: it lets a webhook reach this machine",
    );
  }
  return true;
}

export interface Composition {
  db: PrismaClient;
  outbox: OutboxDispatcher;
  closer: DayCloser;
  dataExport: ExportRunner;
  webhooks: WebhookDelivery;
  disconnect(): Promise<void>;
}

export async function createComposition(): Promise<Composition> {
  const url = required("WORKER_DATABASE_URL");

  // DIRECT_URL is the migration connection and its role owns the tables. The
  // check below would catch it anyway; this one names the mistake, because
  // "you pasted the wrong URL" is more useful than "your role owns tables".
  if (url === process.env.DIRECT_URL) {
    throw new Error(
      "WORKER_DATABASE_URL must not be the migration connection: its role owns the tables, so row-level security would not apply",
    );
  }

  // Nor ranza_app's. The worker has no acting user, so under that role every
  // policy would deny and the queue would look permanently empty — a failure
  // that produces silence rather than an error.
  if (url === process.env.DATABASE_URL) {
    throw new Error(
      "WORKER_DATABASE_URL must not be the runtime connection: ranza_app has no worker context and would reach nothing",
    );
  }

  const allowLoopbackHttp = allowsLoopbackWebhooks();

  const db = createPrismaClient(url);
  try {
    await assertUnprivileged(db, "WORKER_DATABASE_URL");
  } catch (error) {
    await db.$disconnect();
    throw error;
  }

  return {
    db,
    outbox: createOutboxDispatcher({ db }),
    closer: createDayCloser({ db }),
    dataExport: createExportRunner({ db }),
    webhooks: createWebhookDelivery({ db, allowLoopbackHttp }),
    disconnect: () => db.$disconnect(),
  };
}
