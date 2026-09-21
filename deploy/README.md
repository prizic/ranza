# Deploying Ranza

Everything here builds and runs the hosted environment described in
[`docs/runbooks/hetzner-staging.md`](../docs/runbooks/hetzner-staging.md).
That runbook is the operational side — the host, the first-time setup, how to
sign in, what to check when something is wrong. This directory is the
mechanism.

|                      |                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`         | One build stage, then four targets: `migrate`, `workspace`, `portal`, `worker`. Build context is the repository root                           |
| `docker-compose.yml` | The environment: PostgreSQL, the one-shot migration, both applications and the worker, with Traefik labels for the host's reverse proxy        |
| `.env.example`       | Every value the compose file needs. The real file lives at `/opt/apps/ranza/.env` on the host, outside the source tree, and is never committed |
| `push.sh`            | From a developer's machine: ships the commit at `HEAD` to the host and runs `apply.sh` there                                                   |
| `apply.sh`           | On the host: build, migrate, set the runtime role passwords, start, verify                                                                     |

## Deploying

```sh
deploy/push.sh
```

That is the whole procedure. `push.sh` sends a `git archive` of `HEAD` — never
the working tree, so what runs is a commit somebody can `git show` — and
`apply.sh` refuses to report success until both applications answer over HTTPS
and the worker has survived its own boot checks.

`pnpm check` must pass before the commit exists, as always. Nothing here
re-runs it.

## What the image is

Both Next.js applications build with `output: "standalone"` (their
`next.config.ts`), so each runtime image holds `server.js` and only the
`node_modules` the build traced — not the workspace. The worker is the esbuild
bundle `apps/worker` already produces, plus `@prisma/client` — the only one of
its externals it actually imports.
The `Dockerfile` says why each stage looks the way it does; the short version
is that every stage is database-free, because composition roots build their
clients on first use.

## Roles and secrets

The four connection strings the compose file assembles are the four roles the
migrations create — see [`docs/runbooks/supabase-setup.md`](../docs/runbooks/supabase-setup.md)
for why they are separate and what each one is granted. The migrations create
the three runtime roles without a password; `apply.sh` sets those from `.env`
on every deploy, so rotating one is editing `.env` and deploying.

`DIRECT_URL`, the owner connection, is given to the `migrate` service and to
nothing else. The applications refuse to start when `DATABASE_URL` equals it;
not handing it to them at all is the stronger version of that check.
