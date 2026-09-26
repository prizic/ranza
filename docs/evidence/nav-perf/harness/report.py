"""Builds docs/evidence/nav-perf/trial-record.html from the captured data only."""
import html
import json
import os
import statistics

ROOT = "/Users/pcx/Developer/ranza-evidence-nav/docs/evidence/nav-perf"
D = os.path.join(ROOT, "data")


def j(name):
    return json.load(open(os.path.join(D, name)))


def e(s):
    return html.escape(str(s))


timing = j("timing-summary.json")
A, B = timing["after"], timing["before"]
casesA, casesB = j("cases-after.json"), j("cases-before.json")
txA, txB = j("tx-db-after.json"), j("tx-db-before.json")
roleA, roleB = j("role-after.json"), j("role-before.json")
downA, downB = j("dbdown-after.json"), j("dbdown-before.json")
slow = j("pg-slow-statements-campaign.json")
txbrowser = {label: [j(f"tx-browser-{label}-run{r}.json") for r in (1, 2, 3)] for label in ("after", "before")}


def per_run(summary):
    out = []
    for r in summary["runs"]:
        rows = [x for x in summary["rows"] if x["run"] == r["run"]]
        calm = [x["dataMs"] for x in rows if x["dataMs"] <= 1500]
        out.append(
            {
                "run": r["run"],
                "load": r["loadAtStart"],
                "feedback": round(statistics.median(x["feedbackMs"] for x in rows)),
                "data": round(statistics.median(x["dataMs"] for x in rows)),
                "calm": round(statistics.median(calm)) if calm else None,
                "stalls": sum(1 for x in rows if x["dataMs"] > 1500),
                "newdocs": sum(1 for x in rows if x["newDocument"]),
            }
        )
    return out


def fig(src, caption, wide=False):
    return f'<figure class="{"wide" if wide else ""}"><img src="{e(src)}" alt="{e(caption)}" loading="lazy"><figcaption>{caption}</figcaption></figure>'


def status(s):
    cls = {"PASS": "pass", "FAIL": "fail", "NOT IMPROVED": "warn", "UNVERIFIED": "unv", "OBSERVATION": "obs", "PRE-EXISTING GAP": "warn"}[s]
    return f'<span class="st {cls}">{s}</span>'


# ---- numbers used in prose ---------------------------------------------------
phases = ["full-load:today", "idle-8s:today", "click:finance", "click:people", "click:audit-log", "idle-8s+hover-rows:audit-log", "click:today"]


def tx_row(tx, phase):
    counts = [next(p for p in tx[r] if p["name"] == phase)["tenantTx"] for r in sorted(tx)]
    kinds = next(p for p in tx["1"] if p["name"] == phase)["kinds"]
    auth = [next(p for p in tx[r] if p["name"] == phase)["authQueries"] for r in sorted(tx)]
    return counts, kinds, auth


def browser_phase(label, phase):
    rows = [next(p for p in run["phases"] if p["name"] == phase) for run in txbrowser[label]]
    return rows


prop = casesA["cases"]["property"]["steps"], casesB["cases"]["property"]["steps"]
sessA, sessB = casesA["cases"]["session"], casesB["cases"]["session"]
auditA, auditB = casesA["cases"]["auditRows"], casesB["cases"]["auditRows"]
locA, locB = casesA["cases"]["locale"], casesB["cases"]["locale"]
filmA, filmB = casesA["cases"]["filmstrip"], casesB["cases"]["filmstrip"]
slowA, slowB = casesA["cases"]["slowNetwork"], casesB["cases"]["slowNetwork"]
full_load_prefetches = [len(r["rscPrefetches"]) for r in browser_phase("after", "full-load:today")]

CSS = """
:root{--ink:#16222b;--muted:#5d6b75;--line:#dde3e6;--ground:#f6f5f1;--card:#fff;--accent:#0d6e5f;--fail:#b3261e;--warn:#8a5a00;--pass:#1f6f3d}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:1180px;margin:0 auto;padding:48px 28px 96px}
h1{font-size:40px;line-height:1.1;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:24px;margin:56px 0 12px;padding-top:12px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:28px 0 8px}
.eyebrow{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.lede{color:var(--muted);font-size:16px;max-width:820px}
.verdict{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--warn);padding:22px 24px;margin:28px 0}
.verdict .word{font:700 28px/1 ui-monospace,Menlo,monospace;color:var(--warn);letter-spacing:.04em}
.verdict p{margin:10px 0 0;font-size:17px}
.failures{background:#fff6f5;border:1px solid #f0c9c5;padding:18px 22px;margin:18px 0}
.failures h3{margin-top:0;color:var(--fail)}
.failures li{margin:8px 0}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);margin:12px 0;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;background:#fafaf8}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace;font-size:13px}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#eef0ef;padding:1px 5px;border-radius:4px}
pre{background:#10181e;color:#e6ecef;padding:14px 16px;overflow:auto;font:12.5px/1.5 ui-monospace,Menlo,monospace;border-radius:6px}
.st{display:inline-block;font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;padding:5px 7px;border-radius:4px;white-space:nowrap}
.st.pass{background:#e4f1e8;color:var(--pass)}.st.fail{background:#fbe4e2;color:var(--fail)}.st.warn{background:#fbf0d9;color:var(--warn)}.st.unv{background:#ececec;color:#444}.st.obs{background:#e6eef6;color:#1f4d78}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);padding:8px}
figure img{display:block;width:100%;height:auto;border:1px solid #e8ecee}
figcaption{font-size:13px;color:var(--ink);padding:8px 2px 2px}
figcaption b{display:block;margin-bottom:2px}
.side{font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}
.note{color:var(--muted);font-size:14px}
details{background:var(--card);border:1px solid var(--line);padding:10px 14px;margin:12px 0}
summary{cursor:pointer;font-weight:600}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.kpi>div{background:var(--card);border:1px solid var(--line);padding:14px}
.kpi .big{font:300 34px/1 -apple-system,Helvetica,sans-serif;letter-spacing:-.02em}
.kpi .cap{font-size:12.5px;color:var(--muted);margin-top:6px}
@media (max-width:900px){.grid,.grid3,.grid4,.kpi{grid-template-columns:1fr}}
"""

rA, rB = per_run(A), per_run(B)
pA0, pB0 = prop
calm_note = f"clicks that did not stall (≤ 1.5 s): AFTER {A['dataCalm']['n']}/45, BEFORE {B['dataCalm']['n']}/45"

