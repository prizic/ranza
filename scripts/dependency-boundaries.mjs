import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencyCruiser = path.resolve(
  path.dirname(fileURLToPath(import.meta.resolve("dependency-cruiser"))),
  "../../bin/dependency-cruise.mjs",
);
const config = path.join(root, ".dependency-cruiser.cjs");

function cruise(paths, cwd = root) {
  return spawnSync(
    process.execPath,
    [dependencyCruiser, "--config", config, ...paths],
    { cwd, encoding: "utf8" },
  );
}

const valid = cruise(["packages"]);
assert.equal(
  valid.status,
  0,
  `real package dependencies must pass:\n${valid.stdout}${valid.stderr}`,
);
console.log("PASS real package dependencies");

const forbidden = cruise(
  ["packages/platform/finance/src/index.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  forbidden.status,
  0,
  "a platform module importing a Ranza module must fail",
);
assert.match(
  `${forbidden.stdout}${forbidden.stderr}`,
  /platform-must-not-import-ranza/,
  "the fixture must trip the platform/ranza tier rule",
);
console.log("PASS platform modules reject Ranza imports");

// Blueprint 9.8 identifier rule: a reusable platform module must not even name a
// Ranza concept. Dependency graphs cannot see this, so scan the source directly.
const ranzaVocabulary =
  /\b(Propert(?:y|ies)|Guests?|Residents?|Stays?|Reservations?|AccommodationUnits?|Folios?)\b/;
const platformRoot = path.join(root, "packages/platform");

function sourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry);
    if (entry === "node_modules" || entry === "dist") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|sql)$/.test(entry) ? [full] : [];
  });
}

const offenders = sourceFiles(platformRoot).filter((file) =>
  ranzaVocabulary.test(readFileSync(file, "utf8")),
);
assert.deepEqual(
  offenders.map((file) => path.relative(root, file)),
  [],
  "platform modules must not reference Ranza vocabulary; translate in a host adapter",
);
console.log(
  `PASS platform modules are free of Ranza vocabulary (${sourceFiles(platformRoot).length} files scanned)`,
);
