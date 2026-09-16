// Runs the pgTAP suites in tests/database against the local PostgreSQL.
//
// pgTAP is installed here rather than in a migration so the production schema
// carries no test dependency.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suiteDirectory = path.join(root, "tests/database");
const url =
  process.env.DIRECT_URL ?? "postgresql://ranza:ranza@localhost:54322/ranza";

// -t -A keeps psql from aligning output. Aligned output indents TAP lines, which
// silently defeats the "not ok" check and makes every suite look green.
function psql(args, input) {
  return spawnSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-t", "-A", ...args],
    {
      // The repository root, not wherever this was invoked from. A suite may
      // read a file by relative path — folios.test.sql runs the ghost-Folio
      // backfill straight out of prisma/migrations rather than keeping a copy
      // that could drift from it — and psql resolves those against the working
      // directory. Without this, `pnpm db:test` passes and the same command
      // from another directory fails on a missing file.
      cwd: root,
      encoding: "utf8",
      input,
    },
  );
}

const available = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (available.status !== 0) {
  console.error("psql is required. Install the PostgreSQL client tools.");
  process.exit(1);
}

const ready = psql(["-c", "select 1"]);
if (ready.status !== 0) {
  console.error(
    `Cannot reach ${url}. Start the database with "docker compose up -d".\n${ready.stderr}`,
  );
  process.exit(1);
}

const extension = psql(["-c", "create extension if not exists pgtap;"]);
if (extension.status !== 0) {
  console.error(`Could not install pgTAP:\n${extension.stderr}`);
  process.exit(1);
}

const suites = readdirSync(suiteDirectory)
  .filter((entry) => entry.endsWith(".test.sql"))
  .sort();

if (suites.length === 0) {
  console.error("No pgTAP suites found in tests/database.");
  process.exit(1);
}

let failed = 0;
for (const suite of suites) {
  const result = psql(["-f", path.join(suiteDirectory, suite)]);
  const output = `${result.stdout}${result.stderr}`;
  // pgTAP reports failures as "not ok" lines; a crashed suite exits non-zero.
  const lines = output.split("\n").map((line) => line.trim());
  const notOk = lines.filter((line) => line.startsWith("not ok"));
  const ok = lines.filter((line) => line.startsWith("ok ") || line === "ok");
  // pgTAP reports a plan that does not match the assertions run as a comment,
  // not as "not ok". A suite can therefore drift to fewer assertions than it
  // claims — or quietly stop running the last few — and still look green.
  const misplanned = lines.filter((line) =>
    line.startsWith("# Looks like you"),
  );

  if (result.status !== 0 || notOk.length > 0 || misplanned.length > 0) {
    failed += 1;
    console.error(`FAIL ${suite}`);
    console.error(output.trim());
  } else {
    if (ok.length === 0) {
      failed += 1;
      console.error(
        `FAIL ${suite} — ran no assertions. A suite that asserts nothing cannot fail.`,
      );
      console.error(output.trim());
    } else {
      console.log(`PASS ${suite} (${ok.length} assertions)`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${suites.length} database suites failed.`);
  process.exit(1);
}
console.log(`\nAll ${suites.length} database suites passed.`);
