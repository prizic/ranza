// Builds trial-record.html from what capture.mjs recorded, the suite logs, and
// the feature's edge-case table. Screenshots are copied into shots/ beside it
// and referenced by relative path; the suite output is quoted in full, so the
// record needs nothing else.
//
//   node docs/evidence/housekeeping/build-report.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const read = (f) => readFileSync(path.join(HERE, f), "utf8");
const R = JSON.parse(read(".results.json"));
const F = JSON.parse(read(".fixtures.json"));
// The suite logs carry the terminal's colour codes.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const clean = (s) => s.replace(ANSI, "");
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ---------------------------------------------------------------- edge cases
function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}
const table = parseCsv(
  readFileSync(
    path.join(ROOT, "docs/features/housekeeping/edge-cases.csv"),
    "utf8",
  ),
);

// ------------------------------------------------------------- suite evidence
const tap = [
  "housekeeping",
  "housekeeping_inspection",
  "insert_grants",
].flatMap((f) =>
  read(`.pgtap-${f}.tap`)
    .split("\n")
    .filter((l) => /^(not )?ok /.test(l))
    .map((l) => ({ suite: `${f}.test.sql`, line: l })),
);
const integration = clean(read(".integration.log"))
  .split("\n")
  .filter((l) => /^\s*[✓×]/.test(l))
  .map((l) => l.trim());
const unit = clean(read(".unit.log"))
  .split("\n")
  .filter((l) => /^\s*[✓×]/.test(l))
  .map((l) => l.trim());
const pgtapSummary = clean(read(".pgtap.log"))
  .split("\n")
  .filter((l) => /PASS|FAIL|suites/.test(l));
const integrationSummary = clean(read(".integration.log"))
  .split("\n")
  .filter((l) => /Tests |Test Files/.test(l))
  .map((l) => l.trim());
const unitSummary = clean(read(".unit.log"))
  .split("\n")
  .filter((l) => /Tests |Test Files/.test(l))
  .map((l) => l.trim());

const mentions = (id) => new RegExp(`${id}(?![0-9])`);
function suiteEvidence(id) {
  const re = mentions(id);
  return [
    ...tap.filter((t) => re.test(t.line)).map((t) => `${t.suite}: ${t.line}`),
    ...integration
      .filter((l) => re.test(l))
      .map(
        (l) =>
          `integration: ${l.replace("tests/integration/housekeeping.test.ts > ", "")}`,
      ),
    ...unit
      .filter((l) => re.test(l))
      .map((l) => `unit: ${l.replace(/tests\/unit\//, "")}`),
  ];
}

// --------------------------------------------------------------- screenshots
const SHOTS = path.join(HERE, "shots");
mkdirSync(SHOTS, { recursive: true });
function image(id) {
  const shot = R.shots.find((s) => s.id === id);
  copyFileSync(
    path.join(HERE, ".shots", shot.file),
    path.join(SHOTS, shot.file),
  );
  return shot;
}
const serverLog = clean(read(".server.log")).split("\n");

// ------------------------------------------------------------------- verdict
const cases = R.cases;
const inScope = cases.filter((c) => c.rows.length > 0);
const failed = inScope.filter((c) => c.status === "FAIL");
const passed = inScope.filter((c) => c.status === "PASS");
const outOfScope = cases.filter((c) => c.rows.length === 0);

function rowResult(row) {
  const ui = inScope.filter(
    (c) => c.rows.includes(row.id) && c.status !== "SUPERSEDED",
  );
  const suites = suiteEvidence(row.id);
  // A failing case fails only the rows it names in failedRows: F-1 is refused
  // correctly (HK-S2-04) and loses its selection (HK-S2-13).
  if (
    ui.some(
      (c) => c.status === "FAIL" && (c.failedRows ?? c.rows).includes(row.id),
    )
  ) {
    return { result: "FAIL", ui, suites };
  }
  if (ui.length) return { result: "PASS", ui, suites };
  if (suites.length)
    return { result: "PASS (database / module only)", ui, suites };
  if (["deferred", "out_of_scope"].includes(row.status))
    return {
      result: `Not tested — ${row.status.replaceAll("_", " ")}`,
      ui,
      suites,
    };
  return { result: "UNVERIFIED", ui, suites };
}
const matrix = table.map((row) => ({ row, ...rowResult(row) }));
const unverified = matrix.filter((m) => m.result === "UNVERIFIED");

