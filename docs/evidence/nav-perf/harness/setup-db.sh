#!/bin/bash
# Throwaway-DB equivalent of scripts/db-setup.mjs, pointed at one evidence port.
set -euo pipefail
tree=$1; port=$2
url="postgresql://ranza:ranza@localhost:$port/ranza?connect_timeout=60"
cd "$tree"
ls packages/db/generated/prisma >/dev/null
env -u PGHOST -u PGPORT -u PGHOSTADDR DIRECT_URL="$url" packages/db/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma 2>&1 | tail -2
for role in ranza_app ranza_auth ranza_worker; do
  PGPASSWORD=ranza psql -h localhost -p $port -U ranza -d ranza -v ON_ERROR_STOP=1 -qc "alter role $role with login password '$role'"
done
PGPASSWORD=ranza psql -h localhost -p $port -U ranza -d ranza -Atc "select count(*) || ' migrations applied' from _prisma_migrations"
