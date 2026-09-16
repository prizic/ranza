// Fails the build when documentation drifts from the code.
//
// Written because reminders do not survive deadline pressure. Twice in one day a
// document described intent rather than reality: AGENTS.md listed commands that
// no longer existed, and ADR 0001 claimed a migration engine that was not in use.
// Both were invisible until someone happened to read carefully.
//
// Only mechanical claims are checked. Whether a paragraph is still *true* needs
// judgement, so the real defence is documents that point at the source of truth
// instead of copying it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

const docs = markdownFiles(root);

// 1. Every `pnpm <script>` shown in documentation must exist.
const scripts = new Set(
  Object.keys(
    JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts,
  ),
);
for (const file of docs) {
  const text = readFileSync(file, "utf8");
  for (const [, name] of text.matchAll(
    /^\s*(?:\$ )?pnpm ([a-z][a-z0-9:_-]*)/gm,
  )) {
    if (["install", "dlx", "add", "exec", "run", "why"].includes(name))
      continue;
    if (!scripts.has(name)) {
      failures.push(
        `${path.relative(root, file)} documents "pnpm ${name}", which is not a script`,
      );
    }
  }
}

// 2. Every relative markdown link must resolve.
for (const file of docs) {
  const dir = path.dirname(file);
  for (const [, target] of readFileSync(file, "utf8").matchAll(
    /\]\(([^)]+\.md)\)/g,
  )) {
    if (/^https?:/.test(target)) continue;
    if (!existsSync(path.join(dir, target.split("#")[0]))) {
      failures.push(`${path.relative(root, file)} links to missing ${target}`);
    }
  }
}

// 3. ADR filenames must match their heading number. A renamed decision whose
//    file still carries the old slug is how 0001 drifted.
const adrDir = path.join(root, "docs/adr");
for (const name of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
  const number = name.slice(0, 4);
  const heading = readFileSync(path.join(adrDir, name), "utf8").split("\n")[0];
  const match = /^# (\d{4})\./.exec(heading);
  if (!match) {
    failures.push(`docs/adr/${name} must start with "# NNNN. Title"`);
  } else if (match[1] !== number) {
    failures.push(
      `docs/adr/${name} is numbered ${number} but its heading says ${match[1]}`,
    );
  }
}

// 4. Every application and module directory must explain itself, and every
//    module must also carry the changelog blueprint 9.10 asks for. Applications
//    are exempt: they are deployed, not consumed at a version (ADR 0011).
for (const group of [
  "apps",
  "packages/platform",
  "packages/ranza",
  "packages/adapters",
]) {
  const dir = path.join(root, group);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const readme = path.join(dir, entry.name, "README.md");
    if (!existsSync(readme)) {
      failures.push(`${group}/${entry.name} has no README.md`);
    }
    if (group !== "apps") {
      const changelog = path.join(dir, entry.name, "CHANGELOG.md");
      if (!existsSync(changelog)) {
        failures.push(`${group}/${entry.name} has no CHANGELOG.md`);
      }
    }
  }
}

assert.deepEqual(
  failures,
  [],
  `documentation is out of date:\n  - ${failures.join("\n  - ")}`,
);
console.log(
  `PASS documentation matches the code (${docs.length} files checked)`,
);
