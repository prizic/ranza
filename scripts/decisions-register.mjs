// Renders docs/decisions.html: every question asked about every feature, and
// the answer that was settled, in English and Arabic.
//
// Nothing here is a second record. The edge-case tables are where a decision is
// made (feature-design step d) and the diagrams' `%% OPEN:` / `%% DECIDED:`
// comments are where a question is left; this only reads them. The output is
// gitignored because a copy committed alongside two dozen lanes editing those
// tables would be stale between regenerations and conflict on every merge —
// a decision register that disagrees with the table is worse than none.
//
// Arabic lives in docs/decisions/ar/, keyed by row id and stamped with a hash
// of the English it was translated from. When a decision changes, its hash
// stops matching and the page shows the English with a warning rather than an
// Arabic answer to a question that no longer reads that way. `--pending ar`
// prints what needs translating; docs/decisions/README.md says how.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readBranchFeatures } from "./decisions-branches.mjs";
import { parseCsv } from "./csv.mjs";
import { ENFORCED_AR, KINDS, STATUS_AR } from "./decisions-vocabulary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUPS = {
  NB: { en: "Not built", ar: "لم يُبنَ" },
  DIFF: { en: "Current behaviour", ar: "السلوك الحالي" },
  DEF: { en: "Deferred", ar: "مؤجل" },
  PRE: { en: "Prerequisites", ar: "متطلبات مسبقة" },
  "": { en: "Rows", ar: "الصفوف" },
};

const ROW_FIELDS = ["situation", "given", "when", "then"];
// The shape edge-cases-check.mjs allows, unanchored, including ungrouped ids.
const ROW_ID = /\b(?:[A-Z]+(?:-(?:S\d+|NB|DIFF|DEF))?|PRE)-\d+\b/g;

export function kindOf(status) {
  const entry = Object.entries(KINDS).find(([, kind]) =>
    kind.statuses.includes(status),
  );
  if (!entry) throw new Error(`status "${status}" belongs to no kind`);
  return entry[0];
}

export function groupOf(id) {
  if (id.startsWith("PRE-")) return "PRE";
  const parts = id.split("-");
  return parts.length === 3 ? parts[1] : "";
}

function groupLabel(group) {
  const slice = /^S(\d+)$/.exec(group);
  if (slice) return { en: `Slice ${slice[1]}`, ar: `الشريحة ${slice[1]}` };
  return GROUPS[group] ?? GROUPS[""];
}

export function hashOf(...parts) {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 12);
}

export const rowHash = (row) => hashOf(...ROW_FIELDS.map((key) => row[key]));
export const noteKey = (note) => `note-${hashOf(note.text).slice(0, 8)}`;

export function readRows(file) {
  const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
  return rows
    .filter((cells) => cells.length === header.length)
    .map((cells) =>
      Object.fromEntries(header.map((key, i) => [key, cells[i]])),
    );
}

// A note is a `%% OPEN:` or `%% DECIDED (...):` line and the `%%` lines that
// continue it, up to a blank comment, another tag or the end of the comment.
export function readNotes(text, source) {
  const notes = [];
  let current = null;
  for (const line of text.split("\n")) {
    const comment = /^\s*%%\s?(.*)$/.exec(line);
    const body = comment?.[1].trim() ?? "";
    const tag = /^(OPEN|DECIDED|DEFERRED)\b[^:]*:\s*(.*)$/.exec(body);
    if (tag) {
      current = { tag: tag[1], text: tag[2], source };
      notes.push(current);
    } else if (current && comment && body !== "") {
      current.text += ` ${body}`;
    } else {
      current = null;
    }
  }
  return notes.filter((note) => note.tag !== "DEFERRED");
}

// A diagram's OPEN comment names the rows that carry its question. When every
// one of them has since been decided, the comment is out of date, and saying so
// is more useful than repeating it. A deferred or blocked row has not answered
// the question, only postponed it, so the comment still stands.
export function staleness(note, rowsById) {
  if (note.tag !== "OPEN") return null;
  const ids = [...new Set(note.text.match(ROW_ID) ?? [])].filter((id) =>
    rowsById.has(id),
  );
  if (ids.length === 0) return null;
  const decided = ids.filter(
    (id) => kindOf(rowsById.get(id).status) === "decided",
  );
  if (decided.length !== ids.length) return null;
  return decided.map((id) => ({ id, status: rowsById.get(id).status }));
}

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
}