const badge = (status) => {
  const tone = status.startsWith("PASS")
    ? "pass"
    : status === "FAIL"
      ? "fail"
      : status === "SUPERSEDED"
        ? "muted"
        : status.startsWith("Not tested")
          ? "muted"
          : "warn";
  return `<span class="badge ${tone}">${esc(status)}</span>`;
};

// -------------------------------------------------------------------- groups
const GROUPS = [
  ["R", "Every role on the board"],
  ["L", "One room through its lifecycle"],
  ["B", "Several rooms at once"],
  ["C", "A check-out makes the room dirty (the worker)"],
  ["I", "Checking in to a room that is not ready"],
  ["W", "The warning's layout"],
  ["A", "The audit record and its Where column (#59)"],
  ["K", "Blocked and dirty together"],
  ["S", "The inspection setting"],
  ["F", "A refused mark"],
  ["O", "Housekeeping switched off"],
  ["E", "Empty, out of reach, every locale"],
  ["X", "Out of scope, found during the run"],
];

function caseHtml(c) {
  const figures = c.shots
    .map((id) => {
      const shot = image(id);
      return `<figure id="shot-${esc(id)}"><img alt="${esc(shot.caption)}" loading="lazy" src="shots/${esc(shot.file)}"><figcaption><strong>${esc(id)}</strong> · <code>${esc(shot.url)}</code> · ${esc(shot.at.replace("T", " ").slice(0, 19))} UTC<br>${esc(shot.caption)}</figcaption></figure>`;
    })
    .join("");
  const observed = c.observed
    .map(
      (o) =>
        `<li class="${o.startsWith("✗") ? "bad" : o.startsWith("✓") ? "good" : ""}">${esc(o)}</li>`,
    )
    .join("");
  return `<article class="case ${c.status.toLowerCase()}" id="case-${esc(c.id)}">
  <header><h3><span class="cid">${esc(c.id)}</span> ${esc(c.title)}</h3>${badge(c.status)}</header>
  <p class="rows">Edge-case rows: ${c.rows.length ? c.rows.map((r) => `<a href="#row-${r}">${r}</a>`).join(", ") : "none — outside housekeeping"}</p>
  <h4>What was observed</h4><ul class="observed">${observed}</ul>
  ${c.note ? `<p class="note"><strong>Note.</strong> ${esc(c.note)}</p>` : ""}
  ${figures}
</article>`;
}

const now = new Date().toISOString().replace("T", " ").slice(0, 16);
const retries = R.retries ?? [];

