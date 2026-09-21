# The hosted environment on Hetzner

A staging environment, not production. [ADR 0002](../adr/0002-drop-supabase-postgresql-only.md)
leaves production hosting undecided and this does not decide it: the database
is plain PostgreSQL in a container, nothing depends on the host, and the whole
thing moves by copying one `.env` file and running one script somewhere else.

The mechanism — images, compose file, scripts — is
[`deploy/`](../../deploy/README.md). This page is what a person needs to
operate it.

## Where it is

|            |                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Host       | `restra-staging-2`, `root@178.105.194.50`, Ubuntu 24.04, Docker Compose, Traefik on the `web` network |
| Source     | `/opt/apps/ranza/src` — replaced wholesale by every deploy                                            |
| Secrets    | `/opt/apps/ranza/.env` — outside the tree, so a deploy cannot take it with it                         |
| Workspace  | `https://ranza.178-105-194-50.nip.io`                                                                 |
| Portal     | `https://ranza-portal.178-105-194-50.nip.io`                                                          |
| Containers | `ranza-db`, `ranza-migrate`, `ranza-workspace`, `ranza-portal`, `ranza-worker`                        |

nip.io resolves any `<name>.<ip>.nip.io` to the IP, so no DNS record was
needed; Traefik issues the certificates through Let's Encrypt on first contact.

## Deploying

```sh
deploy/push.sh
```

It ships `HEAD` and runs `deploy/apply.sh` on the host, which refuses to
report success until the checks at the bottom of that script pass — read them
there rather than here, they are what actually runs.
`docker inspect ranza-workspace --format '{{.Config.Image}}'` says which
commit is live; images are tagged with it.

## First-time setup

Done once, already. Recorded so the environment can be rebuilt elsewhere.

1. Copy [`deploy/.env.example`](../../deploy/.env.example) to
   `/opt/apps/ranza/.env` on the host and fill it in. Passwords go inside
   connection URLs, so `openssl rand -hex 24` — no characters that need
   escaping.
2. `deploy/push.sh`. The first `apply.sh` builds the database image, applies
   every migration, and sets the runtime role passwords.
3. Create the first Organization and Staff Member — below.

## Signing in

The product has no self-service Organization creation and never will: Prizic
Control Plane will create Organizations, and an owner invites staff (blueprint
4.4). Neither exists yet, and `pnpm db:seed:dev` refuses any database that is
not a developer's own — by construction, because it writes a known password.

So the first account on a hosted environment is made by hand, the same way the
seed does it, with a password that is generated rather than known:

1. Sign up through the application's own route, which is what maps the
   provider subject onto a Ranza user ([ADR 0005](../adr/0005-better-auth-with-provider-indirection.md)).
   Better Auth refuses a request without an `Origin`, so send one:

   ```sh
   curl -fsS -c cookies https://ranza.178-105-194-50.nip.io/api/auth/sign-up/email \
     -H 'content-type: application/json' \
     -H 'origin: https://ranza.178-105-194-50.nip.io' \
     -d '{"email":"<email>","password":"<generated>","name":"<name>"}'
   curl -fsS -b cookies -o /dev/null https://ranza.178-105-194-50.nip.io/tr/today
   ```

   The second request is one authenticated request, which is what creates the
   `users` row a membership can point at.

2. Grant that user an Organization, as the owner role on the host:

   ```sh
   docker exec -it ranza-db psql -U ranza -d ranza
   ```

   The statement is the one in
   [`scripts/db-seed-dev.mjs`](../../scripts/db-seed-dev.mjs) — a single
   `with … insert` whose branches run from `organization` through `unit`:
   Organization, Subscription, Entitlements, Property, capabilities,
   membership, assignment, then every module Entitlement and Property
   capability the Workspace has a destination for, and the Units. Take it
   from there rather than from here, so this page cannot drift from what the
   seed actually inserts; three edits make it psql:

   - the branches from `departing_units` onward seed a demo day —
     Reservations and Stays. Drop them, and end the chain after `unit` with a
     statement of your own, since a `with` cannot stand alone:
     `select count(*) from unit;`. Edit the `unit` values to the rooms you
     want.
   - the JavaScript placeholders — `${ORGANIZATION}`, `${values}` and
     `${userId}` — become psql variables, `:'org'`, `:'property'` and
     `:'user_id'`, passed with `-v` or set with `\set`. The user id is
     `select id from public.users where lower(email) = lower(:'email')`.
     `${values}` is a list of Properties; `:'property'` is one, which is
     what a first environment needs.
   - `manager` and `assigned_properties` stay as they are: that pair is the
     path the policies are proven on.

The credentials of the account created this way are in the project's
`CLAUDE.local.md`, which is gitignored.

The sign-up route is reachable by anyone, as it is locally. An account made
that way belongs to no Organization and every policy denies it, which is the
designed outcome — but it is a row somebody can create, and closing the route
is a product decision that belongs with the Control Plane.

## Rotating a credential

The three runtime passwords: edit `/opt/apps/ranza/.env`, deploy. `apply.sh`
re-asserts them on every run.

The owner password is different. `POSTGRES_PASSWORD` is honoured only when
the volume is first initialised, so editing it in `.env` changes what the
`migrate` service tries and nothing about what the database expects. Change
both, in this order:

```sh
docker exec -it ranza-db psql -U ranza -d ranza -c "alter role ranza with password '<new>'"
```

then `.env`, then deploy. Deleting the volume to "reset" it would delete the
data with it.

## Proving the policies hold here

A green local run says the migrations produce the right database. It does not
say this database had them applied (AGENTS.md, "Testing security claims"). The
database is published on the host's loopback for exactly this:

```sh
ssh -N -L 54329:127.0.0.1:54329 root@178.105.194.50 &
DIRECT_URL="postgresql://ranza:<POSTGRES_PASSWORD>@localhost:54329/ranza" pnpm db:test
```

**Never tunnel to local port 54322.** `pnpm db:setup` and `pnpm db:seed:dev`
are hard-wired to `localhost:54322` and refuse anything else; a tunnel landing
there would make this database look like a developer's throwaway one to the
two scripts that overwrite role passwords and seed demo data.

## When something is wrong

```sh
ssh root@178.105.194.50
cd /opt/apps/ranza/src/deploy
docker compose --env-file /opt/apps/ranza/.env ps
docker logs ranza-workspace --tail 50
docker logs ranza-worker --tail 50      # exits non-zero if it refused its role
docker logs ranza-migrate               # the last migration run
```

A worker that is not running has almost certainly refused its connection: its
role was privileged, or its URL was one of the other two. The message names
which ([`apps/worker/src/composition.ts`](../../apps/worker/src/composition.ts)).

Traefik's dashboard on the host, `http://178.105.194.50:8080`, lists the
routers; a hostname that is not there is a label problem, not an application
one.
