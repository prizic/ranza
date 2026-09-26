// Decisions that exist only on branches not yet merged into the tree the
// register is rendered from. A feature is usually designed, and its rows
// approved, on a branch long before it merges; without this the register lags
// what has actually been decided by the length of a review.
//
// Read straight from git, so nothing is checked out or copied. A branch whose
// tip is already in HEAD has nothing to add and is skipped. When several
// branches carry the same table — stacked branches, a stale copy, a local
// branch ahead of what it pushed — they are ranked by when each last changed
// it, and a lower-ranked branch contributes only rows it did not inherit from
// history it shares with a higher-ranked one. Its copy of a row the newer
// branch has since renumbered or deleted is that shared history, not a
// decision of its own, so it stays out; a row it added itself still shows.
//
// A branch has passed none of this tree's checks, so a table in another shape
// or a word the page has no label for is warned about and left out rather
// than allowed to stop the page from rendering.
import { execFileSync } from "node:child_process";
import { parseCsv } from "./csv.mjs";
import { ENFORCED_AR, HEADER, hasKind } from "./decisions-vocabulary.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function isMerged(root, ref) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ref, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    // Exit status 1 is git's "not an ancestor"; anything else is a real fault.
    if (error.status === 1) return false;
    throw error;
  }
}

// Local branches and origin's, newest first, one entry per distinct tip. main
// is left out even when the register is rendered from elsewhere: it is where
// the unmerged section's decisions are headed, not a branch with its own.
const DESTINATIONS = new Set(["origin", "main", "origin/main"]);

export function unmergedRefs(root) {
  const seen = new Set();
  return git(
    root,
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)\t%(objectname)\t%(committerdate:short)",
    "refs/heads",
    "refs/remotes/origin",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, commit, date] = line.split("\t");
      return { name, commit, date };
    })
    .filter((ref) => !ref.name.endsWith("/HEAD") && !DESTINATIONS.has(ref.name))
    .filter((ref) => {
      if (seen.has(ref.commit)) return false;
      seen.add(ref.commit);
      return !isMerged(root, ref.commit);
    });
}

// blob id per feature folder on a ref: `edge-cases.csv` and each `.mmd`.
function featureFiles(root, commit) {
  const files = new Map();
  let listing;
  try {
    listing = git(root, "ls-tree", "-r", commit, "--", "docs/features");
  } catch {
    return files;
  }
  for (const line of listing.split("\n").filter(Boolean)) {
    const [meta, file] = line.split("\t");
    const blob = meta.split(" ")[2];
    const [, , slug, name] = file.split("/");
    if (!name || !(name === "edge-cases.csv" || name.endsWith(".mmd")))
      continue;
    if (!files.has(slug)) files.set(slug, new Map());
    files.get(slug).set(name, blob);
  }
  return files;
}

function rowsOf(csv, where) {
  const [header = [], ...rows] = parseCsv(csv);
  if (header.join(",") !== HEADER.join(",")) {
    console.warn(
      `${where}: header is not "${HEADER.join(",")}", table left out`,
    );
    return [];
  }
  return rows
    .filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i]])))
    .filter((row) => {
      const known = hasKind(row.status) && row.enforced_by in ENFORCED_AR;
      if (!known) {
        console.warn(
          `${where}: ${row.id} has status "${row.status}" and enforced_by "${row.enforced_by}", one outside the vocabulary; row left out`,
        );
      }
      return known;
    });
}

// When the time a branch last changed this table is not enough to choose — a
// branch that merged another in carries its table with the same history — the
// branch named after the feature is the one it belongs to.
function lastChange(root, commit, file) {
  return Number(git(root, "log", "-1", "--format=%ct", commit, "--", file));
}

function owners(root, slug, candidates) {
  const file = `docs/features/${slug}/edge-cases.csv`;
  return candidates
    .map((candidate) => ({
      ...candidate,
      changed: lastChange(root, candidate.ref.commit, file),
      named: candidate.ref.name.includes(slug),
    }))
    .sort(
      (a, b) =>
        b.changed - a.changed ||
        Number(b.named) - Number(a.named) ||
        a.ref.date.localeCompare(b.ref.date),
    )
    .map(({ changed, ...candidate }) => ({
      ...candidate,
      ref: {
        ...candidate.ref,
        changed: new Date(changed * 1000).toISOString().slice(0, 10),
      },
    }));
}

function notesOf(root, files, ref, readNotes) {
  return [...files]
    .filter(([name]) => name.endsWith(".mmd"))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([name, blob]) =>
      readNotes(git(root, "cat-file", "blob", blob), name).map((note) => ({
        ...note,
        ref,
      })),
    );
}

