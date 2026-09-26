import { createDayCloser, type DayCloser } from "@ranza/business-day";
import { createPrismaClient, type PrismaClient } from "@ranza/db";
import {
  createOutboxDispatcher,
  type OutboxDispatcher,
} from "@ranza/platform-outbox";

/**
 * The composition root, and the only file in this application that reads the
 * environment or opens a connection (ADR 0006). A boundary fixture proves the
 * rule fires, because "only this file" is otherwise a convention.
 *
 * It mirrors `apps/operator-workspace/src/server/composition.ts` and adds two
 * refusals that one does not have. A worker runs unattended: nobody watches its
 * first request succeed, so a misconfiguration that a web application would
 * reveal in seconds can run here for weeks.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set before the worker can run`);
  }
  return value;
}

interface RolePrivileges {
  rolsuper: boolean;
  rolbypassrls: boolean;
  ownsTables: boolean;
}

/**
 * Asks the database what the worker actually connected as.
 *
 * A connection string cannot say whether the role behind it owns a table or
 * carries BYPASSRLS, and both disable every policy while leaving them looking
 * correct — which is the failure this repository has already had once, in
 * production, invisibly. So it is asked rather than assumed, at boot, before
 * anything is dispatched.
 *
 * `pg_has_role(current_user, c.relowner, 'USAGE')` rather than
 * `c.relowner = current_user::regrole`: a role that is merely a *member* of the
 * owning role inherits the ownership and bypasses row-level security exactly as
 * the owner does, and the simpler comparison would not see it.
 *
 * Every non-system schema, not just `public`. The worker's own queue lives in
 * `outbox` and a handler's tables may live anywhere a module owns a schema
 * (ADR 0008), so a check that looked only at `public` would have passed a role
 * that owned every one of them.
 */
export async function assertUnprivileged(db: PrismaClient): Promise<void> {
  const rows = await db.$queryRawUnsafe<RolePrivileges[]>(
    `select
       r.rolsuper,
       r.rolbypassrls,
       exists (
         select 1
         from pg_class as c
         join pg_namespace as n on n.oid = c.relnamespace
         where n.nspname not in ('pg_catalog', 'information_schema')
           and n.nspname not like 'pg\\_%'
           and c.relkind = 'r'
           and pg_has_role(current_user, c.relowner, 'USAGE')
       ) as "ownsTables"
     from pg_roles as r
     where r.rolname = current_user`,
  );

  const role = rows[0];
  if (!role) {
    throw new Error(
      "the worker could not determine which role it connected as",
    );
  }

  const faults = [
    role.rolsuper ? "is a superuser" : null,
    role.rolbypassrls ? "has BYPASSRLS" : null,
    role.ownsTables
      ? "owns tenant tables, or is a member of the role that does"
      : null,
  ].filter((fault): fault is string => fault !== null);

  if (faults.length > 0) {
    throw new Error(
      `WORKER_DATABASE_URL connects as a role that ${faults.join(", ")}. ` +
        "Row-level security would not apply to it, so every policy would stop " +
        "binding while continuing to look correct. Use ranza_worker.",
    );
  }
}

export interface Composition {
  db: PrismaClient;
  outbox: OutboxDispatcher;
  closer: DayCloser;
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

  const db = createPrismaClient(url);
  try {
    await assertUnprivileged(db);
  } catch (error) {
    await db.$disconnect();
    throw error;
  }

  return {
    db,
    outbox: createOutboxDispatcher({ db }),
    closer: createDayCloser({ db }),
    disconnect: () => db.$disconnect(),
  };
}
