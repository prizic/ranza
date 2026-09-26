import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readBranchFeatures } from "../../scripts/decisions-branches.mjs";
import {
  readNotes,
  renderRegister,
} from "../../scripts/decisions-register.mjs";

const HEADER = "id,situation,given,when,then,enforced_by,test_name,status";
const line = (id: string) => `${id},s,g,w,t,module,a_test,approved`;

// The developer's own git configuration and any GIT_* variable a hook or an
// editor exported — GIT_DIR above all — must not reach the fixture, or the
// fixture is built somewhere other than the temporary directory it names.
const isolated = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  ),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

// The code under test runs git with process.env, so the same variables are
// taken out of it for as long as these suites run and put back afterwards.
const removed = new Map<string, string | undefined>();
beforeAll(() => {
  for (const key of Object.keys(process.env).filter((k) =>
    k.startsWith("GIT_"),
  )) {
    removed.set(key, process.env[key]);
    delete process.env[key];
  }
});
afterAll(() => {
  for (const [key, value] of removed) process.env[key] = value;
});

// A throwaway repository. Commits can be dated, because a table's owner is
// chosen by when each branch last changed it and commits made in the same
// second would tie.
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "decisions-branches-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "pipe", env: isolated });
  const commit = (
    files: Record<string, string>,
    message: string,
    date?: string,
  ) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), text);
    }
    git("add", "-A");
    execFileSync("git", ["commit", "-q", "-m", message], {
      cwd: dir,
      stdio: "pipe",
      env: date
        ? { ...isolated, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
        : isolated,
    });
  };
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  return { dir, git, commit };
}

const table = (slug: string, ...ids: string[]) => ({
  [`docs/features/${slug}/edge-cases.csv`]: [HEADER, ...ids.map(line)].join(
    "\n",
  ),
});

const ids = (found: { rows: { id: string }[] }[]) =>
  found.flatMap((f) => f.rows.map((row) => row.id));

