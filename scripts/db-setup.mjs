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
const url =
  process.env.DIRECT_URL ?? "postgresql://ranza:ranza@localhost:54322/ranza";

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

const password = psql([
  "-c",
  "alter role ranza_app with login password 'ranza_app'",
]);
if (password.status !== 0) {
  console.error(
    `Could not set the local runtime role password:\n${password.stderr}`,
  );
  process.exit(1);
}
console.log("runtime role ranza_app ready for local connections");
