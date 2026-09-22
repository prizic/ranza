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

// The same rule, for a Ranza domain module rather than packages/db. Worth its
// own fixture because the rule used to name @ranza/core specifically, and a
// module added later would have fallen outside it without anything failing.
const unfunnelledModule = cruise(
  ["apps/operator-workspace/src/app/stay/page.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  unfunnelledModule.status,
  0,
  "a page reaching a Ranza domain module outside src/server must fail",
);
assert.match(
  `${unfunnelledModule.stdout}${unfunnelledModule.stderr}`,
  /tenant-data-only-through-the-server-funnel/,
  "the fixture must trip the viewer funnel rule",
);
console.log("PASS the funnel rule covers every Ranza domain module");

// And once more for a platform module. The rule named the Ranza tier alone
// until the audit log became the first screen to read one, and a page
// importing @ranza/platform-audit directly would have passed.
const unfunnelledPlatform = cruise(
  ["apps/operator-workspace/src/app/audit-log/page.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  unfunnelledPlatform.status,
  0,
  "a page reaching a platform module outside src/server must fail",
);
assert.match(
  `${unfunnelledPlatform.stdout}${unfunnelledPlatform.stderr}`,
  /tenant-data-only-through-the-server-funnel/,
  "the fixture must trip the viewer funnel rule",
);
console.log("PASS the funnel rule covers every platform module");

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

// ADR 0018: the worker's composition root is the only place that knows which
// role it connects as, and the startup checks that refuse a superuser, a
// BYPASSRLS role or an owner live there. A second file opening a connection is a
// second connection nothing checked.
const workerConnection = cruise(
  ["apps/worker/src/outbox/dispatcher.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  workerConnection.status,
  0,
  "a worker file other than composition.ts reaching packages/db must fail",
);
assert.match(
  `${workerConnection.stdout}${workerConnection.stderr}`,
  /the-worker-opens-one-connection-in-one-place/,
  "the fixture must trip the worker connection rule",
);
console.log("PASS the worker opens one connection, in one place");

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

// ADR 0016: a worker framework stays in the worker. A package that imports
// @nestjs/* is a package that cannot be reused by a host which does not run
// Nest, and a decorator is where a business rule starts living in a framework
// class. Scanned rather than cruised because an unresolvable import would not
// match a path-based rule — the rule would pass while enforcing nothing, which
// has already happened once in this file's history.
const NEST_IMPORT = /["']@nestjs\//;

function nestImporters(directory) {
  return sourceFiles(directory).filter((file) =>
    NEST_IMPORT.test(readFileSync(file, "utf8")),
  );
}

assert.deepEqual(
  nestImporters(packagesRoot).map((file) => path.relative(root, file)),
  [],
  "packages must not import @nestjs/*; a worker framework belongs in apps/worker",
);

// The same scan against a fixture that does import it, so the assertion above is
// known to be capable of failing rather than merely observed to pass.
const nestFixture = path.join(
  root,
  "tests/boundaries/fixtures/packages/platform/scheduling/src",
);
assert.deepEqual(
  nestImporters(nestFixture).map((file) => path.basename(file)),
  ["index.ts"],
  "the fixture must be detected, or the scan above proves nothing",
);
console.log("PASS a worker framework stays in the worker");

// ADR 0006 and ADR 0018, for the worker specifically: one file reads the
// environment and one file opens a connection, and it is the same file, because
// it is the one that asks pg_roles what it actually connected as.
const HOST_DISCOVERY = /process\.env|createPrismaClient/;
const workerSource = path.join(root, "apps/worker/src");

function discoverers(directory, allowed) {
  return sourceFiles(directory).filter(
    (file) =>
      path.basename(file) !== allowed &&
      HOST_DISCOVERY.test(readFileSync(file, "utf8")),
  );
}

assert.deepEqual(
  discoverers(workerSource, "composition.ts").map((file) =>
    path.relative(root, file),
  ),
  [],
  "only apps/worker/src/composition.ts may read the environment or open a connection",
);

const workerFixture = path.join(
  root,
  "tests/boundaries/fixtures/apps/worker/src",
);
assert.deepEqual(
  discoverers(workerFixture, "composition.ts").map((file) =>
    path.basename(file),
  ),
  ["dispatcher.ts"],
  "the fixture must be detected, or the scan above proves nothing",
);
console.log("PASS the worker discovers its configuration in one place");

// ADR 0019: a client cache holds one tenant's rows in a place that outlives a
// request, which nothing else in this product does. It is allowed in feature
// folders and in the providers directory, and nowhere else — never in
// packages/**, and never on a server path, where a QueryClient at module scope
// is one object shared by every concurrent request.
//
// Matched on the exact specifier: packages/ui imports @tanstack/react-table,
// which is a different package and is fine anywhere.
const QUERY_IMPORT = /["']@tanstack\/react-query["']/;
const QUERY_ALLOWED = /\/apps\/[^/]+\/src\/(features\/|app\/providers\/)/;

function cacheImporters(roots) {
  return roots
    .flatMap((directory) => sourceFiles(directory))
    .filter(
      (file) =>
        !QUERY_ALLOWED.test(file) &&
        QUERY_IMPORT.test(readFileSync(file, "utf8")),
    );
}

const appSources = readdirSync(path.join(root, "apps"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(root, "apps", entry.name, "src"));

assert.deepEqual(
  cacheImporters([...appSources, packagesRoot]).map((file) =>
    path.relative(root, file),
  ),
  [],
  "@tanstack/react-query belongs in a feature folder or app/providers, and nowhere else",
);

assert.deepEqual(
  cacheImporters([
    path.join(root, "tests/boundaries/fixtures/apps/operator-workspace/src"),
  ]).map((file) => path.basename(file)),
  ["live.ts"],
  "the fixture must be detected, or the scan above proves nothing",
);
console.log("PASS the client cache stays in feature folders and providers");