describe("decisions on unmerged branches", () => {
  let repo: string;

  beforeAll(() => {
    const { dir, git, commit } = fixture();
    repo = dir;
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
    // main renumbers the row after the merge, so the stale branch still carries
    // a row this branch does not — only the ancestry check can leave it out.
    commit(table("merged", "MG-S1-02"), "renumber");

    git("checkout", "-q", "-b", "feat/maintenance");
    commit(
      {
        ...table("maintenance", "MT-S1-01", "MT-S1-02"),
        "docs/features/maintenance/use-case.mmd":
          "%% OPEN: who pays? MT-S1-02\n",
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
    expect(ids(found)).not.toContain("CO-S1-99");
  });

  it("leaves out a branch whose tip is already merged", () => {
    const found = readBranchFeatures(repo, current, readNotes);
    expect(found.map((f) => f.slug)).toEqual(["check-out", "maintenance"]);
  });
});

// A newer branch that drops or renumbers a row must win over every older copy
// of the table it grew from, or the row it removed comes back from them.
describe("rows a newer branch removed", () => {
  let repo: string;

  beforeAll(() => {
    const { dir, git, commit } = fixture();
    repo = dir;
    commit({ "README.md": "x" }, "main", "2026-09-01T10:00:00Z");

    git("checkout", "-q", "-b", "feat/maintenance");
    commit(
      table("maintenance", "MT-S1-01", "MT-S1-02"),
      "maintenance",
      "2026-09-02T10:00:00Z",
    );
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", "feat/date-range");
    git("merge", "-q", "--no-ff", "feat/maintenance", "-m", "merge");
    commit(
      table("maintenance", "MT-S1-01", "MT-S2-01"),
      "renumber MT-S1-02",
      "2026-09-03T10:00:00Z",
    );

    // origin still has the branch as it was before its last, unpushed commit.
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", "feat/folios");
    commit(
      table("folios", "FO-S1-01", "FO-S1-02"),
      "folios",
      "2026-09-02T10:00:00Z",
    );
    git("update-ref", "refs/remotes/origin/feat/folios", "HEAD");
    commit(
      table("folios", "FO-S1-01"),
      "drop FO-S1-02",
      "2026-09-03T10:00:00Z",
    );

    // feat/housekeeping is merged into feat/rooms, then keeps working after
    // it: it deletes HK-S1-01 and approves HK-S1-02. feat/rooms edits only
    // HK-S1-03 and so ranks first, still carrying the other two as they were
    // when it merged them.
    const housekeeping = (...rows: string[]) => ({
      "docs/features/housekeeping/edge-cases.csv": [HEADER, ...rows].join("\n"),
    });
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", "feat/housekeeping");
    commit(
      housekeeping(
        "HK-S1-01,s,g,w,t,module,a_test,approved",
        "HK-S1-02,s,g,w,t,module,a_test,open",
        "HK-S1-03,s,g,w,t,module,a_test,approved",
      ),
      "housekeeping",
      "2026-09-02T10:00:00Z",
    );
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", "feat/rooms");
    git("merge", "-q", "--no-ff", "feat/housekeeping", "-m", "merge");
    git("checkout", "-q", "feat/housekeeping");
    commit(
      housekeeping(
        "HK-S1-02,s,g,w,t,module,a_test,approved",
        "HK-S1-03,s,g,w,t,module,a_test,approved",
      ),
      "drop HK-S1-01, approve HK-S1-02",
      "2026-09-03T10:00:00Z",
    );
    git("checkout", "-q", "feat/rooms");
    commit(
      housekeeping(
        "HK-S1-01,s,g,w,t,module,a_test,approved",
        "HK-S1-02,s,g,w,t,module,a_test,open",
        "HK-S1-03,s,g,w,t,module,a_test,proposed",
      ),
      "propose HK-S1-03 again",
      "2026-09-04T10:00:00Z",
    );
    git("checkout", "-q", "main");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("does not bring back a row renumbered by a branch that merged its first copy", () => {
    const found = readBranchFeatures(repo, [], readNotes);
    const maintenance = found.find((f) => f.slug === "maintenance");
    expect(maintenance?.rows.map((row) => row.id)).toEqual([
      "MT-S1-01",
      "MT-S2-01",
    ]);
    expect(ids(found)).not.toContain("MT-S1-02");
  });

  it("keeps a delete or a change made after another branch merged the row", () => {
    const found = readBranchFeatures(repo, [], readNotes);
    const rows = found.find((f) => f.slug === "housekeeping")?.rows ?? [];
    expect(
      rows.map((row) => [row.id, row.status, row.ref.name]).sort(),
    ).toEqual([
      ["HK-S1-02", "approved", "feat/housekeeping"],
      ["HK-S1-03", "proposed", "feat/rooms"],
    ]);
  });

  it("does not bring back a row a local branch deleted after it was pushed", () => {
    const found = readBranchFeatures(repo, [], readNotes);
    const folios = found.find((f) => f.slug === "folios");
    expect(folios?.rows.map((row) => row.id)).toEqual(["FO-S1-01"]);
    expect(ids(found)).not.toContain("FO-S1-02");
  });
});

describe("a branch with a table this cannot read", () => {
  let repo: string;

  beforeAll(() => {
    const { dir, git, commit } = fixture();
    repo = dir;
    commit({ "README.md": "x" }, "main");

    git("checkout", "-q", "-b", "feat/bad-header");
    commit(
      { "docs/features/bad-header/edge-cases.csv": "id,question\nBH-01,why" },
      "a table in some other shape",
    );
    git("checkout", "-q", "main");
    git("checkout", "-q", "-b", "feat/bad-words");
    commit(
      {
        "docs/features/bad-words/edge-cases.csv": [
          HEADER,
          "BW-S1-01,s,g,w,t,module,a_test,done",
          "BW-S1-02,s,g,w,t,by_hand,a_test,approved",
          "BW-S1-03,s,g,w,t,module,a_test,approved",
          "BW-S1-04,s,g,w,t,module,approved",
        ].join("\n"),
        "docs/decisions/ar/bad-words.json": "{ not json",
      },
      "words outside the vocabulary, and broken Arabic",
    );
    git("checkout", "-q", "main");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("renders what it can read and warns about the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const found = readBranchFeatures(repo, [], readNotes);
      expect(found.map((f) => f.slug)).toEqual(["bad-words"]);
      expect(ids(found)).toEqual(["BW-S1-03"]);
      expect(found[0].ar).toEqual({ title: "", entries: {} });
      const html = renderRegister({
        features: [],
        adrs: [],
        adrTranslations: {},
        unmerged: found,
        generatedAt: "now",
      });
      expect(html).toContain("BW-S1-03");
      const warnings = warn.mock.calls.map((call) => String(call[0]));
      expect(warnings.some((w) => w.includes("feat/bad-header"))).toBe(true);
      expect(warnings.some((w) => w.includes("BW-S1-01"))).toBe(true);
      expect(warnings.some((w) => w.includes("BW-S1-02"))).toBe(true);
      expect(
        warnings.some((w) => w.includes("BW-S1-04 has 7 fields, not 8")),
      ).toBe(true);
      expect(warnings.some((w) => w.includes("bad-words.json"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
