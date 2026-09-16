// Do the migrations and schema.prisma still say the same thing?
//
// `--from-migrations` replays every migration into a shadow database, so this
// compares what they actually produce against what the schema says. Why that
// is a check rather than a claim is ADR 0001.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Local only, for the same reason `db:setup` is: Prisma DROPs and recreates the
// shadow database. Pointed at a real one, this command is a data-loss tool with
// a reassuring name.
//
// Only this URL is checked. `migrate diff --from-migrations --to-schema` never
// opens DIRECT_URL — verified by running it with DIRECT_URL pointed at a host
// that cannot resolve, which changes nothing — and guarding it anyway would
// refuse to run against the default `.env`, which points at Supabase, in
// exchange for no safety at all.
//
// CI needs no exception: its Postgres is a service container with its port
// mapped onto the runner, and the job does not itself run in a container, so
// the steps reach it at localhost:54322 like everywhere else. A job moved
// inside a container would reach it as `postgres:5432` and be refused here —
// correctly, and the fix then is one named host, not a looser check.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const url = process.env.SHADOW_DATABASE_URL;
if (!url) {
  console.error(
    "SHADOW_DATABASE_URL is not set.\n" +
      "It must point at a throwaway database: this command DROPs and recreates it.\n" +
      "See .env.example.",
  );
  process.exit(1);
}

// Parsed rather than pattern-matched: a password or a database name containing
// "localhost" would satisfy a substring test while the host it connects to is
// somewhere else entirely.
let hostname;
try {
  ({ hostname } = new URL(url));
} catch {
  console.error("SHADOW_DATABASE_URL is not a URL this can read.");
  process.exit(1);
}

if (!LOCAL_HOSTS.has(hostname)) {
  console.error(
    `SHADOW_DATABASE_URL points at ${hostname}, which is not local.\n` +
      "Refusing: a shadow database is DROPped and recreated, so this would\n" +
      "destroy whatever is there. Allowed hosts are localhost and 127.0.0.1.",
  );
  process.exit(1);
}

// --exit-code: 0 no difference, 2 differences, 1 error. Passed straight
// through, so CI fails on a difference and on a broken run alike.
const diff = spawnSync(
  path.join(root, "packages/db/node_modules/.bin/prisma"),
  [
    "migrate",
    "diff",
    "--exit-code",
    "--from-migrations",
    path.join(root, "prisma/migrations"),
    "--to-schema",
    path.join(root, "prisma/schema.prisma"),
  ],
  { cwd: root, stdio: "inherit" },
);

process.exit(diff.status ?? 1);