const html = `<title>Housekeeping trial record</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root { --bg:#fbfaf8; --fg:#12211e; --muted:#5b6b67; --line:#dfe5e3; --card:#fff;
  --pass:#176842; --pass-bg:#dcefe3; --fail:#a33a35; --fail-bg:#f5dfdd; --warn:#8a5a08; --warn-bg:#f7e8c8; --muted-bg:#eef1f0; color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 40px 20px 80px; }
h1 { font-size: 34px; line-height:1.15; letter-spacing:-0.02em; margin:0 0 6px; }
h2 { font-size: 22px; margin: 48px 0 12px; padding-top: 12px; border-top: 1px solid var(--line); }
h3 { font-size: 17px; margin: 0; }
h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 14px 0 6px; }
.eyebrow { font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.verdict { border:2px solid var(--fail); background:var(--fail-bg); border-radius:14px; padding:18px 22px; margin:22px 0; }
.verdict p.big { font-size:20px; font-weight:650; margin:0 0 8px; }
.verdict ul { margin:6px 0 0 18px; padding:0; }
table { border-collapse: collapse; width:100%; background:var(--card); font-size:13.5px; }
th, td { text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--line); }
th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); background:var(--muted-bg); }
.scroll { overflow-x:auto; border:1px solid var(--line); border-radius:10px; }
.badge { display:inline-block; font-size:12px; font-weight:650; padding:2px 9px; border-radius:999px; white-space:nowrap; }
.badge.pass { color:var(--pass); background:var(--pass-bg); } .badge.fail { color:var(--fail); background:var(--fail-bg); }
.badge.warn { color:var(--warn); background:var(--warn-bg); } .badge.muted { color:var(--muted); background:var(--muted-bg); }
.case { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin:16px 0; }
.case.fail { border:2px solid var(--fail); }
.case header { display:flex; justify-content:space-between; gap:12px; align-items:start; }
.cid { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--muted); margin-right:6px; }
.rows { font-size:13px; color:var(--muted); margin:6px 0 0; }
.observed { margin:0; padding-left:18px; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.observed li { margin:2px 0; word-break: break-word; } .observed li.good { color:var(--pass); } .observed li.bad { color:var(--fail); font-weight:600; }
.note { background:var(--warn-bg); border-radius:8px; padding:10px 12px; font-size:14px; }
figure { margin:16px 0 0; } figure img { width:100%; height:auto; border:1px solid var(--line); border-radius:8px; display:block; }
figcaption { font-size:13px; color:var(--muted); margin-top:6px; } figcaption code { font-size:12px; word-break: break-all; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
:not(pre) > code { overflow-wrap: anywhere; }
pre { background:#10201d; color:#e6efec; padding:14px; border-radius:10px; overflow-x:auto; font-size:12.5px; line-height:1.45; }
dl.env { display:grid; grid-template-columns: 200px 1fr; gap:6px 16px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin:0; }
dl.env dt { color:var(--muted); font-size:13px; } dl.env dd { margin:0; word-break: break-word; }
details { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; margin:10px 0; }
summary { cursor:pointer; font-weight:600; }
a { color:#0d594f; }
@media (max-width: 640px) { dl.env { grid-template-columns: 1fr; } h1 { font-size: 26px; } }
</style>
<main>
<p class="eyebrow">RANZ-28 · evidence run · ${esc(now)} UTC</p>
<h1>Housekeeping — trial record</h1>
<p>What was exercised against a production build of the merged feature, what was seen, and the screenshot of each state. Nothing here is claimed from reading code.</p>

<section class="verdict" aria-labelledby="verdict">
  <p class="big" id="verdict">PARTIAL — ${failed.length} of ${inScope.length} housekeeping cases FAIL, ${passed.length} PASS, ${inScope.length - failed.length - passed.length} superseded by a re-run.</p>
  <p>Failures first:</p>
  <ul>${failed.map((c) => `<li><a href="#case-${c.id}"><strong>${esc(c.id)}</strong></a> ${esc(c.title)} (${(c.failedRows ?? c.rows).join(", ")}): ${esc(c.headline)}</li>`).join("")}</ul>
  <p>Also found, outside housekeeping: ${outOfScope.map((c) => `<a href="#case-${c.id}">${esc(c.id)}</a> ${esc(c.title.replace("Out of scope: ", ""))}`).join("; ")}; and two audit-log display points and one rate-limiter timeout, listed under <a href="#gaps">Failures and gaps</a>.</p>
  <p>${unverified.length ? `UNVERIFIED rows: ${unverified.map((m) => m.row.id).join(", ")}.` : "Every approved HK-S1/S2/S3 row has either an observed UI case or suite output from this database; none is left unverified."} Rows proven only by the database suites (no screen exists for them) are labelled as such in the matrix.</p>
</section>

<h2>Environment</h2>
<dl class="env">
<dt>Code</dt><dd><code>origin/main</code> at <code>96427b5</code> (contains #56, #57, #58, #59), worktree <code>~/Developer/ranza-evidence-housekeeping</code>, branch <code>evidence/housekeeping</code>, where this record is committed on top of it</dd>
<dt>Application</dt><dd>Operator Workspace production build (<code>next build</code>, Next.js 16.3.5), served by the standalone <code>server.js</code> with <code>.next/static</code> beside it, as <code>deploy/Dockerfile</code> does; <code>NODE_ENV=production</code>, <code>http://127.0.0.1:3113</code></dd>
<dt>Worker</dt><dd><code>apps/worker</code> built with its own <code>pnpm build</code> (esbuild), run as <code>node dist/main.mjs</code> on <code>ranza_worker</code>; stopped and restarted once on purpose (case C-5)</dd>
<dt>Database</dt><dd>Throwaway container <code>ranza-evidence-hk-pg</code> (image <code>ranza-postgres</code>, pgTAP included) on <code>localhost:54393</code>, all 33 migrations applied by <code>prisma migrate deploy</code>; rebuilt from scratch once before the final run (see run notes). Not the shared 54322, not a hosted database.</dd>
<dt>Browser</dt><dd>Headless Chromium from <code>@playwright/test</code>, launched in the capture process itself, one browser context per account, 1440×900</dd>
<dt>Organization</dt><dd>Kanıt Otelleri (<code>${esc(F.organizationId)}</code>): Kadıköy Otel and Beşiktaş Rezidans with housekeeping; Moda Pansiyon with the front desk only; Üsküdar Konak with housekeeping and no rooms; Büyük Otel with 65 rooms</dd>
<dt>Accounts</dt><dd>owner@, manager@, desk@ (front_desk), finance@, housekeeper@ — all Organization-wide — and kadikoy.manager@ (manager, Kadıköy Otel only); all <code>@evidence.test</code>, created through the app's own sign-up route</dd>
<dt>Machine</dt><dd>One laptop, shared with two other evidence lanes capturing at the same time. No housekeeping request stalled; sign-in was refused twice and retried (run notes).</dd>
</dl>

<h2>What was tested</h2>
<p>Every row of <code>docs/features/housekeeping/edge-cases.csv</code>, with the cases that exercised it. <em>PASS (database / module only)</em> means no screen exists for that rule and the evidence is the suite output against this same database, quoted in full further down.</p>
<div class="scroll"><table>
<thead><tr><th>Row</th><th>Situation</th><th>Evidence</th><th>Result</th></tr></thead>
<tbody>${matrix
  .map(
    (m) =>
      `<tr id="row-${m.row.id}"><td><code>${esc(m.row.id)}</code></td><td>${esc(m.row.situation)}</td><td>${
        m.ui
          .map(
            (c) =>
              `<a href="#case-${c.id}">${esc(c.id)}</a> ${badge(c.status)}`,
          )
          .join(" ") || ""
      }${m.suites.length ? `<details><summary>${m.suites.length} suite assertion${m.suites.length === 1 ? "" : "s"}</summary><ul class="observed">${m.suites.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}</td><td>${badge(m.result)}</td></tr>`,
  )
  .join("")}</tbody></table></div>

