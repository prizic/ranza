# Preparing a Supabase project for Ranza

Supabase is used only as managed PostgreSQL (ADR 0002). None of its auth,
PostgREST, storage or realtime features are used, so nothing here depends on a
Supabase-specific API.

## The part that matters

**Supabase's `postgres` role has `BYPASSRLS = true`.** It is not a superuser, but
that flag alone is enough to switch off every policy. Connecting the application
as `postgres` produces a system that looks like it works and silently serves one
Organization's rows to another.

`tests/integration/tenant-isolation.test.ts` detects this. Pointed at `postgres`
it fails all four assertions; pointed at `ranza_app` it passes.

## Steps

1. **Find the region.** Every regional pooler hostname resolves in DNS whether or
   not it hosts your project, so DNS cannot tell you. Authenticate instead — the
   wrong region returns `FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`.

2. **Use the pooler for both connections.** The direct host
   `db.<ref>.supabase.co` is IPv6-only; `psql` reports "could not translate host
   name" on an IPv4-only path even though the AAAA record exists.

   | Purpose                        | Port                   | Role                 |
   | ------------------------------ | ---------------------- | -------------------- |
   | Runtime (`DATABASE_URL`)       | 6543, transaction mode | `ranza_app.<ref>`    |
   | Worker (`WORKER_DATABASE_URL`) | 6543, transaction mode | `ranza_worker.<ref>` |
   | Migrations (`DIRECT_URL`)      | 5432, session mode     | `postgres.<ref>`     |

   Append `?pgbouncer=true&connection_limit=1` to the runtime URL. Transaction
   mode cannot use prepared statements.

3. **Apply the migration** with the session connection.

4. **Give the three application roles passwords.** The migrations create
   `ranza_app`, `ranza_auth` and `ranza_worker` without one, because each
   environment supplies its own:

   ```sql
   alter role ranza_app    with login password '<generated>';
   alter role ranza_auth   with login password '<generated>';
   alter role ranza_worker with login password '<generated>';
   ```

   Verify `rolsuper` and `rolbypassrls` are false on all three:

   ```sql
   select rolname, rolcanlogin, rolsuper, rolbypassrls
   from pg_roles where rolname in ('ranza_app', 'ranza_auth', 'ranza_worker');
   ```

   They are separate on purpose. `ranza_auth` reaches the credential tables;
   `ranza_app` is the tenant query path and is granted nothing there, so a defect
   in application queries cannot read password hashes or session tokens;
   `ranza_worker` reaches the outbox and whatever a handler was explicitly
   granted, and is granted no execute on `app.set_request_context()` so it cannot
   impersonate a Staff Member ([ADR 0018](../adr/0018-the-worker-has-its-own-role-and-its-own-context.md)).
   Confirm the separation actually holds rather than assuming the grants are
   right:

   ```sql
   -- as ranza_app, this must fail with "permission denied for table auth_account"
   select count(*) from public.auth_account;

   -- as ranza_worker, both of these must fail with "permission denied"
   select count(*) from public.folios;
   select app.set_request_context('00000000-0000-4000-8000-000000000000');
   ```

5. **Grant membership so tests can switch roles.** The pgTAP suites run
   `set local role ranza_app`, which `postgres` cannot do without membership
   because it is not a superuser here. **All three**, not two:

   ```sql
   grant ranza_app to postgres;
   grant ranza_worker to postgres;
   grant ranza_auth to postgres;
   ```

   `ranza_auth` was missing here until 2026-09-19, and the manner it hid in is
   the part worth keeping. Creating a role as `postgres` leaves an automatic
   membership behind — granted by `supabase_admin`, with `inherit_option` and
   **`set_option` both false**. So `pg_auth_members` shows `postgres` as a
   member of all three and `\du` shows nothing amiss, while the role cannot
   actually be entered: `set role ranza_auth` is refused, because membership
   without `SET` is not membership you can use. Two of the three had a real grant on top of that; the credential role
   did not, and no local database has the shape, because locally `ranza` owns
   the cluster.

   It surfaced the first time a suite that switches into `ranza_auth` was run
   against the hosted database — `insert_grants.test.sql`, whose `ranza_app`
   half had already passed there. Check `set_option`, not membership:

   ```sql
   select r.rolname, m.rolname as member, am.inherit_option, am.set_option
     from pg_auth_members am
     join pg_roles r on r.oid = am.roleid
     join pg_roles m on m.oid = am.member
    where r.rolname in ('ranza_app', 'ranza_auth', 'ranza_worker');
   ```

## Verifying

```sh
pnpm db:test          # pgTAP, uses DIRECT_URL
pnpm test:integration # uses all four connection strings
```

Four connection strings are needed, one per role: `DATABASE_URL` for the tenant
query path as `ranza_app`, `DIRECT_URL` for migrations as `postgres`,
`AUTH_DATABASE_URL` for credentials as `ranza_auth`, and `WORKER_DATABASE_URL`
for the background worker as `ranza_worker`. The worker refuses to start if the
last of those turns out to equal `DIRECT_URL`, or if the role behind it is a
superuser, carries `BYPASSRLS`, or owns a table — a URL cannot say any of that,
so it is asked of `pg_roles` at boot.

Then prove the guard still works by pointing `DATABASE_URL` at the `postgres`
role: all four integration assertions must fail. A tenant-isolation test that has
never been seen to fail is not evidence of anything.
