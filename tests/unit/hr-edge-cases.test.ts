/**
 * Every test the HR edge-case table names is a real test, and every HR test
 * belongs to a row (RANZ-42).
 *
 * `test_name` in docs/features/hr/edge-cases.csv is a list of `<file>: <title>`
 * entries, the way the accounting table writes them, and nothing but this reads
 * the two against each other. Without it a renamed assertion leaves a row
 * pointing at nothing, and a row marked as tested is the most believable kind
 * of untested.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a .mjs script with no type declarations: shared tooling.
import { parseCsv } from "../../scripts/csv.mjs";

const root = path.resolve(__dirname, "../..");

const LOCATIONS = [
  "tests/database",
  "tests/integration",
  "tests/unit",
  "tests/browser",
];

const FILES = [
  "tests/database/hr.test.sql",
  "tests/integration/hr.test.ts",
  "tests/unit/hr-module.test.ts",
  "tests/unit/hr-view.test.tsx",
  "tests/unit/hr-actions.test.ts",
  "tests/unit/hr-audit-facts.test.tsx",
  "tests/browser/hr.spec.ts",
];

const [header, ...rows] = parseCsv(
  readFileSync(path.join(root, "docs/features/hr/edge-cases.csv"), "utf8"),
) as string[][];
const COLUMN = Object.fromEntries(header!.map((name, index) => [name, index]));

/** The entries of one `test_name` cell: `file: HR-S1-NN: title`. */
function entriesOf(cell: string): { file: string; title: string }[] {
  return cell
    .split(/; (?=[\w.-]+\.(?:sql|ts|tsx): HR-S1-)/)
    .filter((entry) => entry.trim() !== "")
    .map((entry) => {
      const split = entry.indexOf(": ");
      return { file: entry.slice(0, split), title: entry.slice(split + 2) };
    });
}

function locate(file: string): string | undefined {
  return LOCATIONS.map((directory) => path.join(root, directory, file)).find(
    (candidate) => existsSync(candidate),
  );
}

/** The text a title would be written as in a source file. */
function sourceOf(file: string): string {
  const text = readFileSync(locate(file)!, "utf8");
  return file.endsWith(".sql") ? text.replaceAll("''", "'") : text;
}

describe("the HR edge-case table and its tests", () => {
  it("has rows to read", () => {
    // A scan that read nothing would pass everything below for free.
    expect(rows.length).toBeGreaterThanOrEqual(40);
  });

  it("every row names tests, except a deferral, and every one exists", () => {
    const missing: string[] = [];
    for (const row of rows) {
      const id = row[COLUMN.id!]!;
      const cell = row[COLUMN.test_name!]!;
      const entries = entriesOf(cell);
      if (id.startsWith("HR-DEF-")) {
        expect(entries, `${id} is a deferral and names no test`).toEqual([]);
        continue;
      }
      if (entries.length === 0) missing.push(`${id} names no test`);
      for (const { file, title } of entries) {
        if (!title.startsWith(`${id}: `)) {
          missing.push(`${id}: "${title}" is filed under another row`);
        } else if (!locate(file)) {
          missing.push(`${id}: no file ${file}`);
        } else if (!sourceOf(file).includes(title)) {
          missing.push(`${id}: ${file} has no test called "${title}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every HR test belongs to a row that lists it", () => {
    const listed = new Set(
      rows.flatMap((row) =>
        entriesOf(row[COLUMN.test_name!]!).map(
          ({ file, title }) => `${file}: ${title}`,
        ),
      ),
    );
    const orphans: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(path.join(root, file), "utf8");
      const base = path.basename(file);
      const pattern = file.endsWith(".sql")
        ? /'(HR-S1-\d{2}: (?:[^']|'')*)'/g
        : /(?:it|test)\(\s*"(HR-S1-\d{2}: [^"]*)"/g;
      for (const match of text.matchAll(pattern)) {
        const title = match[1]!.replaceAll("''", "'");
        if (!listed.has(`${base}: ${title}`)) {
          orphans.push(`${base}: ${title}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it("every row is proposed: only the owner approves", () => {
    const statuses = new Set(rows.map((row) => row[COLUMN.status!]));
    expect([...statuses]).toEqual(["proposed"]);
  });
});
