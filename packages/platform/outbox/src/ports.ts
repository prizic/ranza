import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * One client, and which role is behind it decides what this module can do. A
 * publisher passes the request-scoped runtime client; the dispatcher passes the
 * worker's. Neither may be an owner or carry BYPASSRLS — the grants and policies
 * in `20260916001400_platform_outbox` are the whole of what bounds this schema,
 * and a privileged connection is subject to neither.
 *
 * The module does not verify that, because a module cannot: it is handed a
 * client and has no way to know what opened it. The host checks at startup, and
 * `apps/worker/src/composition.ts` is where that check lives.
 */
export interface OutboxDeps {
  db: PrismaClient;
}