// Exit status 1 is git's "no common ancestor", which unrelated histories
// legitimately have; any other failure is a real fault and propagates.
function mergeBase(root, a, b) {
  try {
    return git(root, "merge-base", a, b).trim();
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
}

function fileAt(root, commit, file) {
  try {
    return git(root, "show", `${commit}:${file}`);
  } catch {
    return null;
  }
}

const tablePath = (slug) => `docs/features/${slug}/edge-cases.csv`;

// Everything but the id: a change of answer, status, enforcement or test is a
// change of decision.
function sameRow(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

function byId(csv, where) {
  return new Map(
    csv === null ? [] : rowsOf(csv, where).map((row) => [row.id, row]),
  );
}

// The table as it stood at `commit`, read for comparison rather than display.
function tableAt(root, commit, slug) {
  return byId(
    commit && fileAt(root, commit, tablePath(slug)),
    `${tablePath(slug)} at ${commit?.slice(0, 7)}`,
  );
}

// The branch's own Arabic, when it has any; rows are still matched by hash,
// so a translation of different English is never shown.
function arabicAt(root, ref, slug) {
  const file = `docs/decisions/ar/${slug}.json`;
  const json = fileAt(root, ref.commit, file);
  if (json === null) return { title: "", entries: {} };
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn(
      `${ref.name}: ${file} is not JSON (${error.message}), shown in English`,
    );
    return { title: "", entries: {} };
  }
}

// A three-way comparison against where the branch left HEAD's history: a row
// is the branch's decision only if the branch added it or changed it since
// then. Comparing with HEAD alone would show a stale branch's copy of a row
// HEAD has since removed as a new decision, and would never show a row the
// branch changed.
function branchDecisions(root, slug, ref, headRows) {
  const baseRows = tableAt(root, mergeBase(root, "HEAD", ref.commit), slug);
  const decisions = [];
  const own = byId(
    fileAt(root, ref.commit, tablePath(slug)),
    `${ref.name}: ${tablePath(slug)}`,
  );
  for (const row of own.values()) {
    const before = baseRows.get(row.id);
    const now = headRows.get(row.id);
    if (before && sameRow(before, row)) continue;
    if (now && sameRow(now, row)) continue;
    decisions.push({ ...row, ref, change: now ? "changed" : "added" });
  }
  return decisions;
}

// Returns one entry per feature with something unmerged: a whole table HEAD
// does not have, or the rows branches add or change in a table HEAD has.
// Every row and note keeps the branch it belongs to.
export function readBranchFeatures(root, current, readNotes) {
  const bySlug = new Map(current.map((feature) => [feature.slug, feature]));
  const head = featureFiles(root, "HEAD");
  const candidates = new Map();
  for (const ref of unmergedRefs(root)) {
    for (const [slug, files] of featureFiles(root, ref.commit)) {
      const blob = files.get("edge-cases.csv");
      if (!blob || head.get(slug)?.get("edge-cases.csv") === blob) continue;
      if (!candidates.has(slug)) candidates.set(slug, []);
      candidates.get(slug).push({ ref, files, blob });
    }
  }

  const result = [];
  for (const [slug, found] of candidates) {
    const ranked = owners(root, slug, found);
    const existing = bySlug.get(slug);
    const headRows = new Map(
      (existing?.rows ?? []).map((row) => [row.id, row]),
    );
    const decided = new Map();
    ranked.forEach(({ ref }, rank) => {
      // What this branch shares with each branch ranked above it: a row it
      // carries unchanged from there is theirs to keep, renumber or delete.
      const inherited = ranked
        .slice(0, rank)
        .map((above) =>
          tableAt(root, mergeBase(root, above.ref.commit, ref.commit), slug),
        );
      for (const row of branchDecisions(root, slug, ref, headRows)) {
        if (decided.has(row.id)) continue;
        const shared = inherited.some(
          (rows) => rows.has(row.id) && sameRow(rows.get(row.id), row),
        );
        if (!shared) decided.set(row.id, row);
      }
    });
    if (decided.size === 0) continue;
    const [owner] = ranked;
    const newFeature = !existing?.hasTable;
    result.push({
      slug,
      newFeature,
      rows: [...decided.values()],
      notes: newFeature ? notesOf(root, owner.files, owner.ref, readNotes) : [],
      ar: arabicAt(root, owner.ref, slug),
    });
  }
  return result.sort((a, b) => a.slug.localeCompare(b.slug));
}
