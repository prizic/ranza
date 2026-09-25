import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBranchFeatures } from "../../scripts/decisions-branches.mjs";
import { readNotes } from "../../scripts/decisions-register.mjs";

const HEADER = "id,situation,given,when,then,enforced_by,test_name,status";
const line = (id: string) => `${id},s,g,w,t,module,a_test,approved`;

let repo: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });

function commit(files: Record<string, string>, message: string) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
  }
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

const table = (slug: string, ...ids: string[]) => ({
  [`docs/features/${slug}/edge-cases.csv`]: [HEADER, ...ids.map(line)].join(
    "\n",
  ),
});

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "decisions-branches-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  commit(table("check-out", "CO-S1-01", "CO-S1-99"), "main");

  // A branch left behind while main later removes CO-S1-99: its copy of that
  // row is main's old one, not a decision the branch made.
  git("checkout", "-q", "-b", "feat/stale");
  commit({ "stale.txt": "x" }, "stale work");
  git("checkout", "-q", "main");
  commit(table("check-out", "CO-S1-01"), "main drops CO-S1-99");

  git("checkout", "-q", "-b", "feat/merged");
  commit(table("merged", "MG-S1-01"), "merged");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", "feat/merged", "-m", "merge");
  // main renumbers the row after the merge, so the stale branch still carries a
  // row this branch does not — only the ancestry check can leave it out.
  commit(table("merged", "MG-S1-02"), "renumber");

  git("checkout", "-q", "-b", "feat/maintenance");
  commit(
    {
      ...table("maintenance", "MT-S1-01", "MT-S1-02"),
      "docs/features/maintenance/use-case.mmd": "%% OPEN: who pays? MT-S1-02\n",
    },
    "maintenance",
  );
  // A later branch that merged maintenance in carries the same table.
  git("checkout", "-q", "-b", "feat/date-range");
  commit({ "other.txt": "x" }, "unrelated");

  git("checkout", "-q", "main");
  git("checkout", "-q", "-b", "feat/close-the-day");
  commit(table("check-out", "CO-S1-01", "CO-S5-01"), "adds a row");
  git("checkout", "-q", "main");
  git("checkout", "-q", "-b", "feat/reopen");
  commit(
    {
      "docs/features/check-out/edge-cases.csv": [
        HEADER,
        "CO-S1-01,s,g,w,t,module,a_test,open",
      ].join("\n"),
    },
    "reopens a row",
  );
  git("checkout", "-q", "main");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("decisions on unmerged branches", () => {
  const current = [
    {
      slug: "check-out",
      hasTable: true,
      rows: [
        {
          id: "CO-S1-01",
          situation: "s",
          given: "g",
          when: "w",
          then: "t",
          enforced_by: "module",
          test_name: "a_test",
          status: "approved",
        },
      ],
      notes: [],
      ar: { title: "", entries: {} },
    },
    {
      slug: "merged",
      hasTable: true,
      rows: [{ id: "MG-S1-02" }],
      notes: [],
      ar: { title: "", entries: {} },
    },
  ];

  it("finds a table only a branch has, and gives it to the branch named for it", () => {
    const found = readBranchFeatures(repo, current, readNotes);
    const maintenance = found.find((f) => f.slug === "maintenance");
    expect(maintenance?.newFeature).toBe(true);
    expect(maintenance?.rows.map((row) => row.id)).toEqual([
      "MT-S1-01",
      "MT-S1-02",
    ]);
    expect(maintenance?.rows[0].ref.name).toBe("feat/maintenance");
    expect(maintenance?.notes.map((note) => note.text)).toEqual([
      "who pays? MT-S1-02",
    ]);
  });

  it("finds the rows branches add to, or change in, a table this branch has", () => {
    const found = readBranchFeatures(repo, current, readNotes);
    const checkOut = found.find((f) => f.slug === "check-out");
    expect(checkOut?.newFeature).toBe(false);
    expect(
      checkOut?.rows
        .map((row) => [row.id, row.change, row.status, row.ref.name])
        .sort(),
    ).toEqual([
      ["CO-S1-01", "changed", "open", "feat/reopen"],
      ["CO-S5-01", "added", "approved", "feat/close-the-day"],
    ]);
  });

  it("does not bring back a row main removed after a branch left it", () => {
    const found = readBranchFeatures(repo, current, readNotes);
    const ids = found.flatMap((f) => f.rows.map((row) => row.id));
    expect(ids).not.toContain("CO-S1-99");
  });

  it("leaves out a branch whose tip is already merged", () => {
    const found = readBranchFeatures(repo, current, readNotes);
    expect(found.map((f) => f.slug)).toEqual(["check-out", "maintenance"]);
  });
});