parts = []
w = parts.append
w(f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Trial record — page switching (#58)</title><style>{CSS}</style></head><body><main>")
w("<div class='eyebrow'>Trial record · Operator Workspace · PR #58 perf/soft-navigation</div>")
w("<h1>Page switching: before and after #58</h1>")
w("<p class='lede'>Every number and image below was produced against two production builds running side by side on this machine, each against its own throwaway database. Nothing here is reasoned about; each claim names the capture behind it, and the raw data sits beside this file in <code>data/</code>.</p>")

# ---- verdict ---------------------------------------------------------------
w("<section class='verdict'><div class='word'>PARTIAL</div>")
w(f"<p>#58 does what it set out to do mechanically — 0 of 45 rail clicks load a new document (BEFORE: 45 of 45), the first visible change comes at a median {A['feedback']['median']} ms (BEFORE {B['feedback']['median']} ms), a page switch costs 1–3 tenant transactions instead of 12–14, and the chosen Property is kept — but it <b>introduced a language regression</b> (server-rendered copy turns Turkish after a rail click on <code>/en</code> and <code>/ar</code>), and on clicks that did not stall <b>the page's data reaches the screen later than before</b> (median {A['dataCalm']['median']} ms vs {B['dataCalm']['median']} ms).</p></section>")

w("<section class='failures'><h3>Failures, first</h3><ol>")
w(f"<li><b>F1 — FAIL, regression from #58: wrong language after a rail click.</b> On <code>/en</code> and <code>/ar</code>, every page reached through the rail renders its server copy in Turkish (e.g. Finance says “{e(locA[0]['clicked']['heading'])}” on <code>/en</code>); a reload of the same URL renders it correctly (“{e(locA[0]['reloaded']['heading'])}”). The sign-in page reached by a soft redirect is Turkish too. BEFORE is correct in every case. Root cause: pages call <code>getTranslations()</code> with no locale and only <code>app/[locale]/layout.tsx:61</code> calls <code>setRequestLocale</code>; a client navigation does not re-run that layout, so <code>i18n/request.ts</code> falls back to <code>defaultLocale</code> (tr). Same finding as the audit lane's F-2. <a href='#locale'>Evidence ↓</a></li>")
w(f"<li><b>F2 — FAIL against the goal: data on screen is slower on an unloaded click.</b> On {calm_note}, AFTER's median is {A['dataCalm']['median']} ms (min {A['dataCalm']['min']}) and BEFORE's is {B['dataCalm']['median']} ms (min {B['dataCalm']['min']}). The skeleton from <code>loading.tsx</code> appears at ~48 ms and React then holds any Suspense fallback for at least 300 ms (<code>globalMostRecentFallbackTime + 300 - now()</code>, Next's bundled react-dom line 12097), so AFTER cannot show data before ~340 ms even when the server answers in ~15 ms. What AFTER wins is feedback, not data. <a href='#timing'>Evidence ↓</a></li>")
w(f"<li><b>F3 — NOT IMPROVED here: stalls.</b> {A['stalls']['n']}/45 AFTER clicks and {B['stalls']['n']}/45 BEFORE clicks took longer than 1.5 s (up to {max(A['stalls']['ms'])/1000:.1f} s and {max(B['stalls']['ms'])/1000:.1f} s). Postgres itself logged trivial statements taking 4–16 s in both builds; the Docker VM they run in has 4 vCPUs at load 50–129 with CPU pressure ~85–90 % from unrelated containers. #58 cut the statements the database had to run by 7.7× ({slow['after']['statements']['ranza_app']} vs {slow['before']['statements']['ranza_app']} tenant statements for the same 45 clicks) and the >1 s statements from {slow['before']['slowOver1s']} to {slow['after']['slowOver1s']}, but in this environment that did not make stalls rarer. What changes is what a stalled click looks like: AFTER shows a skeleton within ~50 ms, BEFORE shows nothing until the new document arrives. <a href='#stalls'>Evidence ↓</a></li>")
w("<li><b>Pre-existing gap (not #58):</b> when the database goes away mid-session, a rail click in both builds replaces the whole workspace — rail included — with Next's generic “This page couldn’t load”; there is no workspace error boundary. <a href='#dbdown'>Evidence ↓</a></li>")
w("<li><b>UNVERIFIED:</b> the mobile bottom dock, the Front Office group's children (arrivals, departures, reservations, rooms), an Organization missing some Entitlements, roles other than manager and front desk, and <code>/tr</code> (where F1 cannot show, since Turkish is the fallback). None was exercised. <a href='#gaps'>Details ↓</a></li>")
w("</ol></section>")

w("<div class='kpi'>")
w(f"<div><div class='big'>0 / 45</div><div class='cap'>AFTER rail clicks that loaded a new document (BEFORE: {B['newDocuments']} / 45)</div></div>")
w(f"<div><div class='big'>{A['feedback']['median']} ms</div><div class='cap'>AFTER median to the first visible change (BEFORE {B['feedback']['median']} ms)</div></div>")
w(f"<div><div class='big'>{A['dataCalm']['median']} ms</div><div class='cap'>AFTER median to data on screen, un-stalled clicks (BEFORE {B['dataCalm']['median']} ms) — worse</div></div>")
w("<div><div class='big'>3 → 1–3</div><div class='cap'>AFTER tenant transactions: full load → each page switch (BEFORE 12 → 12–14)</div></div>")
w("</div>")

# ---- environment ------------------------------------------------------------
w("<h2 id='env'>Environment</h2><table>")
env = [
    ("AFTER", "<code>origin/main</code> at <code>96427b5</code> (Merge #59) — includes #58, and also #56, #57 and #59"),
    ("BEFORE", "<code>498616d</code> (Merge #54) — main with #55 and #54, before #58"),
    ("Builds", "<code>next build</code> + <code>next start</code> of <code>apps/operator-workspace</code> in each worktree; AFTER on <code>http://localhost:3115</code>, BEFORE on <code>http://localhost:3125</code>"),
    ("Databases", "two throwaway <code>ranza-postgres</code> (PostgreSQL 17 + pgTAP) containers, AFTER on port 54395, BEFORE on 54396, each migrated by its own tree (33 and 29 migrations) and seeded through its own app with <code>scripts/db-seed-dev.mjs</code>; started with <code>log_statement=all</code> and later <code>log_duration=on</code>. The shared 54322 and every hosted database were not touched."),
    ("Account", "<code>deniz@example.test</code>, role <b>manager</b>, assigned to both Properties (Deniz Otel Kadıköy, Deniz Rezidans Beşiktaş). Role case: a <b>front_desk</b> account assigned to Kadıköy only."),
    ("Audit history", "24 (BEFORE) / 25 (AFTER) <code>staff.invited</code> records, created by inviting colleagues through each app's own People dialog; AFTER has one more because a debug run of the invite script created it."),
    ("Browser", "headless Chromium from Playwright 1.63, in this lane's own process, viewport 1440×1000. No shared browser MCP was used."),
    ("When", f"2026-09-24, timing runs {e(A['runs'][0]['at'][11:19])}–{e(B['runs'][-1]['at'][11:19])} UTC; cases and re-runs until about 17:15 UTC"),
    ("Machine load", "Mac load average 10–25 during the timing runs (per-run values below), spiking past 200 later while other lanes captured. The colima Docker VM (4 vCPU) sat at load 50–129 with CPU pressure <code>some avg10</code> 85–90 % throughout, mostly from eight unrelated <code>cvat_worker_*</code> containers."),
]
for k, v in env:
    w(f"<tr><th style='width:160px'>{k}</th><td>{v}</td></tr>")
w("</table>")
w("<p class='note'><b>Confound, stated up front.</b> AFTER is today's main, so it also carries #56, #57 and #59. Where a difference comes from those (the audit log's layout and paging, the front-desk role losing the audit log, the second layout read) it is called out; the transaction breakdown below separates #58's reads from #59's.</p>")

# ---- matrix ------------------------------------------------------------------
w("<h2 id='matrix'>What was tested</h2><table><tr><th>#</th><th>Case</th><th>AFTER</th><th>BEFORE (control)</th><th>Result</th></tr>")
matrix = [
    ("1", "<a href='#reloads'>Rail click loads a new document?</a>", "0 / 45", "45 / 45", "PASS"),
    ("2", "<a href='#timing'>Time to first visible change</a>", f"median {A['feedback']['median']} ms", f"median {B['feedback']['median']} ms", "PASS"),
    ("3", "<a href='#timing'>Time to data on screen (un-stalled clicks)</a>", f"median {A['dataCalm']['median']} ms", f"median {B['dataCalm']['median']} ms", "FAIL"),
    ("4", "<a href='#stalls'>Clicks slower than 1.5 s</a>", f"{A['stalls']['n']} / 45", f"{B['stalls']['n']} / 45", "NOT IMPROVED"),
    ("5", "<a href='#skeleton'>Loading skeleton shown mid-navigation</a>", "yes, 45 / 45 clicks; captured", "no skeleton exists", "PASS"),
    ("6", "<a href='#tx'>Tenant transactions: full load / page switch</a>", "3 / 1–3", "12 / 12–14", "PASS"),
    ("7", "<a href='#property'>?property= kept across rail clicks</a>", "kept, 3 of 3 clicks", "dropped on every click", "PASS"),
    ("8", "<a href='#session'>Ended session sent to sign-in on the next click</a>", "yes, without a new document", "yes, by a full load", "PASS"),
    ("9", "<a href='#audit'>Audit rows do not prefetch</a>", f"0 prefetches for {auditA['rowLinks']} row links, 10 hovered", "0 (plain anchors)", "PASS"),
    ("10", "<a href='#locale'>Server copy in the URL's language after a click</a>", "Turkish on /en and /ar", "correct", "FAIL"),
    ("11", "<a href='#signedout'>Signed out → sign-in</a>", "redirected", "redirected", "PASS"),
    ("12", "<a href='#role'>Non-default role (front desk)</a>", "soft, Property kept", "full loads", "PASS"),
    ("13", "<a href='#dbdown'>Database down mid-navigation</a>", "generic error, shell lost", "generic error, shell lost", "PRE-EXISTING GAP"),
    ("14", "<a href='#gaps'>Mobile dock, Front Office children, partial Entitlements, other roles, /tr</a>", "not exercised", "not exercised", "UNVERIFIED"),
]
for row in matrix:
    w("<tr>" + "".join(f"<td>{c}</td>" for c in row[:-1]) + f"<td>{status(row[-1])}</td></tr>")
w("</table>")

# ---- 1 reloads ----------------------------------------------------------------
w("<h2 id='reloads'>1 · Does a rail click load a new document?</h2>")
w("<p>Each click was measured in the page itself. An init script gives every document an id; after the click the harness asks which document it is talking to, and separately counts <code>document</code>-type requests the browser made. 3 runs × 15 clicks per build, the runs interleaved AFTER/BEFORE, cycling Finance → People → Audit log → Analytics → Today.</p>")
w("<table><tr><th>Build</th><th class='num'>clicks</th><th class='num'>new document</th><th class='num'>document requests</th><th class='num'>navigation response</th></tr>")
w(f"<tr><td>AFTER</td><td class='num'>45</td><td class='num'>{A['newDocuments']}</td><td class='num'>{A['documentRequests']}</td><td class='num'>45 × RSC fetch</td></tr>")
w(f"<tr><td>BEFORE</td><td class='num'>45</td><td class='num'>{B['newDocuments']}</td><td class='num'>{B['documentRequests']}</td><td class='num'>45 × HTML document</td></tr></table>")
w(f"<p>{status('PASS')} Every AFTER click stayed in the same document; every BEFORE click replaced it. The full per-click list is in the appendix and in <code>data/timing-*-run*.json</code>.</p>")

# ---- 2 timing -----------------------------------------------------------------
w("<h2 id='timing'>2 · Time to the first visible change, and to data on screen</h2>")
w("<p><b>How it was measured.</b> Times start at the click event, taken inside the page. <i>First visible change</i>: for a soft navigation, two animation frames after the old content leaves <code>main</code> (the skeleton or the new page replacing it); for a full load, the new document's <code>first-contentful-paint</code>. <i>Data on screen</i>: two animation frames after <code>main</code> holds the new page with no <code>aria-busy</code> skeleton left in it (full load: the later of that and first paint). A click slower than 1.5 s is reported as a stall and never dropped. The screencast filmstrips further down check these in-page marks against painted pixels.</p>")
w("<table><tr><th>Build · run</th><th>load at start (1/5/15 min)</th><th class='num'>first change, median</th><th class='num'>data, median</th><th class='num'>data, median of un-stalled</th><th class='num'>stalls &gt;1.5 s</th></tr>")
for label, rows in (("AFTER", rA), ("BEFORE", rB)):
    for r in rows:
        w(f"<tr><td>{label} · run {r['run']}</td><td>{e(r['load'])}</td><td class='num'>{r['feedback']} ms</td><td class='num'>{r['data']} ms</td><td class='num'>{r['calm']} ms</td><td class='num'>{r['stalls']} / 15</td></tr>")
w(f"<tr><th>AFTER · all 45</th><td></td><th class='num'>{A['feedback']['median']} ms</th><th class='num'>{A['data']['median']} ms</th><th class='num'>{A['dataCalm']['median']} ms (n={A['dataCalm']['n']})</th><th class='num'>{A['stalls']['n']} / 45</th></tr>")
w(f"<tr><th>BEFORE · all 45</th><td></td><th class='num'>{B['feedback']['median']} ms</th><th class='num'>{B['data']['median']} ms</th><th class='num'>{B['dataCalm']['median']} ms (n={B['dataCalm']['n']})</th><th class='num'>{B['stalls']['n']} / 45</th></tr></table>")
w("<table><tr><th>Page</th><th class='num'>AFTER first change</th><th class='num'>AFTER data (un-stalled)</th><th class='num'>BEFORE first change = data (un-stalled)</th></tr>")
for seg in ["finance", "people", "audit-log", "analytics", "today"]:
    a, b = A["perSegment"][seg], B["perSegment"][seg]
    w(f"<tr><td>{seg}</td><td class='num'>{a['feedbackMedian']} ms</td><td class='num'>{a['calmDataMedian']} ms</td><td class='num'>{b['calmDataMedian']} ms</td></tr>")
w("</table>")
w(f"<p>{status('PASS')} First visible change: AFTER {A['feedback']['median']} ms median, p90 {A['feedback']['p90']} ms — flat even through stalls. BEFORE {B['feedback']['median']} ms median, p90 {B['feedback']['p90']} ms, because a stalled full load shows nothing until the document arrives.</p>")
w(f"<p>{status('FAIL')} Data on screen, un-stalled clicks: AFTER {A['dataCalm']['median']} ms, BEFORE {B['dataCalm']['median']} ms. AFTER never went below {A['dataCalm']['min']} ms, on any page — Analytics, which reads almost nothing, included. The floor is the same on every page, including one that reads almost nothing, so it does not track the server's work; AFTER's navigation response starts arriving at a median {A['firstByte']['median']} ms (BEFORE's HTML document: {B['firstByte']['median']} ms), though a first byte alone does not prove the page's data had arrived. What the floor does match is React: once a Suspense fallback is on screen it is kept for at least 300 ms. In the <code>react-dom</code> Next 16.3.5 bundles (<code>next/dist/compiled/react-dom/cjs/react-dom-client.production.js</code>):</p>")
w("<pre>12097:          ((exitStatus = globalMostRecentFallbackTime + 300 - now()),\n13270:      300 &gt; now() - globalMostRecentFallbackTime)</pre>")
w("<p class='note'>~48 ms to the skeleton + 300 ms held = the ~345 ms seen on every un-stalled AFTER click. This is a consequence of adding <code>(workspace)/loading.tsx</code>, which is also what makes the instant skeleton and the prefetch possible — a trade, not an accident, but one #58 did not state.</p>")

w("<h3 id='skeleton'>Filmstrips — painted frames from Chrome's own screencast</h3>")
w("<p>Chrome's <code>Page.startScreencast</code> emits a timestamped frame whenever the page repaints. The harness keeps the last frame before the click and every frame after it whose size changed by more than 2 % (a visible change, not the skeleton's pulse); every frame's offset and size is listed in <code>data/cases-*.json</code>. Stalled attempts were retried until one did not stall, and each attempt is recorded. The frames shown come from <code>img/frames-*/</code>; <code>img/*-film-*.jpg</code> are the harness's fixed-mark picks for the same clicks (last before, first after, +100 ms, +250 ms, first after the data mark), kept because the JSON names them, and <code>img/frames-after-film-slow/</code> holds every saved frame of the slow click, the skeleton pulsing for eight seconds.</p>")


def film_figs(label, film, folder, what):
    rows = []
    for f in film["sequence"]["saved"]:
        ms = int(f.replace("ms.jpg", "").replace("+", ""))
        rows.append((ms, f"img/{folder}/{f}"))
    return rows


def caption_for(label, ms, kind):
    return kind


A_attempts = ", ".join(f"attempt {a['attempt']} ({a['segment']}): {a['dataMs']} ms" for a in filmA["attempts"])
B_attempts = ", ".join(f"attempt {a['attempt']} ({a['segment']}): {a['dataMs']} ms" for a in filmB["attempts"])
w(f"<div class='side'>AFTER · Today → Finance · un-stalled (attempts: {e(A_attempts)})</div><div class='grid3'>")
fa = filmA["sequence"]["saved"]
capsA = {
    "+00013ms.jpg": "<b>+13 ms — nothing changed yet.</b> Still Today; the first repaint after the click. Proves the clock starts on the click.",
    "+00027ms.jpg": "<b>+27 ms — skeleton under the Finance bar.</b> The page bar already says Finance, the rail marks it, and the work surface shows the loading skeleton. Proves feedback within one or two frames.",
    "+00321ms.jpg": "<b>+321 ms — Finance content.</b> The folio list at Deniz Otel Kadıköy; note its heading reads “Folyolar —”, the F1 language regression. In-page data mark for this click: 328 ms.",
}
for f in fa:
    w(fig(f"img/frames-after-film-normal/{f}", capsA.get(f, f"<b>{f}</b>")))
w("</div>")
w(f"<div class='side'>BEFORE · Today → People · un-stalled (attempts: {e(B_attempts)})</div><div class='grid3'>")
capsB = {
    "+00024ms.jpg": "<b>+24 ms — nothing changed.</b> Today, the old document, still on screen while the new one is fetched.",
    "+00332ms.jpg": "<b>+332 ms — the new document's first paint.</b> The People page arrives complete, data included. The first visible change and the data are the same frame.",
    "+00380ms.jpg": "<b>+380 ms — hydrated.</b> The role selects now show their values; the page is interactive again.",
}
for f in filmB["sequence"]["saved"]:
    w(fig(f"img/frames-before-film-normal/{f}", capsB.get(f, f"<b>{f}</b>")))
w("</div>")
w(f"<p class='note'>Pixel check of the in-page marks: AFTER's content frame is at +321 ms against an in-page data mark of {filmA['click']['dataMs']} ms; BEFORE's first frame is at +332 ms against an in-page first paint of {filmB['click']['feedbackMs']} ms. The in-page numbers agree with painted frames to within about one frame.</p>")

w(f"<h3>Slow network — {slowA['addedLatencyMs']} ms added to every request</h3>")
w("<p>With <code>Network.emulateNetworkConditions</code> adding 2.5 s of latency after the rail had prefetched, the same click on both builds. This is the capture that shows the skeleton unambiguously.</p><div class='grid4'>")
slowA_saved = slowA["sequence"]["saved"]
pick = [slowA_saved[0], slowA_saved[1], slowA_saved[2], slowA_saved[-1]]
capsSA = {
    pick[0]: f"<b>AFTER {pick[0][:-6].lstrip('+').lstrip('0')} ms</b> — still Today, the click registered.",
    pick[1]: f"<b>AFTER +{int(pick[1][1:6])} ms — skeleton.</b> Shown from the prefetched loading boundary without waiting on the slow network.",
    pick[2]: f"<b>AFTER +{int(pick[2][1:6])} ms — still the skeleton</b>, pulsing while the slowed request is in flight.",
    pick[3]: f"<b>AFTER +{int(pick[3][1:6])} ms — People content.</b> Data arrived (2.5 s of added latency plus a stall on the starved VM; in-page mark {slowA['click']['dataMs']} ms).",
}
for f in pick:
    w(fig(f"img/frames-after-film-slow/{f}", capsSA[f]))
w("</div><div class='grid3'>")
sb = slowB["sequence"]["saved"]
capsSB = {
    sb[0]: f"<b>BEFORE +{int(sb[0][1:6])} ms — still Today.</b>",
    sb[1]: f"<b>BEFORE +{int(sb[1][1:6])} ms — first new pixels.</b> Nothing changed on screen for the {int(sb[1][1:6])/1000:.1f} s before this frame: no skeleton, no progress; the old page simply stays.",
    sb[-1]: f"<b>BEFORE +{int(sb[-1][1:6])} ms — People, painted.</b>",
}
for f in sb:
    w(fig(f"img/frames-before-film-slow/{f}", capsSB.get(f, f)))
w("</div>")

# ---- stalls -------------------------------------------------------------------
w("<h2 id='stalls'>3 · Stalls, and where they come from</h2>")
w(f"<p>{status('NOT IMPROVED')} AFTER stalled on {A['stalls']['n']} of 45 clicks (ms: {', '.join(map(str, A['stalls']['ms']))}); BEFORE on {B['stalls']['n']} of 45 (ms: {', '.join(map(str, B['stalls']['ms']))}). One click per build went past 15 s and was re-run once, as the brief asks; both re-runs are marked in the appendix.</p>")
w("<p>With <code>log_duration=on</code>, each container's own log for the timing window says where the time went:</p>")
w("<table><tr><th>Build</th><th class='num'>tenant statements</th><th class='num'>auth statements</th><th class='num'>statements &gt; 1 s</th><th>&gt; 1 s, by table or statement</th><th>slowest</th></tr>")
for label, s in (("AFTER", slow["after"]), ("BEFORE", slow["before"])):
    top = "; ".join(f"{t['ms']} ms {e(t['user'])} {e(t['what'][:40])}" for t in s["top"][:3])
    by = ", ".join(f"{e(k[:48])} ×{v}" for k, v in s["slowByTarget"].items())
    w(f"<tr><td>{label}</td><td class='num'>{s['statements'].get('ranza_app')}</td><td class='num'>{s['statements'].get('ranza_auth')}</td><td class='num'>{s['slowOver1s']}</td><td>{by}</td><td>{top}</td></tr>")
w("</table>")
w("<p>A single-row lookup on <code>auth_session</code> or a call to <code>app.set_request_context()</code> does not take 14 s on its own. Inside the colima VM that hosts both databases, <code>/proc/loadavg</code> read 50–129 on 4 vCPUs and <code>/proc/pressure/cpu</code> read <code>some avg10=85–90</code> whenever it was sampled; <code>docker stats</code> showed eight unrelated <code>cvat_worker_*</code> containers at 37–50 % CPU each. The stalls are the environment, and they hit both builds alike. What #58 changes is how much work each click asks of that starved database — 7.7× fewer tenant statements for the same clicks — and what the user sees while waiting.</p>")

# ---- tx -----------------------------------------------------------------------
w("<h2 id='tx'>4 · Tenant transactions, counted by Postgres</h2>")
w("<p>A tenant transaction is one <code>select app.set_request_context(...)</code> executed by <code>ranza_app</code>, which is how <code>withOrganizationContext()</code> opens every one. The harness wrote a marker statement (<code>select 'EVMARK …'</code>) into each database between phases, so phases are cut by Postgres's own log order, with no clocks compared. Three runs per build; the counts were identical in all three, so one column per build is shown. What each transaction ran is labelled by the first statement after <code>set_request_context</code>, so a transaction that opens with a permission check is labelled by that check even when it goes on to read the audit log.</p>")
w("<table><tr><th>Phase</th><th class='num'>AFTER</th><th>AFTER — what ran</th><th class='num'>BEFORE</th><th>BEFORE — what ran</th><th class='num'>auth queries A / B</th></tr>")
for ph in phases:
    ca, ka, aa = tx_row(txA, ph)
    cb, kb, ab = tx_row(txB, ph)
    fmt = lambda k: "<br>".join(f"{v} × {e(n)}" for n, v in k.items()) or "—"
    same = lambda xs: str(xs[0]) if len(set(xs)) == 1 else "/".join(map(str, xs))
    w(f"<tr><td>{e(ph)}</td><td class='num'>{same(ca)}</td><td>{fmt(ka)}</td><td class='num'>{same(cb)}</td><td>{fmt(kb)}</td><td class='num'>{same(aa)} / {same(ab)}</td></tr>")
w("</table>")
w(f"<p>{status('PASS')} AFTER's full load runs 3: the batched shell read (#58), the audit-permission read (#59) and the page's own read. Every AFTER page switch runs only that page's reads (1–3) and no shell reads, because the layout does not render on a client navigation. BEFORE runs 12 one-capability reads for the shell on every click, plus the page's own. The full load's {full_load_prefetches[0]} viewport prefetches (all three runs) added no tenant transaction and no auth query to the phase. Idle and hovering the audit rows ran nothing in either build.</p>")

# ---- property -----------------------------------------------------------------
w("<h2 id='property'>5 · The chosen Property across rail clicks</h2>")
w(f"<p>Start on <code>/en/today?property=</code> the second Property (Deniz Rezidans Beşiktaş), then click Finance, People and Audit log in the rail. URLs below are what the browser held after each click.</p>")
for label, steps, tag in (("AFTER", pA0, "after"), ("BEFORE", pB0, "before")):
    w(f"<div class='side'>{label}</div><table><tr><th>Step</th><th>URL after the step</th><th>Switcher shows</th><th>New document</th></tr>")
    for s in steps:
        sw = s["switcher"].split(" ", 1)[1] if " " in s["switcher"] else s["switcher"]
        w(f"<tr><td>{e(s['step'])}</td><td><code>{e(s['url'])}</code></td><td>{e(s['switcher'])}</td><td>{e(s.get('newDocument', '—'))}</td></tr>")
    w("</table><div class='grid4'>")
    for i, s in enumerate(steps):
        what = "start" if s["step"] == "start" else f"after clicking {s['step']}"
        verdict = ""
        if tag == "after":
            verdict = "Beşiktaş kept." if "Beşiktaş" in s["switcher"] else "Property changed."
        else:
            verdict = "Beşiktaş." if "Beşiktaş" in s["switcher"] else "<b>Switched to Kadıköy — the choice was lost.</b>"
        w(fig(f"img/{s['shot']}", f"<b>{label} · {e(what)}</b>Switcher: {e(s['switcher'].split(' ',1)[-1])}. {verdict}"))
    w("</div>")
w(f"<p>{status('PASS')} AFTER kept <code>?property=</code> and Beşiktaş on all three clicks. BEFORE dropped it on the first click and fell back to Kadıköy — the silent Property switch #58 fixed. (AFTER's page headings in these shots are Turkish: that is F1, not this case.)</p>")

# ---- session ------------------------------------------------------------------
w("<h2 id='session'>6 · A session ended while the workspace is open</h2>")
w(f"<p>Signed in, on Today, the harness deleted <b>this browser's</b> session row (<code>delete from public.auth_session where token = …</code>, which reported {e(sessA['deletedRows'].splitlines()[0])} row) and then clicked Finance in the rail.</p><div class='grid'>")
w(fig(f"img/{sessA['shots'][0]}", "<b>AFTER · before the click</b> Signed in on Today; the session row is deleted after this capture."))
w(fig(f"img/{sessA['shots'][1]}", f"<b>AFTER · after clicking Finance</b> Landed on <code>{e(sessA['finalUrl'])}</code> in the same document (document requests: {len(sessA['documentRequests'])}). Proves the page's own <code>requireViewer</code> caught the ended session. The heading “Oturum açın” is Turkish on an <code>/en</code> URL — F1 again."))
w(fig(f"img/{sessB['shots'][0]}", "<b>BEFORE · before the click</b> Same state."))
w(fig(f"img/{sessB['shots'][1]}", f"<b>BEFORE · after clicking Finance</b> Landed on <code>{e(sessB['finalUrl'])}</code> through full loads ({', '.join(e(d) for d in sessB['documentRequests'])}); English heading."))
w(f"</div><p>{status('PASS')} Both builds send the ended session to sign-in on the next click.</p>")

# ---- audit rows ---------------------------------------------------------------
w("<h2 id='audit'>7 · The audit log's rows do not prefetch</h2>")
w(f"<p>On the audit log, the harness waited 8 s, hovered the first 10 row links one by one, scrolled down and back, and waited 3 s more, recording every RSC request. A row link looks like <code>{e(auditA['rowHrefs'][0])}</code>.</p>")
w("<table><tr><th>Build</th><th class='num'>row links on screen</th><th class='num'>rows hovered</th><th class='num'>prefetches of a <code>record=</code> URL</th><th class='num'>other prefetches</th></tr>")
w(f"<tr><td>AFTER</td><td class='num'>{auditA['rowLinks']}</td><td class='num'>{auditA['hovered']}</td><td class='num'>{len(auditA['prefetchesOfRecords'])}</td><td class='num'>{len(auditA['prefetchesOther'])}</td></tr>")
w(f"<tr><td>BEFORE</td><td class='num'>{auditB['rowLinks']} (paged at 10)</td><td class='num'>{auditB['hovered']}</td><td class='num'>{len(auditB['prefetchesOfRecords'])}</td><td class='num'>{len(auditB['prefetchesOther'])}</td></tr></table>")
w(f"<p><b>Positive control — the counter does see prefetches.</b> The same request listener recorded {full_load_prefetches[0]} RSC prefetch requests during every AFTER full load of Today (all three transaction runs: {', '.join(map(str, full_load_prefetches))}), each carrying <code>next-router-prefetch</code> or <code>next-router-segment-prefetch</code>. So a zero on the audit rows is a real zero.</p><div class='grid'>")
w(fig(f"img/{auditA['shot']}", f"<b>AFTER · audit log, {auditA['rowLinks']} records</b> Each row is a link to its record; none was prefetched while in view, hovered or scrolled past. (The different filters and “Where” column come from #59.)"))
w(fig(f"img/{auditB['shot']}", "<b>BEFORE · audit log, 24 records paged at 10</b> Row links are plain anchors here, which never prefetch."))
w(f"</div><p>{status('PASS')} No row prefetches in AFTER. BEFORE's zero proves nothing about Links — its rows were never Links — and is shown only as the baseline.</p>")

# ---- locale -------------------------------------------------------------------
w("<h2 id='locale'>8 · F1 — which language a page speaks after a rail click</h2>")
w("<p>Open <code>/{en,ar}/today</code>, click Finance in the rail, capture; then reload the same URL and capture again. The first line of the page is the catalogue key <code>foliosAt</code>: tr “Folyolar —”, en “Folios at”, ar “الحسابات في” (<code>apps/operator-workspace/src/messages.ts</code> lines 776, 1328, 1873).</p>")
w("<table><tr><th>Build</th><th>URL</th><th>&lt;html lang&gt;</th><th>After the rail click</th><th>After a reload of the same URL</th></tr>")
for label, locs in (("AFTER", locA), ("BEFORE", locB)):
    for l in locs:
        w(f"<tr><td>{label}</td><td><code>{e(l['url'])}</code></td><td>{e(l['clicked']['lang'])}</td><td>{e(l['clicked']['heading'])}</td><td>{e(l['reloaded']['heading'])}</td></tr>")
w("</table><div class='grid'>")
for label, locs, tag in (("AFTER", locA, "after"), ("BEFORE", locB, "before")):
    for l in locs:
        wrong = tag == "after"
        w(fig(f"img/{l['clicked']['shot']}", f"<b>{label} · <code>/{l['locale']}/finance</code> after a rail click</b> Heading: “{e(l['clicked']['heading'])}”. " + ("<b>Turkish on a page whose shell is " + ("English" if l['locale'] == 'en' else "Arabic, right-to-left") + " — wrong.</b>" if wrong else "Correct language.")))
        w(fig(f"img/{l['reloaded']['shot']}", f"<b>{label} · same URL after a reload</b> Heading: “{e(l['reloaded']['heading'])}”. Correct language."))
w("</div>")
w(f"<p>{status('FAIL')} Every page reached through the rail on AFTER renders server copy in Turkish on <code>/en</code> and <code>/ar</code>; the client-rendered parts (page bar, table headers) stay in the right language, which is why the page looks half-translated. BEFORE, which reloads, is always right. Cause in code: <code>getTranslations()</code> without a locale in every page, <code>setRequestLocale</code> only in <code>app/[locale]/layout.tsx:61</code>, fallback to <code>defaultLocale</code> in <code>src/i18n/request.ts</code>. The fix is queued as its own branch (<code>fix/locale-on-soft-navigation</code>), not made here.</p>")

# ---- signed out ---------------------------------------------------------------
w("<h2 id='signedout'>9 · Signed out</h2><div class='grid'>")
w(fig(f"img/{casesA['cases']['signedOut']['shot']}", f"<b>AFTER · <code>/en/finance</code> with no session</b> Redirected to <code>{e(casesA['cases']['signedOut']['finalUrl'])}</code>, English (a full load, so F1 does not apply)."))
w(fig(f"img/{casesB['cases']['signedOut']['shot']}", f"<b>BEFORE · same request</b> Redirected to <code>{e(casesB['cases']['signedOut']['finalUrl'])}</code>."))
w(f"</div><p>{status('PASS')}</p>")

# ---- role ---------------------------------------------------------------------
w("<h2 id='role'>10 · A non-default role: front desk, one Property</h2>")
w("<p>A new account signed up through the app's own route; its first request created the Ranza user (the empty state below). The harness then granted a <code>front_desk</code> membership assigned to Kadıköy in SQL, as <code>db-seed-dev.mjs</code> grants the seed's — there is no self-service way to accept an invitation yet. Then Finance, People and Today were clicked in the rail, and the audit log was requested directly.</p>")
w("<table><tr><th>Build</th><th>rail destinations</th><th>clicks (URL · document requests · same document)</th><th>audit log requested directly</th></tr>")
for label, r in (("AFTER", roleA), ("BEFORE", roleB)):
    clicks = "<br>".join(f"{e(c['segment'])}: <code>{e(c.get('url',''))}</code> · {c.get('documentRequests')} · {c.get('sameDocument')}" for c in r["clicks"])
    rail = ", ".join(sorted({x.split('?')[0].split('/')[-1] for x in r['rail']}))
    w(f"<tr><td>{label}</td><td>{e(rail)}</td><td>{clicks}</td><td>{e(r['auditDirect']['main'][:110])}… ({r['auditDirect']['rowLinks']} row links)</td></tr>")
w("</table><div class='grid4'>")
w(fig("img/after-role-0-no-membership.png", "<b>AFTER · signed up, no membership yet</b> “You are not assigned to a Property yet” and no rail destinations."))
w(fig("img/after-role-1-today.png", "<b>AFTER · front desk on Today</b> The rail has no Audit log: the role lacks <code>audit.read</code> (#59)."))
w(fig("img/after-role-2-after-clicks.png", "<b>AFTER · 1.5 s after clicking Today</b> Still showing the loading skeleton when captured — this click was stalled by the VM. It is shown as captured, not retaken."))
w(fig("img/after-role-3-audit-direct.png", "<b>AFTER · <code>/en/audit-log</code> requested directly</b> The not-entitled empty state, no records."))
w(fig("img/before-role-0-no-membership.png", "<b>BEFORE · signed up, no membership yet</b> Same empty state."))
w(fig("img/before-role-1-today.png", "<b>BEFORE · front desk on Today</b> Audit log is in the rail (capability-gated before #59)."))
w(fig("img/before-role-2-after-clicks.png", "<b>BEFORE · after clicking Today</b> A full load each time (1 document request per click)."))
w(fig("img/before-role-3-audit-direct.png", "<b>BEFORE · <code>/en/audit-log</code> requested directly</b> Records are shown — the pre-#59 gate."))
w(f"</div><p>{status('PASS')} For the #58 question the front desk behaves as the manager does: soft navigation with the Property kept on AFTER, full loads on BEFORE. The audit-log difference is #59's, not #58's. The AFTER run was repeated once: the first attempt timed out waiting 90 s for <code>main</code> during a VM stall.</p>")

# ---- db down ------------------------------------------------------------------
w("<h2 id='dbdown'>11 · The database goes away mid-session</h2>")
w("<p>On Today, the harness stopped this lane's own database container, clicked Finance, waited 15 s and captured; then started the container, waited until it answered, navigated to People and captured again.</p><div class='grid'>")
w(fig("img/after-dbdown-1-click-while-down.png", f"<b>AFTER · Finance clicked with the database stopped</b> “{e(downA['down']['body'][:70])}” — Next's default error page replaces the whole workspace, rail included."))
w(fig("img/after-dbdown-2-after-restart.png", f"<b>AFTER · People after the restart</b> Recovered, but only through a full load ({e(', '.join(downA['up']['documentRequests']))}); the rail was gone, so there was nothing to click. Took {downA['up']['afterMs']/1000:.1f} s including a VM stall."))
w(fig("img/before-dbdown-1-click-while-down.png", f"<b>BEFORE · same click</b> “{e(downB['down']['body'][:70])}” — identical."))
w(fig("img/before-dbdown-2-after-restart.png", f"<b>BEFORE · after the restart</b> Recovered by a full load ({e(', '.join(downB['up']['documentRequests']))})."))
w(f"</div><p>{status('PRE-EXISTING GAP')} Same behaviour in both builds, so not a #58 regression — but a workspace-level <code>error.tsx</code> would keep the rail and let the next click recover, which matters more now that the shell is meant to persist.</p>")

# ---- gaps ---------------------------------------------------------------------
w("<h2 id='gaps'>Failures and gaps</h2><table><tr><th>ID</th><th>Status</th><th>What</th></tr>")
gaps = [
    ("F1", "FAIL", "Server copy turns Turkish after a rail click on <code>/en</code> and <code>/ar</code> (and on the sign-in page reached by a soft redirect). Regression from #58. Section 8."),
    ("F2", "FAIL", f"Data on screen is later on un-stalled clicks: {A['dataCalm']['median']} ms vs {B['dataCalm']['median']} ms, bounded below by React's 300 ms fallback hold once <code>loading.tsx</code> shows. Section 2."),
    ("F3", "NOT IMPROVED", f"Stalls {A['stalls']['n']}/45 vs {B['stalls']['n']}/45 on this machine; caused by the starved Docker VM, not by either build, but #58's 7.7× fewer statements did not reduce them here. Section 3."),
    ("G1", "PRE-EXISTING GAP", "No workspace error boundary: a server error on a rail click loses the whole shell. Section 11."),
    ("G2", "UNVERIFIED", "Mobile bottom dock (<code>AppBottomNav</code>): only a 1440 px viewport was used."),
    ("G3", "UNVERIFIED", "Front Office group children (arrivals, departures, reservations, rooms): the group was never expanded; no click on them was measured."),
    ("G4", "UNVERIFIED", "An Organization missing some Entitlements, a suspended Subscription, and the owner, finance and housekeeping roles."),
    ("G5", "UNVERIFIED", "<code>/tr</code>: F1 cannot show there because Turkish is the fallback; not exercised."),
    ("G6", "OBSERVATION", "AFTER is main with #56/#57/#59 as well as #58; audit-log layout, paging and the front-desk audit gate differ for that reason."),
    ("G7", "OBSERVATION", "In-page timing marks were checked against screencast frames on one un-stalled click per build and agreed to within about one frame; they were not checked on every click."),
]
for g in gaps:
    w(f"<tr><td>{g[0]}</td><td>{status(g[1])}</td><td>{g[2]}</td></tr>")
w("</table>")
w("<h3>Re-runs, all of them</h3><ul>")
w("<li>Timing: one click per build passed 15 s and was re-run once from Today (marked in the appendix).</li>")
w("<li>Cases, BEFORE: the filmstrip failed reading <code>sessionStorage</code> on a transitional document, and the locale case's reload timed out at 90 s; both were re-run (<code>rerun</code> in <code>data/cases-before.json</code>).</li>")
w(f"<li>Filmstrips: re-captured after the harness was changed to keep only frames that change; the un-stalled attempts needed are listed with each filmstrip (AFTER {len(filmA['attempts'])}, BEFORE {len(filmB['attempts'])}).</li>")
w("<li>Role case, AFTER: the first attempt timed out waiting 90 s for <code>main</code>; re-run once.</li>")
w("<li>An earlier version of the timing harness was dry-run against both builds; its runs were discarded before the three recorded runs began, and none of its numbers appear here.</li></ul>")

# ---- repro --------------------------------------------------------------------
w("<h2 id='repro'>Repro</h2><p>The harness used is copied beside this file in <code>harness/</code>. From a machine with Docker, Node 22+ and pnpm:</p><pre>")
w(e("""git worktree add ../ranza-evidence-nav        -b evidence/nav-perf origin/main   # AFTER (96427b5)
git worktree add --detach ../ranza-evidence-nav-before 498616d                    # BEFORE
# per tree: pnpm install --frozen-lockfile && pnpm --filter @ranza/db generate
docker run -d --name ranza-evidence-nav-pg        -e POSTGRES_USER=ranza -e POSTGRES_PASSWORD=ranza -e POSTGRES_DB=ranza \\
  -p 54395:5432 ranza-postgres:latest -c log_statement=all -c "log_line_prefix=%m [%p] %u@%d "
docker run -d --name ranza-evidence-nav-before-pg -e POSTGRES_USER=ranza -e POSTGRES_PASSWORD=ranza -e POSTGRES_DB=ranza \\
  -p 54396:5432 ranza-postgres:latest -c log_statement=all -c "log_line_prefix=%m [%p] %u@%d "
harness/setup-db.sh ../ranza-evidence-nav 54395 ; harness/setup-db.sh ../ranza-evidence-nav-before 54396
psql -h localhost -p 5439X -U ranza -c "alter system set log_duration = on" -c "select pg_reload_conf()"
# each tree's .env pointed at its own port; BETTER_AUTH_URL=http://localhost:3115 / 3125
pnpm turbo run build --filter=@ranza/operator-workspace            # in each tree
cd apps/operator-workspace && npx next start --port 3115           # AFTER; BEFORE on 3125
# seed through each app: scripts/db-seed-dev.mjs with DATABASE at the tree's port, WORKSPACE_URL=http://localhost:31X5
BASE=http://localhost:3115 N=24 node harness/invite.mjs              # audit history, both apps
# measurements (LABEL=after|before, BASE, PGPORT, OUT=docs/evidence/nav-perf, RUN=1..3)
node harness/harness.mjs timing ; node harness/harness.mjs tx ; node harness/harness.mjs cases
python3 harness/tx-parse.py ranza-evidence-nav-pg after data/tx-db-after.json
python3 harness/stats.py data
node harness/role-case.mjs ; CONTAINER=ranza-evidence-nav-pg node harness/db-down.mjs
python3 harness/report.py"""))
w("</pre>")

# ---- appendix -----------------------------------------------------------------
w("<h2 id='appendix'>Appendix — every timed click</h2>")
for label, s in (("AFTER", A), ("BEFORE", B)):
    w(f"<details><summary>{label}: all {len(s['rows'])} clicks</summary><table><tr><th>run</th><th>round</th><th>page</th><th>href clicked</th><th class='num'>new doc</th><th class='num'>doc req</th><th class='num'>first byte</th><th class='num'>first change</th><th class='num'>data</th><th>skeleton</th><th>note</th></tr>")
    for x in s["rows"]:
        note = f"re-run; first attempt {x['rerunOfDataMs'] if x['rerunOfDataMs'] is not None else 'did not settle'} ms" if x["rerun"] else ("stall" if x["dataMs"] > 1500 else "")
        w(f"<tr><td>{x['run']}</td><td>{x['round']}</td><td>{e(x['segment'])}</td><td><code>{e(x['href'])}</code></td><td class='num'>{'yes' if x['newDocument'] else 'no'}</td><td class='num'>{x['documentRequests']}</td><td class='num'>{x['firstByteMs']}</td><td class='num'>{x['feedbackMs']}</td><td class='num'>{x['dataMs']}</td><td>{'yes' if x['skeletonSeen'] else 'no'}</td><td>{note}</td></tr>")
    w("</table></details>")
w("<p class='note'>Raw data: <code>data/timing-*-run*.json</code> (every click), <code>data/timing-summary.json</code>, <code>data/tx-db-*.json</code> and <code>data/tx-browser-*.json</code> (transactions and requests per phase), <code>data/cases-*.json</code>, <code>data/role-*.json</code>, <code>data/dbdown-*.json</code>, <code>data/pg-slow-statements-campaign.json</code>.</p>")
w("</main></body></html>")

open(os.path.join(ROOT, "trial-record.html"), "w").write("".join(parts))
print("written", os.path.join(ROOT, "trial-record.html"))
