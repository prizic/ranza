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

   | Purpose                   | Port                   | Role              |
   | ------------------------- | ---------------------- | ----------------- |
   | Runtime (`DATABASE_URL`)  | 6543, transaction mode | `ranza_app.<ref>` |
   | Migrations (`DIRECT_URL`) | 5432, session mode     | `postgres.<ref>`  |

   Append `?pgbouncer=true&connection_limit=1` to the runtime URL. Transaction
   mode cannot use prepared statements.

3. **Apply the migration** with the session connection.

4. **Create the two application roles.** The migrations create `ranza_app` and
   `ranza_auth` without passwords, because each environment supplies its own:

   ```sql
   alter role ranza_app  with login password '<generated>';
   alter role ranza_auth with login password '<generated>';
   ```

   Verify `rolsuper` and `rolbypassrls` are false on both:

   ```sql
   select rolname, rolcanlogin, rolsuper, rolbypassrls
   from pg_roles where rolname in ('ranza_app', 'ranza_auth');
   ```

   They are separate on purpose. `ranza_auth` reaches the credential tables;
   `ranza_app` is the tenant query path and is granted nothing there, so a defect
   in application queries cannot read password hashes or session tokens. Confirm
   the separation actually holds rather than assuming the grants are right:

   ```sql
   -- as ranza_app, this must fail with "permission denied for table auth_account"
   select count(*) from public.auth_account;
   ```

5. **Grant membership so tests can switch roles.** The pgTAP suites run
   `set local role ranza_app`, which `postgres` cannot do without membership
   because it is not a superuser here:

   ```sql
   grant ranza_app to postgres;
   ```

## Verifying

```sh
pnpm db:test          # pgTAP, uses DIRECT_URL
pnpm test:integration # uses DATABASE_URL, DIRECT_URL and AUTH_DATABASE_URL
```

Three connection strings are needed, one per role: `DATABASE_URL` for the tenant
query path as `ranza_app`, `DIRECT_URL` for migrations as `postgres`, and
`AUTH_DATABASE_URL` for credentials as `ranza_auth`.

Then prove the guard still works by pointing `DATABASE_URL` at the `postgres`
role: all four integration assertions must fail. A tenant-isolation test that has
never been seen to fail is not evidence of anything.
