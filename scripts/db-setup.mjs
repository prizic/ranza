// Applies migrations to the local database and gives the runtime role a
// development password.
//
// The role is created without a password by the migration, because each
// environment supplies its own. Locally the database only listens on loopback,
// so a fixed development password is acceptable.
import { spawnSync } from "node:child_process";

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Deliberately NOT DIRECT_URL. This script sets a known development password on
// the runtime role, so pointing it at a hosted database would overwrite that
// environment's credential. It is local-only by construction.
const url = "postgresql://ranza:ranza@localhost:54322/ranza";

if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("db:setup only targets the local docker database.");
  process.exit(1);
}

function psql(args) {
  return spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    encoding: "utf8",
  });
}

const migrations = path.join(root, "prisma/migrations");
for (const entry of readdirSync(migrations).sort()) {
  const file = path.join(migrations, entry, "migration.sql");
  const result = psql(["-f", file]);
  if (result.status !== 0) {
    console.error(`FAIL ${entry}\n${result.stderr}`);
    process.exit(1);
  }
  console.log(`applied ${entry}`);
}

for (const role of ["ranza_app", "ranza_auth"]) {
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
  "runtime roles ranza_app and ranza_auth ready for local connections",
);
