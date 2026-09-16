// Applies migrations to the local database and gives the runtime role a
// development password.
//
// The role is created without a password by the migration, because each
// environment supplies its own. Locally the database only listens on loopback,
// so a fixed development password is acceptable.
import { spawnSync } from "node:child_process";

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireLocalDatabase,
  withoutConnectionOverrides,
} from "./local-url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Deliberately NOT DIRECT_URL. This script sets a known development password on
// the runtime role, so pointing it at a hosted database would overwrite that
// environment's credential. It is local-only by construction.
const url = "postgresql://ranza:ranza@localhost:54322/ranza";

requireLocalDatabase(url, {
  name: "db:setup's database URL",
  because:
    "this sets a known development password on the runtime role, which would\n" +
    "hand that environment's credential to anyone who read this repository.",
});

function psql(args) {
  return spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    encoding: "utf8",
    env: withoutConnectionOverrides(),
  });
}

// Prisma Migrate applies and records the migrations (ADR 0001). Applying the
// SQL directly would leave _prisma_migrations empty, and Prisma would later
// offer to reset a database it believed had never been migrated.
const deploy = spawnSync(
  path.join(root, "packages/db/node_modules/.bin/prisma"),
  ["migrate", "deploy", "--schema", path.join(root, "prisma/schema.prisma")],
  {
    encoding: "utf8",
    env: { ...withoutConnectionOverrides(), DIRECT_URL: url },
  },
);
if (deploy.status !== 0) {
  console.error(`Migrations failed:\n${deploy.stdout}${deploy.stderr}`);
  process.exit(1);
}
console.log(deploy.stdout.trim().split("\n").slice(-1)[0]);

for (const role of ["ranza_app", "ranza_auth", "ranza_worker"]) {
  const result = psql([
    "-c",
    `alter role ${role} with login password '${role}'`,
  ]);
  if (result.status !== 0) {
    console.error(
      `Could not set the local password for ${role}:\n${result.stderr}`,
    );
    process.exit(1);
  }
}
console.log(
  "runtime roles ranza_app, ranza_auth and ranza_worker ready for local connections",
);
