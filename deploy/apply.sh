#!/usr/bin/env bash
# Runs on the host, from the source tree deploy/push.sh put there. Builds the
# images, applies migrations, sets the runtime role passwords, starts every
# service, and refuses to report success until both applications answer over
# HTTPS and the worker is still running.
set -euo pipefail

root=/opt/apps/ranza
env_file=$root/.env
cd "$(dirname "$0")"

if [ ! -f "$env_file" ]; then
  echo "$env_file is missing. Copy deploy/.env.example there and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
export RANZA_REVISION=${RANZA_REVISION:-$(cat ../.revision 2>/dev/null || echo dev)}

compose() { docker compose --env-file "$env_file" "$@"; }

echo "== building $RANZA_REVISION"
compose build

echo "== migrating"
compose up -d --wait db
compose up -d migrate
# `wait` returns the container's exit code, so a failed migration stops the
# deploy here — with its own log, because "exited with status code 1" is not
# a reason.
if ! compose wait migrate >/dev/null; then
  compose logs --no-log-prefix migrate >&2
  echo "FAILED migrations did not apply; nothing new was started" >&2
  exit 1
fi
compose logs --no-log-prefix migrate | tail -n 3

# The migrations create the three runtime roles without a password; each
# environment supplies its own. Idempotent, and run every time, so the .env on
# this host is the only place a runtime credential lives.
echo "== setting runtime role passwords"
compose exec -T db psql -U ranza -d ranza -q -v ON_ERROR_STOP=1 \
  -v app="$RANZA_APP_PASSWORD" \
  -v auth="$RANZA_AUTH_PASSWORD" \
  -v worker="$RANZA_WORKER_PASSWORD" <<'SQL'
alter role ranza_app    with login password :'app';
alter role ranza_auth   with login password :'auth';
alter role ranza_worker with login password :'worker';
SQL

echo "== starting"
compose up -d --wait --remove-orphans

# Certificates are issued on first contact, so the first deploy of a hostname
# can take Traefik a moment to answer with a real one.
echo "== verifying"
for host in "$WORKSPACE_HOST" "$PORTAL_HOST"; do
  for attempt in $(seq 1 12); do
    if curl -fsS --max-time 10 "https://$host/api/auth/ok" >/dev/null 2>&1; then
      echo "ok  https://$host"
      continue 2
    fi
    sleep 5
  done
  echo "FAILED https://$host/api/auth/ok did not answer" >&2
  exit 1
done

# /api/auth/ok answers without touching a database. A sign-in for an account
# that does not exist has to reach ranza_auth to say so: 401 means the
# application can reach its credentials, 500 means AUTH_DATABASE_URL cannot.
for host in "$WORKSPACE_HOST" "$PORTAL_HOST"; do
  status=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    "https://$host/api/auth/sign-in/email" \
    -H 'content-type: application/json' -H "origin: https://$host" \
    -d '{"email":"nobody@deploy.invalid","password":"not-a-password"}')
  if [ "$status" != 401 ]; then
    echo "FAILED https://$host cannot reach its auth database (sign-in answered $status, expected 401)" >&2
    docker logs "ranza-$([ "$host" = "$WORKSPACE_HOST" ] && echo workspace || echo portal)" --tail 20 >&2
    exit 1
  fi
  echo "ok  https://$host reaches ranza_auth"
done

# The worker has no port to probe. It exits non-zero when it refuses its
# connection (apps/worker/src/composition.ts) and Docker restarts it, so
# "running" alone proves nothing: a crash loop is running about half the time.
# The same start time five seconds later is what proves it survived its own
# boot checks — and its last lines say what it decided.
started=$(docker inspect -f '{{.State.StartedAt}}' ranza-worker)
sleep 5
if [ "$(docker inspect -f '{{.State.Status}} {{.State.StartedAt}}' ranza-worker)" != "running $started" ]; then
  echo "FAILED worker did not survive its boot checks:" >&2
  docker logs ranza-worker --tail 20 >&2
  exit 1
fi
docker logs ranza-worker --tail 3

# Images are tagged per commit, so a superseded deploy leaves four of them
# behind; a host whose disk fills with old builds is a fleet failure this
# repository has watched happen elsewhere. Rolling back is checking out the
# commit and deploying it, which the build cache makes quick.
echo "== removing superseded images"
# `|| true`: on a re-run of the same revision there is nothing to remove, and
# grep reports an empty selection as a failure.
superseded=$(docker images --format '{{.Repository}}:{{.Tag}}' |
  grep -E '^ranza-(migrate|workspace|portal|worker):' |
  grep -v ":$RANZA_REVISION\$" || true)
[ -z "$superseded" ] || echo "$superseded" | xargs docker image rm >/dev/null
docker image prune -f >/dev/null

echo "== deployed $RANZA_REVISION"
