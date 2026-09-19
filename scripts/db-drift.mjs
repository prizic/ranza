// Do the migrations and schema.prisma still say the same thing?
//
// `--from-migrations` replays every migration into a shadow database, so this
// compares what they actually produce against what the schema says. Why that
// is a check rather than a claim is ADR 0001.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireLocalDatabase,
  withoutConnectionOverrides,
} from "./local-url.mjs";

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
// CI needs no exception: its Postgres is reached at localhost, because the
// service container's port is mapped onto the runner and the job does not
// itself run in a container. A job moved inside a container would reach it as
// `postgres:5432` and be refused here — correctly, and the fix then is one
// named host, not a looser check.
const url = process.env.SHADOW_DATABASE_URL;
if (!url) {
  // The line is read out of .env.example rather than repeated here. A copy
  // would go stale the first time the example changed, and a refusal that
  // names the wrong line is worse than one that names none: it gets pasted.
  // existsSync, because this is the refusal path: reading a file that is not
  // there would throw ENOENT over the top of the message explaining what to do.
  const example = path.join(root, ".env.example");
  const commented = existsSync(example)
    ? readFileSync(example, "utf8")
        .split("\n")
        .find((line) => line.startsWith("# SHADOW_DATABASE_URL="))
    : undefined;
  console.error(
    "SHADOW_DATABASE_URL is not set.\n" +
      "It must point at a throwaway database: this command DROPs and recreates it.\n" +
      (commented
        ? "It is commented out in .env.example, and stays that way on purpose: a\n" +
          "working URL in the file everyone copies is what the local-only check,\n" +
          "the host parsing and the PGHOSTADDR guard below exist to prevent.\n" +
          "Uncomment it into your own .env:\n\n" +
          `  ${commented.replace(/^# /, "")}\n`
        : "See .env.example."),
  );
  process.exit(1);
}

requireLocalDatabase(url, {
  name: "SHADOW_DATABASE_URL",
  because:
    "a shadow database is DROPped and recreated, so this would destroy\n" +
    "whatever is there.",
});

// Prisma does not reset a shadow database it was handed, so a second run finds
// the first run's schema and fails on it. Dropping it here is what makes the
// command repeatable — and is only defensible because of the check above: this
// is the line that would destroy a real database, and it cannot be reached
// with a URL that names one.
const admin = new URL(url);
admin.pathname = "/postgres";
const shadow = new URL(url).pathname.replace(/^\//, "");

const reset = spawnSync(
  "psql",
  [
    admin.toString(),
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-c",
    `drop database if exists "${shadow}"`,
    "-c",
    `create database "${shadow}"`,
  ],
  { encoding: "utf8", env: withoutConnectionOverrides() },
);
if (reset.status !== 0) {
  console.error(`Could not reset the shadow database:\n${reset.stderr}`);
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
  { cwd: root, env: withoutConnectionOverrides(), stdio: "inherit" },
);

process.exit(diff.status ?? 1);
