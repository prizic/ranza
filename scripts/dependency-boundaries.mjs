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

// ADR 0007: every tenant read goes through the host's viewer funnel, so a page
// may not reach the database or a module that does. The rule is worth only as
// much as its proof that it fires.
const unfunnelled = cruise(
  ["apps/operator-workspace/src/app/page.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  unfunnelled.status,
  0,
  "a page reaching the database outside src/server must fail",
);
assert.match(
  `${unfunnelled.stdout}${unfunnelled.stderr}`,
  /tenant-data-only-through-the-server-funnel/,
  "the fixture must trip the viewer funnel rule",
);
console.log("PASS tenant data is reachable only through the server funnel");

// Blueprint 9.10: a module reaches another module's index, never its internals.
// The public-contract rule alone exempts anything inside a tier, so a module was
// free to reach into a sibling — this proves the rule that closes that.
const acrossModules = cruise(
  ["packages/ranza/reservations/src/index.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  acrossModules.status,
  0,
  "a module importing another module's domain layer must fail",
);
assert.match(
  `${acrossModules.stdout}${acrossModules.stderr}`,
  /modules-do-not-reach-into-each-other/,
  "the fixture must trip the module-internals rule",
);
console.log("PASS modules reach each other only through a public contract");

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

// Modules receive their dependencies; they do not discover them. A module that
// reads process.env is welded to one process's configuration and cannot be
// tested against a throwaway database or reused by another host.
//
// packages/config is exempt: parsing the environment is its entire purpose.
const packagesRoot = path.join(root, "packages");
const tiers = new Set(["platform", "ranza", "adapters"]);

// A tier directory holds modules, so its sources sit one level deeper. Mapping
// every entry straight to <entry>/src would silently scan nothing for the whole
// ranza tier — a check that reads as green while covering no module at all.
const injectable = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "config")
  .flatMap((entry) =>
    tiers.has(entry.name)
      ? readdirSync(path.join(packagesRoot, entry.name), {
          withFileTypes: true,
        })
          .filter((module) => module.isDirectory())
          .map((module) =>
            path.join(packagesRoot, entry.name, module.name, "src"),
          )
      : [path.join(packagesRoot, entry.name, "src")],
  );

const envReaders = injectable
  .flatMap((directory) => sourceFiles(directory))
  .filter((file) => /process\.env/.test(readFileSync(file, "utf8")));

assert.deepEqual(
  envReaders.map((file) => path.relative(root, file)),
  [],
  "modules must receive configuration through their deps, not read process.env",
);
console.log(
  `PASS modules take dependencies by injection (${injectable.flatMap((directory) => sourceFiles(directory)).length} files scanned)`,
);