<h2>Results, case by case</h2>
${GROUPS.map(([prefix, title]) => {
  const inGroup = cases.filter((c) => c.id.startsWith(`${prefix}-`));
  return inGroup.length
    ? `<h3 style="margin-top:32px">${esc(title)}</h3>${inGroup.map(caseHtml).join("")}`
    : "";
}).join("")}

<h2 id="gaps">Failures and gaps</h2>
<h3>In scope</h3>
${failed
  .map(
    (c) =>
      `<div class="case fail"><header><h3><span class="cid">${esc(c.id)}</span> ${esc(c.title)}</h3>${badge("FAIL")}</header><p>${esc(c.note || c.observed.filter((o) => o.startsWith("✗")).join(" "))}</p><p><a href="#case-${c.id}">Evidence above</a> · fails ${(c.failedRows ?? c.rows).join(", ")}</p></div>`,
  )
  .join("")}
<h3>Outside housekeeping, found during the run</h3>
<ul>
<li><strong>X-1: a rate-limited sign-in is reported as a wrong password.</strong> Eight correct sign-ins in a row answered 200, 200, 200 then 429; the sign-in form turns the 429 into "That email and password did not match." <a href="#case-X-1">Evidence</a>.</li>
<li><strong>Better Auth's rate limiter timed out once.</strong> Its counter runs in a Prisma transaction with the default 5 s timeout, and one took 11 s: <code>P2028</code> from <code>@better-auth/core … incrementOne → consume → onRequest</code>. That is the rate limiter's own transaction, not a tenant one, and no housekeeping request failed. The server log carries no timestamps; its last write was at 15:37:34 UTC, nineteen seconds before the owner's sign-in retry below, so that refusal was most likely this error rather than the limit itself. Everything the production server logged during the run:<pre>${esc(serverLog.join("\n").trim())}</pre></li>
<li><strong>Audit log display.</strong> "Who" shows the account's email (desk@evidence.test), as the sidebar does: the name given at sign-up (Deniz Desk) stays in <code>auth_user.name</code>, and Ranza's own <code>users</code> table has no name to show. An Organization-subject record shows its subject as a short id ("Organization · 502586e7") rather than the Organization's name. Visible in <a href="#shot-A-1b">A-1b</a> and <a href="#shot-S-8">S-8</a>.</li>
</ul>
<h3>Not verified by this run</h3>
<ul>
<li>The hosted database: this run used a local throwaway database only.</li>
<li>Phone widths: every screenshot is 1440×900; the board and the warning were not exercised at 400 px.</li>
<li>Deferred and out-of-scope rows (HK-DEF-01 … 06) were not tested, by design.</li>
</ul>
<h3>Run notes — every retry and re-run</h3>
<ul>
<li><strong>First attempt discarded.</strong> The first capture run was taken on an earlier instance of this database. Its board cases counted checkboxes before the table had hydrated, and its lifecycle cases read each row one step late (the previous mark's "1 room updated" was still on screen). Those were script faults, but the runs had written marks and append-only audit records, so the container was deleted, recreated, migrated and re-seeded, and the supporting suites re-run on it, before the run recorded here.</li>
<li><strong>Sign-in retries:</strong> ${retries.length ? retries.map((r) => `${esc(r.role)}, attempt ${r.attempt}, at ${esc(r.at.replace("T", " ").slice(0, 19))} UTC, was refused with "${esc(r.shown)}" and succeeded after a 15 s pause`).join("; ") : "none"}. Both were correct passwords: the form shows a rate limit (X-1), and here probably the rate limiter's own timeout, as a wrong password.</li>
<li><strong>R-*</strong> were captured a second time after a sign-in fix; their screenshots therefore show 102 already marked dirty by L-1…L-4.</li>
<li><strong>B-4</strong> first failed on an ambiguous locator in the script ("Next" also matches the column sort buttons); it was moved into its own section and re-run alone.</li>
<li><strong>C-5</strong> first failed because the script asked the row menu for "Mark clean" on a room already reading Clean; the menu rightly never offers a room its own status (L-5). Re-run using the batch bar; the check-out it had already pressed was not repeated.</li>
<li><strong>I-3</strong> is superseded: the warning was observed, but the script's database check raised before reading the Reservation, and I-5 then checked that Guest in. The whole case was re-run as <strong>I-3r</strong> on a fresh arrival (room 108 and Nezihe Muhiddin, added to the database mid-run and to <code>fixtures.mjs</code> afterwards). I-3r's first attempt failed on a fixture of mine; its second is the one recorded.</li>
<li><strong>W-1</strong> first recorded PASS because the script measured the paragraph's box, not its text; the screenshot contradicted it. Re-measured from the text's own extent: FAIL.</li>
<li><strong>F-1 and O-2</strong> were scripted with checks that did not decide the row's claim; they are recorded as FAIL from what the screenshots and observations show.</li>
<li><strong>Judged by hand after the run:</strong> each FAIL case's one-line summary, the note on F-1 and W-1, and which rows a failing case fails. F-1 fails HK-S2-13 only; the refusal it also exercised (HK-S2-04) was surfaced and wrote nothing, as its own observations show. Also by hand: F-1's status and its ✗ line; I-3 set to SUPERSEDED; the one O-1 case split into O-1 (HK-S1-20) and O-2 (HK-S1-15); and the R-*, F-1 and O-1c captions rewritten to match what their screenshots show. Every other status, observation and caption is what <code>capture.mjs</code> recorded.</li>
<li>Apart from the owner's sign-in above, which spent 11 s in the rate limiter, no request stalled for ~15 s and none needed re-running for load.</li>
</ul>

<h2>Supporting suites, against this database</h2>
<p>Run on the freshly migrated container before any evidence data existed, with the worker stopped. The three housekeeping pgTAP files were run again directly with <code>psql</code> after the walk, for per-assertion output; each rolls back.</p>
<details><summary>pgTAP, all suites (<code>node scripts/db-test.mjs</code>)</summary><pre>${esc(pgtapSummary.join("\n"))}</pre></details>
<details><summary>pgTAP, per assertion: housekeeping, housekeeping_inspection, insert_grants</summary><pre>${esc(tap.map((t) => `${t.suite}  ${t.line}`).join("\n"))}</pre></details>
<details><summary>Integration: tests/integration/housekeeping.test.ts</summary><pre>${esc([...integration, ...integrationSummary].join("\n"))}</pre></details>
<details><summary>Unit: board, inspection card, server actions</summary><pre>${esc([...unit, ...unitSummary].join("\n"))}</pre></details>

<h2>Repro steps</h2>
<ol>
<li><code>git -C ~/Developer/ranza worktree add ~/Developer/ranza-evidence-housekeeping -b evidence/housekeeping 96427b5</code>, <code>pnpm install</code>, <code>pnpm --filter @ranza/db generate</code>.</li>
<li><code>docker run -d --name ranza-evidence-hk-pg -e POSTGRES_USER=ranza -e POSTGRES_PASSWORD=ranza -e POSTGRES_DB=ranza -p 54393:5432 ranza-postgres:latest</code>; <code>DIRECT_URL="postgresql://ranza:ranza@localhost:54393/ranza?connect_timeout=60" packages/db/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma</code>; <code>alter role ranza_app|ranza_auth|ranza_worker with login password '&lt;role&gt;'</code>.</li>
<li><code>.env</code>: <code>DATABASE_URL</code>, <code>DIRECT_URL</code>, <code>WORKER_DATABASE_URL</code>, <code>AUTH_DATABASE_URL</code> as the four roles on 54393; <code>BETTER_AUTH_URL=http://localhost:3113</code>; any local <code>BETTER_AUTH_SECRET</code>.</li>
<li>Suites: <code>DIRECT_URL=… node scripts/db-test.mjs</code>; <code>npx vitest run --config vitest.integration.mts tests/integration/housekeeping.test.ts</code> with the worker stopped.</li>
<li>Build and serve: <code>(cd apps/operator-workspace &amp;&amp; npx next build)</code>, copy <code>.next/static</code> to <code>.next/standalone/apps/operator-workspace/.next/static</code>, then <code>NODE_ENV=production PORT=3113 HOSTNAME=127.0.0.1 node apps/operator-workspace/.next/standalone/apps/operator-workspace/server.js</code>. Worker: <code>(cd apps/worker &amp;&amp; pnpm build &amp;&amp; node dist/main.mjs)</code>.</li>
<li><code>node docs/evidence/housekeeping/fixtures.mjs</code>.</li>
<li><code>node docs/evidence/housekeeping/capture.mjs roles lifecycle batch bound checkout</code>; stop the worker; <code>… capture.mjs raceStop</code>; start the worker; <code>… capture.mjs raceResume redelivery unavailable checkin checkinAgain warningFits audit blocked inspection refusal switchedOff misc signinLimit</code>.</li>
<li><code>node docs/evidence/housekeeping/build-report.mjs</code>.</li>
</ol>
</main>
`;

writeFileSync(path.join(HERE, "trial-record.html"), html);
console.log(
  `wrote trial-record.html: ${(html.length / 1e6).toFixed(1)} MB, ${cases.length} cases, ${matrix.length} rows, unverified: ${unverified.map((m) => m.row.id).join(", ") || "none"}`,
);
console.log(
  "row results:",
  Object.entries(
    matrix.reduce((a, m) => ((a[m.result] = (a[m.result] || 0) + 1), a), {}),
  ),
);
