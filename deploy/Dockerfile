# syntax=docker/dockerfile:1.7
#
# One build, three runtime images. Build context is the repository root:
#
#   docker build -f deploy/Dockerfile --target workspace .
#   docker build -f deploy/Dockerfile --target portal .
#   docker build -f deploy/Dockerfile --target worker .
#
# deploy/docker-compose.yml does exactly that. Every stage is intentionally
# database-free: composition roots build their clients on first use, so a build
# never needs a reachable PostgreSQL (apps/*/src/server/composition.ts).

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
# The version package.json's "packageManager" names, read from there rather
# than repeated here. npm rather than corepack: corepack's signature keys have
# broken pnpm installs before, and an image build that fails on a key rotation
# is not a build anybody can reproduce.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")" \
 && npm cache clean --force

# ---------------------------------------------------------------------------
# Every dependency, dev ones included: the prisma CLI for migrations, esbuild
# and next for the builds. pnpm needs the whole workspace to resolve
# `workspace:*`; .dockerignore keeps node_modules, .next and .env out.
FROM base AS deps
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
# The generated client is gitignored (packages/db/generated), so it is produced
# here. prisma.config.ts falls back to an unresolvable host when DIRECT_URL is
# unset, and `generate` never connects.
RUN pnpm --filter @ranza/db generate

# ---------------------------------------------------------------------------
# Migrations. Nothing built, nothing more than deps: the prisma CLI, the schema,
# the migrations and prisma.config.ts. `pnpm db:migrate` is the same command a
# developer runs, so the image and the runbook cannot disagree about it.
FROM deps AS migrate
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------------------
FROM deps AS build
# Three builds, one at a time, and not `pnpm build`: turbo's `^build` would also
# run every package's tsc for output nothing here consumes, and two concurrent
# `next build`s on an 8 GB host is how a build dies with no error but "Killed".
RUN pnpm --filter @ranza/operator-workspace build
RUN pnpm --filter @ranza/guest-portal build
RUN pnpm --filter @ranza/worker build
# Prisma loads its query compiler through a dynamic import that file tracing
# has to notice. If it did not, fail here — not at the first query in
# production, where "missing module" looks like a broken deploy of something
# unrelated.
RUN test "$(find apps/*/.next/standalone \
      -path '*/@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs' \
      | wc -l)" -eq 2
# What the worker needs at runtime and esbuild left external: @prisma/client and
# its one dependency, which pnpm places as a symlink beside it in the virtual
# store. -L dereferences both into a plain directory. Then the bundle is loaded
# once from that layout: with no WORKER_DATABASE_URL the worker refuses in its
# own words, and reaching that refusal proves every import resolved. A Prisma
# upgrade that adds a runtime dependency fails this step, not the container.
RUN mkdir -p /worker/apps/worker/dist /worker/node_modules \
 && cp apps/worker/dist/main.mjs /worker/apps/worker/dist/main.mjs \
 && cp -rL node_modules/.pnpm/@prisma+client@*/node_modules/@prisma /worker/node_modules/@prisma \
 && cd /worker \
 && node apps/worker/dist/main.mjs 2>&1 | tee /dev/stderr | grep -q "WORKER_DATABASE_URL must be set"

# ---------------------------------------------------------------------------
# Next.js standalone output: server.js plus exactly the traced node_modules.
# `.next/static` is not part of the trace and is copied beside it, which is the
# layout server.js expects (apps/<name>/.next/static). Neither application has a
# public/ directory; add a COPY here the day one does.
#
# HOSTNAME is set in the image on purpose. Docker injects HOSTNAME=<container id>
# into every container, and server.js binds to whatever HOSTNAME says; an image
# ENV outranks that injection, 0.0.0.0 is what makes the port reachable.
FROM ${NODE_IMAGE} AS workspace
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/operator-workspace/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/operator-workspace/.next/static ./apps/operator-workspace/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/operator-workspace/server.js"]

FROM ${NODE_IMAGE} AS portal
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/guest-portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/guest-portal/.next/static ./apps/guest-portal/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/guest-portal/server.js"]

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /worker ./
USER node
# No port: the worker does not listen (ADR 0016). SIGTERM is its stop signal
# and it finishes the current pass first (apps/worker/src/main.ts).
STOPSIGNAL SIGTERM
CMD ["node", "apps/worker/dist/main.mjs"]
