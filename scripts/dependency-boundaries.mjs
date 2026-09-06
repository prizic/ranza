import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
    {
      cwd,
      encoding: "utf8",
    },
  );
}

const valid = cruise(["apps", "packages"]);
assert.equal(
  valid.status,
  0,
  `valid application and package dependencies must pass:\n${valid.stdout}${valid.stderr}`,
);

const invalid = cruise(
  ["packages/domain/src/domain-imports-next.ts"],
  path.join(root, "tests/boundaries/fixtures"),
);
assert.notEqual(
  invalid.status,
  0,
  "a domain-layer import from Next.js must fail the dependency boundary check",
);
assert.match(
  `${invalid.stdout}${invalid.stderr}`,
  /domain-is-framework-independent/,
  "the forbidden fixture must fail the framework-independence rule",
);
assert.match(
  `${invalid.stdout}${invalid.stderr}`,
  /node_modules\/.*next\/server\.js/,
  "the forbidden fixture must exercise a resolved Next.js dependency",
);

console.log("PASS valid dependency boundaries");
console.log("PASS domain rejects Next.js dependencies");
