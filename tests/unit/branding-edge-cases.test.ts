/**
 * Every test the branding edge-case table names is a real test, and every
 * branding test belongs to a row (RANZ-47).
 *
 * `test_name` in docs/features/branding/edge-cases.csv is a list of
 * `<file>: <title>` entries, and nothing but this reads the two against each
 * other. Without it a renamed assertion leaves a row pointing at nothing, and a
 * row marked as tested is the most believable kind of untested.
 *
 * A test need not be listed by the row it proves: several assertions answer one
 * row, and listing each would bury the table. It must name a row that exists.
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
  "tests/database/branding.test.sql",
  "tests/integration/branding.test.ts",
  "tests/unit/branding-module.test.ts",
  "tests/unit/branding-actions.test.ts",
  "tests/browser/branding.spec.ts",
];

const [header, ...rows] = parseCsv(
  readFileSync(
    path.join(root, "docs/features/branding/edge-cases.csv"),
    "utf8",
  ),
) as string[][];
const COLUMN = Object.fromEntries(header!.map((name, index) => [name, index]));
const ids = new Set(rows.map((row) => row[COLUMN.id!]!));

/** The entries of one `test_name` cell: `file: BR-S1-NN: title`. */
function entriesOf(cell: string): { file: string; title: string }[] {
  return cell
    .split(/; (?=[\w.-]+\.(?:sql|ts|tsx): BR-S1-)/)
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

/**
 * The tests a source file declares whose title starts with a branding row id.
 *
 * A pgTAP description is a whole quoted string on a line of its own, as the
 * last argument of an assertion; anything else that looks like one, in a
 * comment or inside a longer string, is not a test. A vitest or Playwright
 * test is the first argument of `it` or `test`. Reading both the same way for
 * the forward and the reverse check is what keeps either from being satisfied
 * by prose.
 */
function titlesIn(file: string, text: string): string[] {
  const pattern = file.endsWith(".sql")
    ? /^[ \t]*'(BR-S1-\d{2}: (?:[^']|'')*)'[ \t]*\)?;?[ \t]*$/gm
    : /(?:^|[^\w.])(?:it|test)\(\s*"(BR-S1-\d{2}: [^"]*)"/g;
  return [...text.matchAll(pattern)].map((match) =>
    match[1]!.replaceAll("''", "'"),
  );
}

describe("the branding edge-case table and its tests", () => {
  it("has rows to read", () => {
    // A scan that read nothing would pass everything below for free.
    expect(rows.length).toBeGreaterThanOrEqual(35);
  });

  it("every row names tests, except a deferral, and every one exists", () => {
    const missing: string[] = [];
    for (const row of rows) {
      const id = row[COLUMN.id!]!;
      const entries = entriesOf(row[COLUMN.test_name!]!);
      if (id.startsWith("BR-DEF-")) {
        expect(entries, `${id} is a deferral and names no test`).toEqual([]);
        continue;
      }
      if (entries.length === 0) missing.push(`${id} names no test`);
      for (const { file, title } of entries) {
        if (!title.startsWith(`${id}: `)) {
          missing.push(`${id}: "${title}" is filed under another row`);
        } else if (!locate(file)) {
          missing.push(`${id}: no file ${file}`);
        } else if (
          !titlesIn(file, readFileSync(locate(file)!, "utf8")).includes(title)
        ) {
          missing.push(`${id}: ${file} has no test called "${title}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every branding test names a row that exists", () => {
    const strays: string[] = [];
    let read = 0;
    for (const file of FILES) {
      const text = readFileSync(path.join(root, file), "utf8");
      for (const title of titlesIn(file, text)) {
        read += 1;
        const id = title.slice(0, title.indexOf(": "));
        if (!ids.has(id)) strays.push(`${path.basename(file)}: ${title}`);
      }
    }
    expect(read).toBeGreaterThan(0);
    expect(strays).toEqual([]);
  });

  it("every row is proposed or deferred: only the owner approves", () => {
    const statuses = new Set(rows.map((row) => row[COLUMN.status!]));
    expect([...statuses].sort()).toEqual(["deferred", "proposed"]);
  });
});