export function readFeatures(featuresDir, translationsDir) {
  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(featuresDir, entry.name);
      const table = path.join(dir, "edge-cases.csv");
      const rows = existsSync(table) ? readRows(table) : [];
      const notes = readdirSync(dir)
        .filter((name) => name.endsWith(".mmd"))
        .sort()
        .flatMap((name) =>
          readNotes(readFileSync(path.join(dir, name), "utf8"), name),
        );
      const ar = readJson(path.join(translationsDir, `${entry.name}.json`), {
        title: "",
        entries: {},
      });
      return {
        slug: entry.name,
        hasTable: existsSync(table),
        rows,
        notes,
        ar,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readAdrs(adrDir) {
  return readdirSync(adrDir)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort()
    .map((file) => {
      const text = readFileSync(path.join(adrDir, file), "utf8");
      return {
        file,
        number: file.slice(0, 4),
        title: /^# \d{4}\.\s*(.*)$/m.exec(text)?.[1] ?? file,
        date: /^Date:\s*(.*)$/m.exec(text)?.[1] ?? "",
        amended: /^Amended:/m.test(text),
      };
    });
}

// What a translator owes: every row, note, title and ADR whose Arabic is
// missing or was written against English that has since changed. The values are
// the English, in the exact shape docs/decisions/ar/ stores the Arabic.
export function pendingTranslations(features, adrs, adrTranslations) {
  const pending = {};
  for (const feature of features.filter((f) => f.hasTable)) {
    const entries = {};
    for (const row of feature.rows) {
      const done = feature.ar.entries[row.id];
      if (done?.source_hash === rowHash(row)) continue;
      entries[row.id] = {
        source_hash: rowHash(row),
        ...Object.fromEntries(ROW_FIELDS.map((key) => [key, row[key]])),
      };
    }
    for (const note of feature.notes) {
      if (feature.ar.entries[noteKey(note)]) continue;
      entries[noteKey(note)] = { text: note.text };
    }
    const title = feature.ar.title ? undefined : titleOf(feature.slug);
    if (title || Object.keys(entries).length) {
      pending[feature.slug] = { ...(title && { title }), entries };
    }
  }
  const adrEntries = {};
  for (const adr of adrs) {
    if (adrTranslations[adr.number]?.source_hash === hashOf(adr.title))
      continue;
    adrEntries[adr.number] = {
      source_hash: hashOf(adr.title),
      title: adr.title,
    };
  }
  if (Object.keys(adrEntries).length) pending.adrs = adrEntries;
  return pending;
}

// Arabic for a row that was renumbered or deleted, or a note that was reworded,
// matches nothing and would otherwise sit in the files forever. Reported so it
// can be deleted, never rendered.
export function orphanedTranslations(features, adrs, adrTranslations) {
  const orphaned = {};
  for (const feature of features) {
    const live = new Set([
      ...feature.rows.map((row) => row.id),
      ...feature.notes.map(noteKey),
    ]);
    const dead = Object.keys(feature.ar.entries).filter(
      (key) => !live.has(key),
    );
    if (dead.length) orphaned[feature.slug] = dead;
  }
  const numbers = new Set(adrs.map((adr) => adr.number));
  const deadAdrs = Object.keys(adrTranslations).filter((n) => !numbers.has(n));
  if (deadAdrs.length) orphaned.adrs = deadAdrs;
  return orphaned;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Escaped first, then decorated, so nothing a table says can become markup.
function prose(value, adrFiles) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\bADR (\d{4})\b/g, (match, number) => {
      const file = adrFiles.get(number);
      return file ? `<a href="adr/${escapeHtml(file)}">${match}</a>` : match;
    });
}

// Both languages are in the page; the stylesheet shows one. A missing Arabic
// value falls back to the English, marked as English so it still reads
// left-to-right inside a right-to-left page.
function both(en, ar) {
  const arabic =
    ar === undefined || ar === null || ar === ""
      ? `<span class="ar" lang="en" dir="ltr">${en}</span>`
      : `<span class="ar" lang="ar" dir="rtl">${ar}</span>`;
  return `<span class="en" lang="en">${en}</span>${arabic}`;
}

const plain = (en, ar) => both(escapeHtml(en), ar && escapeHtml(ar));

function titleOf(slug) {
  const words = slug.replaceAll("-", " ");
  return words[0].toUpperCase() + words.slice(1);
}

// A diagram note is a question as much as a row is. A live OPEN note awaits a
// decision; a DECIDED note, or an OPEN note every row of which is decided, is
// decided. It is counted, searched and filtered alongside the rows.
export function noteKind(note, rowsById) {
  return note.tag === "OPEN" && !staleness(note, rowsById)
    ? "pending"
    : "decided";
}

function kindsOf(feature) {
  const rowsById = new Map(feature.rows.map((row) => [row.id, row]));
  return [
    ...feature.rows.map((row) => kindOf(row.status)),
    ...feature.notes.map((note) => noteKind(note, rowsById)),
  ];
}

function counts(kinds) {
  const tally = Object.fromEntries(Object.keys(KINDS).map((kind) => [kind, 0]));
  for (const kind of kinds) tally[kind]++;
  return tally;
}

export function translationState(row, entry) {
  if (!entry) return "missing";
  return entry.source_hash === rowHash(row) ? "current" : "stale";
}

const WARNINGS = {
  missing: "لم يُترجَم هذا الصف بعد — النص بالإنجليزية.",
  stale:
    "تغيّر هذا القرار بعد ترجمته — يُعرض النص الإنجليزي حتى تُحدَّث الترجمة.",
  branch: "قرار على فرع لم يُدمَج بعد — يُترجَم عند دمجه.",
};

function renderRow(row, entry, adrFiles) {
  const kind = kindOf(row.status);
  const translated = translationState(row, entry);
  const state = row.ref && translated !== "current" ? "branch" : translated;
  const ar = (key) =>
    state === "current" ? prose(entry[key], adrFiles) : undefined;
  const search = [row.id, ...ROW_FIELDS.map((key) => row[key])]
    .concat(state === "current" ? ROW_FIELDS.map((key) => entry[key]) : [])
    .join(" ")
    .toLowerCase();
  return `<article class="row${row.ref ? " unmerged" : ""}" data-kind="${kind}" data-search="${escapeHtml(search)}">
  <div class="row-head"><span class="id">${escapeHtml(row.id)}</span><span class="pill ${kind}">${plain(row.status.replaceAll("_", " "), STATUS_AR[row.status])}</span></div>
  ${state === "current" ? "" : `<p class="warning ar" lang="ar" dir="rtl">${WARNINGS[state]}</p>`}
  <h4>${both(prose(row.situation, adrFiles), ar("situation"))}</h4>
  <dl>
    <dt>${plain("Given", "بفرض أن")}</dt><dd>${both(prose(row.given, adrFiles), ar("given"))}</dd>
    <dt>${plain("When", "عندما")}</dt><dd>${both(prose(row.when, adrFiles), ar("when"))}</dd>
    <dt>${kind === "decided" ? plain("Decided", "القرار") : plain("Then", "النتيجة")}</dt><dd class="answer">${both(prose(row.then, adrFiles), ar("then"))}</dd>
  </dl>
  <p class="meta">${plain("Enforced by", "يُفرَض عبر")} <b>${plain(row.enforced_by.replaceAll("_", " "), ENFORCED_AR[row.enforced_by])}</b>${row.test_name ? ` · ${plain("test", "الاختبار")} <code>${escapeHtml(row.test_name)}</code>` : ""}${row.ref ? ` · ${row.change === "changed" ? plain("changes this row on", "يغيّر هذا الصف على") : plain("on", "على")} <code>${escapeHtml(row.ref.name)}</code>` : ""}</p>
</article>`;
}

function renderNote(note, feature, rowsById, adrFiles) {
  const stale = staleness(note, rowsById);
  const entry = feature.ar.entries[noteKey(note)];
  const staleEn = stale
    ?.map(({ id, status }) => `${id} is ${status.replaceAll("_", " ")}`)
    .join(", ");
  const staleAr = stale
    ?.map(({ id, status }) => `${id} ${STATUS_AR[status]}`)
    .join("، ");
  const search = [note.text, note.source, entry?.text ?? ""]
    .join(" ")
    .toLowerCase();
  return `<li class="note ${note.tag.toLowerCase()}${stale ? " stale" : ""}" data-kind="${noteKind(note, rowsById)}" data-search="${escapeHtml(search)}">
  <span class="note-tag">${note.tag === "OPEN" ? plain("Open question", "سؤال مفتوح") : plain("Decided", "تقرّر")}</span>
  <p>${both(prose(note.text, adrFiles), entry && prose(entry.text, adrFiles))}</p>
  <p class="meta">${plain("From", "من")} <code>${escapeHtml(note.source)}</code>${stale ? ` — <b>${plain("out of date:", "لم يعد صحيحًا:")}</b> ${plain(staleEn, staleAr)}` : ""}</p>
</li>`;
}

function sourceLine(feature) {
  const count = plain(
    `${feature.rows.length} ${feature.rows.length === 1 ? "row" : "rows"}`,
    `عدد الصفوف: ${feature.rows.length}`,
  );
  const file = `<code>docs/features/${escapeHtml(feature.slug)}/edge-cases.csv</code>`;
  if (!feature.branchOnly) return `${file} · ${count}`;
  const branches = [...new Set(feature.rows.map((row) => row.ref.name))];
  const changed = feature.rows[0].ref.changed;
  const where = branches
    .map((name) => `<code>${escapeHtml(name)}</code>`)
    .join(", ");
  return feature.newFeature
    ? `${file} ${plain("on", "على")} ${where} · ${plain(`table last changed ${changed}`, `آخر تعديل للجدول ${changed}`)} · ${count}`
    : `${plain("Rows added or changed on branches not yet merged, from", "صفوف أُضيفت أو تغيّرت على فروع لم تُدمَج بعد، من")} ${where} · ${count}`;
}

function renderFeature(feature, adrFiles) {
  const rowsById = new Map(feature.rows.map((row) => [row.id, row]));
  const tally = counts(kindsOf(feature));
  const groups = new Map();
  for (const row of feature.rows) {
    const group = groupOf(row.id);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  const summary = Object.entries(KINDS)
    .filter(([kind]) => tally[kind] > 0)
    .map(
      ([kind, label]) =>
        `<span class="pill ${kind}">${tally[kind]} ${plain(label.en.toLowerCase(), label.ar)}</span>`,
    )
    .join("");
  const anchor = feature.branchOnly ? `unmerged-${feature.slug}` : feature.slug;
  return `<section class="feature" id="${escapeHtml(anchor)}">
  <header class="feature-head">
    <h2>${plain(titleOf(feature.slug), feature.ar.title)}</h2>
    <p class="source">${sourceLine(feature)}</p>
    <div class="pills">${summary}</div>
  </header>
  ${
    feature.notes.length
      ? `<div class="notes"><h3>${plain("From the diagrams", "من المخططات")}</h3><ul>${feature.notes.map((note) => renderNote(note, feature, rowsById, adrFiles)).join("")}</ul></div>`
      : ""
  }
  ${[...groups]
    .map(([group, rows]) => {
      const label = groupLabel(group);
      return `<div class="group"><h3>${plain(label.en, label.ar)}</h3>${rows.map((row) => renderRow(row, feature.ar.entries[row.id], adrFiles)).join("")}</div>`;
    })
    .join("")}
</section>`;
}

function renderAdr(adr, adrTranslations) {
  const entry = adrTranslations[adr.number];
  const ar = entry?.source_hash === hashOf(adr.title) ? entry.title : undefined;
  return `<li><a href="adr/${escapeHtml(adr.file)}"><span class="id">${adr.number}</span> ${plain(adr.title, ar)}</a><span class="meta">${escapeHtml(adr.date)}${adr.amended ? ` · ${plain("amended", "مُعدَّل")}` : ""}</span></li>`;
}

export function coverage(features, adrs, adrTranslations) {
  const tally = { current: 0, stale: 0, missing: 0, notes: 0, adrs: 0 };
  for (const feature of features) {
    for (const row of feature.rows) {
      tally[translationState(row, feature.ar.entries[row.id])]++;
    }
    tally.notes += feature.notes.filter(
      (note) => !feature.ar.entries[noteKey(note)],
    ).length;
  }
  tally.adrs = adrs.filter(
    (adr) => adrTranslations[adr.number]?.source_hash !== hashOf(adr.title),
  ).length;
  return tally;
}

export function renderRegister({
  features,
  adrs,
  adrTranslations,
  generatedAt,
  unmerged = [],
}) {
  const adrFiles = new Map(adrs.map((adr) => [adr.number, adr.file]));
  const withTable = features.filter((feature) => feature.hasTable);
  const withoutTable = features.filter((feature) => !feature.hasTable);
  const onBranches = unmerged.map((feature) => ({
    ...feature,
    branchOnly: true,
    ar: feature.ar ?? { title: "", entries: {} },
  }));
  const unmergedCount = onBranches.flatMap(kindsOf).length;
  const all = counts([...withTable, ...onBranches].flatMap(kindsOf));
  const total = Object.values(all).reduce((sum, n) => sum + n, 0);
  const featureCount =
    withTable.length +
    onBranches.filter((feature) => feature.newFeature).length;
  const rowCount = withTable.reduce((sum, f) => sum + f.rows.length, 0);
  const translated = coverage(withTable, adrs, adrTranslations);

  const index = withTable
    .map((feature) => {
      const tally = counts(kindsOf(feature));
      const awaitingEn = tally.pending
        ? ` · <b>${tally.pending} awaiting</b>`
        : "";
      const awaitingAr = tally.pending
        ? ` · <b>${tally.pending} بانتظار قرار</b>`
        : "";
      return `<li><a href="#${escapeHtml(feature.slug)}">${plain(titleOf(feature.slug), feature.ar.title)}</a><span class="meta">${both(`${tally.decided} decided${awaitingEn}`, `${tally.decided} تقرّر${awaitingAr}`)}</span></li>`;
    })
    .join("");

  const filters = [["all", { en: "All", ar: "الكل" }], ...Object.entries(KINDS)]
    .map(
      ([kind, label]) =>
        `<button type="button" data-filter="${kind}" aria-pressed="${kind === "all"}">${plain(label.en, label.ar)}<span>${kind === "all" ? total : all[kind]}</span></button>`,
    )
    .join("");

  const untranslated = [
    translated.current < rowCount &&
      `تغطي الترجمة ${translated.current} من ${rowCount} صفًا${translated.stale ? `، و${translated.stale} منها تغيّر بعد ترجمته` : ""}`,
    translated.notes && `${translated.notes} من ملاحظات المخططات بلا ترجمة`,
    translated.adrs && `${translated.adrs} من عناوين ADR بلا ترجمة`,
  ].filter(Boolean);
  const translationNote = untranslated.length
    ? `<p class="warning ar" lang="ar" dir="rtl">${untranslated.join("؛ ")}. ما لم يُترجَم يظهر بالإنجليزية.</p>`
    : "";

  return `<!doctype html>
<html lang="en" dir="ltr" data-lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ranza Decision Register</title>
<style>
:root {
  --canvas: #fbfaf8; --surface: #ffffff; --ink: #1f1e1c; --ink-muted: #5f5e5b;
  --line: #e6e3dc; --accent: #0f5b43;
  --success: #176842; --success-soft: #dcefe3; --warning: #8a5a08; --warning-soft: #f7e8c8;
  --danger: #a33a35; --danger-soft: #f5dfdd; --info: #315f83; --info-soft: #dfeaf2;
  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --arabic: "IBM Plex Sans Arabic", "Geeza Pro", "Noto Sans Arabic", Tahoma, sans-serif;
  --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #121312; --surface: #1a1c1b; --ink: #ecebe7; --ink-muted: #a5a39e;
    --line: #2d302e; --accent: #7fcfa9;
    --success: #86d3a9; --success-soft: #1b3326; --warning: #e9c07a; --warning-soft: #3a2c12;
    --danger: #ee9c96; --danger-soft: #3d1f1d; --info: #9cc3e2; --info-soft: #1b2c3a;
  }
}
* { box-sizing: border-box; }
html[data-lang="en"] .ar, html[data-lang="ar"] .en { display: none !important; }
body { margin: 0; background: var(--canvas); color: var(--ink); font: 15px/1.55 var(--sans); }
html[data-lang="ar"] body { font-family: var(--arabic); font-size: 16px; line-height: 1.75; }
main { max-width: 1080px; margin: 0 auto; padding: 56px 20px 96px; }
a { color: var(--accent); }
/* An ADR reference is one name; "ADR" and its number never part at a line end. */
a[href^="adr/"] { white-space: nowrap; }
code, .id { font-family: var(--mono); font-size: 0.86em; direction: ltr; unicode-bidi: isolate; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.lang { font: 600 14px/1 var(--sans); color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 9px 16px; cursor: pointer; white-space: nowrap; }
.lang .ar { font-family: var(--arabic); }
.label, .eyebrow, .pill, .note-tag, .row dt, .group h3, .notes h3, .columns h2 { font-family: var(--mono); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
/* Letter-spacing breaks the joins in Arabic script, and it has no case. */
html[data-lang="ar"] :is(.eyebrow, .pill, .note-tag, .row dt, .group h3, .notes h3, .columns h2) { font-family: var(--arabic); letter-spacing: 0; text-transform: none; }
.eyebrow { font-size: 11px; line-height: 1.4; color: var(--ink-muted); margin: 0 0 16px; }
h1 { font-size: clamp(40px, 7vw, 76px); line-height: 1.02; letter-spacing: -0.035em; margin: 0 0 20px; font-weight: 650; }
html[data-lang="ar"] h1 { letter-spacing: 0; line-height: 1.25; }
.lede { max-width: 62ch; color: var(--ink-muted); margin: 0 0 24px; }
.lede code { white-space: nowrap; }
.warning { background: var(--warning-soft); color: var(--warning); border-radius: 10px; padding: 8px 12px; font-size: 14px; margin: 8px 0; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; margin: 16px 0 40px; }
.totals div { background: var(--surface); padding: 18px 20px; }
.totals b { display: block; font-size: 40px; font-weight: 300; letter-spacing: -0.03em; line-height: 1.1; }
.totals span { color: var(--ink-muted); font-size: 13px; }
.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 48px; }
.columns h2 { font-size: 11px; line-height: 1; color: var(--ink-muted); margin: 0 0 12px; }
.columns h2.sub { margin-top: 28px; }
.unmerged-intro { margin-top: 64px; padding-top: 32px; border-top: 2px solid var(--ink); }
.unmerged-intro h2 { font-size: 32px; letter-spacing: -0.02em; margin: 0 0 8px; font-weight: 600; }
html[data-lang="ar"] .unmerged-intro h2 { letter-spacing: 0; }
.row.unmerged { border-style: dashed; }
.columns ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.columns li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.columns li a { text-decoration: none; }
.columns .meta { color: var(--ink-muted); white-space: nowrap; font-size: 13px; margin: 0; }
.adrs { max-height: 420px; overflow: auto; }
.toolbar { position: sticky; top: 0; z-index: 1; background: var(--canvas); padding: 12px 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 24px; }
.toolbar input { flex: 1 1 240px; min-width: 0; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 8px 16px; }
.toolbar button { font: 500 13px/1.2 inherit; font-family: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; cursor: pointer; }
.toolbar button > span:last-child { margin-inline-start: 6px; color: var(--ink-muted); }
.toolbar button[aria-pressed="true"] { background: var(--ink); color: var(--canvas); border-color: var(--ink); }
.toolbar button[aria-pressed="true"] > span:last-child { color: inherit; opacity: 0.7; }
.showing { font-size: 13px; color: var(--ink-muted); margin-inline-start: auto; }
.feature { padding-top: 32px; margin-top: 16px; border-top: 1px solid var(--line); }
.feature-head h2 { font-size: 32px; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 600; }
html[data-lang="ar"] .feature-head h2 { letter-spacing: 0; }
.source { color: var(--ink-muted); margin: 0 0 12px; font-size: 13px; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.pill { font-size: 11px; line-height: 1.3; letter-spacing: 0.04em; border-radius: 999px; padding: 4px 9px; white-space: nowrap; }
.pill.decided { background: var(--success-soft); color: var(--success); }
.pill.pending { background: var(--warning-soft); color: var(--warning); }
.pill.gap { background: var(--danger-soft); color: var(--danger); }
.pill.parked { background: var(--info-soft); color: var(--info); }
.group h3, .notes h3 { font-size: 11px; line-height: 1.4; color: var(--ink-muted); margin: 24px 0 10px; }
.notes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.note { background: var(--surface); border: 1px solid var(--line); border-inline-start: 3px solid var(--warning); border-radius: 10px; padding: 12px 16px; }
.note.decided { border-inline-start-color: var(--success); }
.note.stale { border-inline-start-color: var(--line); }
.note p { margin: 4px 0 0; }
.note-tag { font-size: 11px; color: var(--ink-muted); }
.row { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 10px; }
.row-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.row-head .id { color: var(--ink-muted); }
.row h4 { margin: 8px 0 10px; font-size: 16px; font-weight: 600; }
.row dl { display: grid; grid-template-columns: 84px 1fr; gap: 4px 12px; margin: 0; }
.row dt { font-size: 11px; line-height: 1.9; letter-spacing: 0.08em; color: var(--ink-muted); }
html[data-lang="ar"] .row dt { font-size: 13px; line-height: 1.75; }
.row dd { margin: 0; }
.row dd.answer { font-weight: 500; }
.meta { color: var(--ink-muted); font-size: 13px; margin: 10px 0 0; overflow-wrap: anywhere; }
.empty { color: var(--ink-muted); padding: 24px 0; }
[hidden] { display: none !important; }
@media (max-width: 720px) {
  main { padding: 32px 16px 64px; }
  .columns { grid-template-columns: 1fr; }
  .row dl { grid-template-columns: 1fr; }
  .row dt { margin-top: 6px; }
  .showing { margin-inline-start: 0; width: 100%; }
}
</style>
</head>
<body>
<main>
<div class="top">
  <p class="eyebrow">${both(`Generated ${escapeHtml(generatedAt)} · do not edit — run <code>pnpm decisions</code>`, `أُنشئ في <span dir="ltr">${escapeHtml(generatedAt)}</span> · لا تعدّله يدويًا — شغّل <code>pnpm decisions</code>`)}</p>
  <button type="button" class="lang" data-toggle-lang>${both('<span lang="ar">العربية</span>', "English")}</button>
</div>
<h1>${plain("Decision register", "سجل القرارات")}</h1>
<p class="lede">${both(
    "Every question raised about a feature and the answer we settled on, read from each feature's <code>edge-cases.csv</code> and the open or decided notes in its diagrams. The table is the record; change a decision there and regenerate this page. Cross-cutting decisions are ADRs.",
    "كل سؤال طُرح حول ميزة والجواب الذي استقررنا عليه، مقروءًا من ملف <code>edge-cases.csv</code> الخاص بكل ميزة ومن ملاحظات مخططاتها المفتوحة أو المحسومة. الجدول هو المرجع؛ غيّر القرار هناك ثم أعد إنشاء هذه الصفحة. القرارات المعمارية العامة مسجّلة في ADR. النص الإنجليزي هو المرجع الملزم، والعربية ترجمة له.",
  )}</p>
${translationNote}

<div class="totals">
  <div><b>${total}</b><span>${plain(`questions across ${featureCount} features`, `سؤالًا في ${featureCount} ميزة`)}</span></div>
  ${Object.entries(KINDS)
    .map(
      ([kind, label]) =>
        `<div><b>${all[kind]}</b><span>${plain(label.en.toLowerCase(), label.ar)}</span></div>`,
    )
    .join("")}
  ${unmergedCount ? `<div><b>${unmergedCount}</b><span>${plain("of them only on unmerged branches", "منها على فروع لم تُدمَج")}</span></div>` : ""}
</div>

<div class="columns">
  <div>
    <h2>${plain("Features", "الميزات")}</h2>
    <ul>${index}</ul>
    ${
      onBranches.length
        ? `<h2 class="sub">${plain("On branches, not merged", "على فروع لم تُدمَج")}</h2><ul>${onBranches
            .map(
              (feature) =>
                `<li><a href="#unmerged-${escapeHtml(feature.slug)}">${plain(titleOf(feature.slug), undefined)}</a><span class="meta"><code>${escapeHtml([...new Set(feature.rows.map((row) => row.ref.name))].join(", "))}</code></span></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    ${
      withoutTable.length
        ? `<p class="meta">${plain("No decision table yet:", "لا يوجد جدول قرارات بعد:")} ${withoutTable.map((feature) => `<code>${escapeHtml(feature.slug)}</code>`).join(", ")}</p>`
        : ""
    }
  </div>
  <div>
    <h2>${plain(`Architecture decisions · ${adrs.length}`, `القرارات المعمارية · ${adrs.length}`)}</h2>
    <ul class="adrs">${adrs.map((adr) => renderAdr(adr, adrTranslations)).join("")}</ul>
  </div>
</div>

<div class="toolbar" role="search">
  <input type="search" name="q" data-placeholder-en="Search questions, answers or ids" data-placeholder-ar="ابحث في الأسئلة أو الأجوبة أو المعرّفات" placeholder="Search questions, answers or ids" aria-label="Search decisions" />
  ${filters}
  <span class="showing" aria-live="polite"></span>
</div>

${withTable.map((feature) => renderFeature(feature, adrFiles)).join("\n")}
${
  onBranches.length
    ? `<section class="unmerged-intro" id="unmerged">
  <h2>${plain("Decided on branches, not yet merged", "قرارات على فروع لم تُدمَج بعد")}</h2>
  <p class="lede">${plain(
    "These tables and rows exist only on branches in this clone that are not part of this one — someone with other branches checked out sees a different list. They are real decisions under review, not settled ones: a branch can still change or drop them. Each row names its branch.",
    "هذه الجداول والصفوف موجودة فقط على فروع في هذه النسخة لم تُدمَج في هذا الفرع — ومن لديه فروع أخرى يرى قائمة مختلفة. إنها قرارات قيد المراجعة لا قرارات نهائية: قد يغيّرها الفرع أو يسقطها. كل صف يذكر فرعه.",
  )}</p>
</section>
${onBranches.map((feature) => renderFeature(feature, adrFiles)).join("\n")}`
    : ""
}
<p class="empty" hidden>${plain("Nothing matches.", "لا توجد نتائج مطابقة.")}</p>
</main>
<script>
(() => {
  const html = document.documentElement;
  const input = document.querySelector(".toolbar input");
  const buttons = [...document.querySelectorAll("[data-filter]")];
  const rows = [...document.querySelectorAll(".row, .note")];
  const showing = document.querySelector(".showing");
  let filter = "all";

  function setLanguage(lang) {
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    html.dataset.lang = lang;
    input.placeholder = input.dataset["placeholder" + (lang === "ar" ? "Ar" : "En")];
    input.setAttribute("aria-label", lang === "ar" ? "ابحث في القرارات" : "Search decisions");
    try { localStorage.setItem("ranza-decisions-lang", lang); } catch {}
    apply();
  }

  function apply() {
    const terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    let visible = 0;
    for (const row of rows) {
      const show = (filter === "all" || row.dataset.kind === filter) &&
        terms.every((term) => row.dataset.search.includes(term));
      row.hidden = !show;
      if (show) visible++;
    }
    for (const group of document.querySelectorAll(".group")) {
      group.hidden = !group.querySelector(".row:not([hidden])");
    }
    const narrowed = filter !== "all" || terms.length > 0;
    for (const notes of document.querySelectorAll(".notes")) {
      notes.hidden = !notes.querySelector(".note:not([hidden])");
    }
    for (const feature of document.querySelectorAll(".feature")) {
      feature.hidden = narrowed && !feature.querySelector(".row:not([hidden]), .note:not([hidden])");
    }
    showing.textContent = html.dataset.lang === "ar"
      ? "المعروض: " + visible + " من " + rows.length
      : visible + " of " + rows.length + " shown";
    document.querySelector(".empty").hidden = visible > 0;
  }

  input.addEventListener("input", apply);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      apply();
    });
  }
  document.querySelector("[data-toggle-lang]").addEventListener("click", () => {
    setLanguage(html.dataset.lang === "ar" ? "en" : "ar");
  });

  let stored = null;
  try { stored = localStorage.getItem("ranza-decisions-lang"); } catch {}
  const requested = new URLSearchParams(location.search).get("lang");
  setLanguage(requested === "ar" || requested === "en" ? requested : stored === "ar" ? "ar" : "en");
})();
</script>
</body>
</html>
`;
}

// The branches only add to the page; git failing to list or read them is no
// reason to lose the part of it this tree can vouch for.
function branchFeatures(features) {
  try {
    return readBranchFeatures(root, features, readNotes);
  } catch (error) {
    console.warn(`branches skipped: ${error.message} (use --no-branches)`);
    return [];
  }
}

function main(args) {
  const translationsDir = path.join(root, "docs/decisions/ar");
  const features = readFeatures(
    path.join(root, "docs/features"),
    translationsDir,
  );
  const adrs = readAdrs(path.join(root, "docs/adr"));
  const adrTranslations = readJson(path.join(translationsDir, "adrs.json"), {});

  if (args[0] === "--pending") {
    if (args[1] !== "ar") throw new Error("usage: --pending ar [feature|adrs]");
    const pending = pendingTranslations(features, adrs, adrTranslations);
    const orphaned = orphanedTranslations(features, adrs, adrTranslations);
    if (Object.keys(orphaned).length) pending.orphaned = orphaned;
    const only = args[2];
    console.log(
      JSON.stringify(only ? (pending[only] ?? {}) : pending, null, 2),
    );
    return;
  }

  const unmerged = args.includes("--no-branches")
    ? []
    : branchFeatures(features);
  const output = path.join(root, "docs/decisions.html");
  writeFileSync(
    output,
    renderRegister({
      features,
      adrs,
      adrTranslations,
      unmerged,
      generatedAt:
        new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    }),
  );
  const withTable = features.filter((feature) => feature.hasTable);
  const rows = withTable.reduce((sum, feature) => sum + feature.rows.length, 0);
  const translated = coverage(withTable, adrs, adrTranslations);
  const orphaned = Object.values(
    orphanedTranslations(features, adrs, adrTranslations),
  ).flat().length;
  console.log(
    `wrote ${path.relative(root, output)}: ${rows} rows from ${withTable.length} features, ${adrs.length} ADRs`,
  );
  for (const feature of unmerged) {
    const branches = [...new Set(feature.rows.map((row) => row.ref.name))];
    const changed = feature.rows.filter((row) => row.change === "changed");
    const detail = feature.newFeature
      ? `${feature.rows.length} rows`
      : `${feature.rows.length - changed.length} added, ${changed.length} changed`;
    console.log(
      `  unmerged: ${feature.slug} — ${detail} on ${branches.join(", ")}`,
    );
  }
  console.log(
    `Arabic: ${translated.current} current, ${translated.stale} out of date, ${translated.missing} missing rows, ${translated.notes} untranslated notes, ${translated.adrs} untranslated ADR titles, ${orphaned} orphaned — see \`pnpm decisions --pending ar\``,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
