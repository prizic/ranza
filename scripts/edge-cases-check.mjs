// Fails the build when an edge-case table steps outside its own vocabulary.
//
// AGENTS.md, "Edge cases are the specification", makes the table in
// docs/features/<feature>/edge-cases.csv the record of what every change owes.
// The feature-design skill defines its header, its ids, its `enforced_by` and
// `status` words, and the `blocks:` prefix a prerequisite row must start with,
// because readiness is counted from that prefix and nothing else.
//
// A vocabulary that is only written down drifts: before this check existed two
// rows had been marked `done` and `resolved` because nobody had a word for a
// gap that had closed, and a count of open rows read as complete while those
// two sat outside every status it knew. Only the mechanical part is checked.
// Whether a row is *true* is the reviewer's job, and this cannot do it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HEADER = [
  "id",
  "situation",
  "given",
  "when",
  "then",
  "enforced_by",
  "test_name",
  "status",
];
const ENFORCED_BY = new Set([
  "database_constraint",
  "policy",
  "trigger",
  "module",
  "ui_only",
  "database_function",
]);
const STATUS = new Set([
  "open",
  "approved",
  "deferred",
  "out_of_scope",
  "prerequisite_missing",
  "current_behaviour_differs",
  "resolved",
  "proposed",
]);
// CO-S1-04, AL-DIFF-01, CO-NB-10, IG-01 — or PRE-06, which names what another
// feature owes this one and so carries no feature prefix.
const ID = /^(?:[A-Z]+(?:-(?:S\d+|NB|DIFF|DEF))?|PRE)-\d+$/;
const BLOCKS = /^blocks: /;
const REQUIRED = ["situation", "given", "when", "then"];

// RFC 4180: a field containing a comma, a quote or a newline is quoted, and a
// quote inside a quoted field is doubled. Node has no parser for this and the
// tables use every one of those cases.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function problemsIn(file) {
  const problems = [];
  const name = path.relative(root, file);
  const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));

  if (!header || header.join(",") !== HEADER.join(",")) {
    problems.push(`${name}: header must be exactly "${HEADER.join(",")}"`);
    return problems;
  }

  const seen = new Set();
  rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== HEADER.length) {
      problems.push(
        `${name}:${line} has ${cells.length} fields, not ${HEADER.length} — quote any field containing a comma`,
      );
      return;
    }
    const row = Object.fromEntries(HEADER.map((key, i) => [key, cells[i]]));
    const where = `${name}:${line} (${row.id || "no id"})`;

    if (!ID.test(row.id)) {
      problems.push(
        `${where} id must be <FEATURE>-<S#|NB|DIFF|DEF>-<NN> or PRE-<NN>`,
      );
    } else if (seen.has(row.id)) {
      problems.push(`${where} id is used twice`);
    }
    seen.add(row.id);

    for (const key of REQUIRED) {
      if (row[key].trim() === "") problems.push(`${where} ${key} is empty`);
    }
    if (!ENFORCED_BY.has(row.enforced_by)) {
      problems.push(
        `${where} enforced_by "${row.enforced_by}" is not one of ${[...ENFORCED_BY].join(", ")}`,
      );
    }
    if (!STATUS.has(row.status)) {
      problems.push(
        `${where} status "${row.status}" is not one of ${[...STATUS].join(", ")}`,
      );
    }
    if (row.status === "prerequisite_missing" && !BLOCKS.test(row.then)) {
      problems.push(
        `${where} a prerequisite_missing row's then must start "blocks: <slices>."`,
      );
    }
    if (row.status === "approved" && row.test_name.trim() === "") {
      problems.push(
        `${where} an approved row names the test that is written first`,
      );
    }
  });
  return problems;
}

function tables(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "edge-cases.csv"))
    .filter((file) => existsSync(file));
}

const real = tables(path.join(root, "docs/features"));
const failures = real.flatMap(problemsIn);
assert.deepEqual(
  failures,
  [],
  `an edge-case table is outside its vocabulary:\n  - ${failures.join("\n  - ")}`,
);

// The fixture carries one violation per rule. If the check stops seeing one of
// them, the rule above it has gone inert — the scan of the real tables would
// then be passing on nothing, which is the failure this repository has met
// three times in other suites.
const fixture = path.join(root, "tests/edge-cases/fixtures/edge-cases.csv");
assert.deepEqual(
  problemsIn(fixture).map((problem) =>
    problem.replace(/^tests\/edge-cases\/fixtures\/edge-cases\.csv:/, ""),
  ),
  [
    `2 (X-S1-01) enforced_by "vibes" is not one of ${[...ENFORCED_BY].join(", ")}`,
    `3 (X-S1-02) status "done" is not one of ${[...STATUS].join(", ")}`,
    '4 (PRE-01) a prerequisite_missing row\'s then must start "blocks: <slices>."',
    "5 (X-S1-03) an approved row names the test that is written first",
    "6 (x-s1-4) id must be <FEATURE>-<S#|NB|DIFF|DEF>-<NN> or PRE-<NN>",
    "7 (X-S1-01) id is used twice",
    "8 (X-S1-05) given is empty",
    "9 has 9 fields, not 8 — quote any field containing a comma",
  ],
  "the fixture must trip every rule, or the scan above proves nothing",
);
assert.deepEqual(
  problemsIn(path.join(root, "tests/edge-cases/fixtures/bad-header.csv")),
  [
    'tests/edge-cases/fixtures/bad-header.csv: header must be exactly "id,situation,given,when,then,enforced_by,test_name,status"',
  ],
  "the header fixture must trip the header rule",
);

console.log(
  `PASS every edge-case table stays inside its vocabulary (${real.length} tables checked)`,
);
