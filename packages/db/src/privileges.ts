import type { PrismaClient } from "./client";

interface RolePrivileges {
  rolsuper: boolean;
  rolbypassrls: boolean;
  ownsTables: boolean;
}

/**
 * Refuses a connection whose role would not be subject to row-level security.
 *
 * A connection string cannot say whether the role behind it owns a table or
 * carries BYPASSRLS, and both disable every policy while leaving them looking
 * correct — which is the failure this repository has already had once, in
 * production, invisibly. So each host asks the database what it actually
 * connected as, before serving anything (ADR 0018, amended).
 *
 * `pg_has_role(current_user, c.relowner, 'USAGE')` rather than
 * `c.relowner = current_user::regrole`: a role that is merely a *member* of the
 * owning role inherits the ownership and bypasses row-level security exactly as
 * the owner does, and the simpler comparison would not see it.
 *
 * Every non-system schema, not just `public`: the worker's queue lives in
 * `outbox`, the audit log in `audit`, and a module may own a schema of its own
 * (ADR 0008), so a check that looked only at `public` would pass a role that
 * owned every one of them.
 *
 * `label` names the connection in the refusal — the environment variable the
 * host read it from — because this package reads no environment and cannot
 * know which one it was.
 */
export async function assertUnprivileged(
  db: PrismaClient,
  label: string,
): Promise<void> {
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
           and c.relkind in ('r', 'p')
           and pg_has_role(current_user, c.relowner, 'USAGE')
       ) as "ownsTables"
     from pg_roles as r
     where r.rolname = current_user`,
  );

  const role = rows[0];
  if (!role) {
    throw new Error(`${label}: could not determine which role it connects as`);
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
      `${label} connects as a role that ${faults.join(", ")}. ` +
        "Row-level security would not apply to it, so every policy would stop " +
        "binding while continuing to look correct.",
    );
  }
}
