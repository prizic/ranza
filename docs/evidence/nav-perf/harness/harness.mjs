// Evidence harness for the page-switching fix (#58). Headless Chromium in this
// process only. Modes: timing | tx | cases.  Env: BASE, LABEL, PGPORT, OUT, RUN.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE;
const LABEL = process.env.LABEL;
const PGPORT = process.env.PGPORT;
const OUT = process.env.OUT;
const RUN = process.env.RUN ?? "1";
const MODE = process.argv[2];
const EMAIL = "deniz@example.test";
const PASSWORD = "correct-horse-battery-staple";
mkdirSync(path.join(OUT, "img"), { recursive: true });
mkdirSync(path.join(OUT, "data"), { recursive: true });

const sql = (text) =>
  execFileSync(
    "psql",
    [
      "-h",
      "localhost",
      "-p",
      PGPORT,
      "-U",
      "ranza",
      "-d",
      "ranza",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      text,
    ],
    { env: { ...process.env, PGPASSWORD: "ranza", PGCONNECT_TIMEOUT: "60" } },
  )
    .toString()
    .trim();
const load = () =>
  os
    .loadavg()
    .map((n) => n.toFixed(1))
    .join(" / ");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed in every document before any of the page's own scripts.
function instrument() {
  const now = () => performance.timeOrigin + performance.now();
  const ev = {
    docId: Math.random().toString(36).slice(2),
    fcp: null,
    readyAt: null,
    readyPaintAt: null,
    watch: null,
  };
  Object.defineProperty(window, "__ev", { value: ev });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (e.name === "first-contentful-paint" && ev.fcp === null)
          ev.fcp = performance.timeOrigin + e.startTime;
    }).observe({ type: "paint", buffered: true });
  } catch {}
  const afterPaint = (cb) =>
    requestAnimationFrame(() => requestAnimationFrame(() => cb(now())));
  const segmentOf = () => location.pathname.split("/").filter(Boolean)[1] ?? "";
  const main = () => document.querySelector("main#main-content");
  const settled = (segment) => {
    const m = main();
    if (!m || segmentOf() !== segment) return false;
    if (
      m.querySelector('[aria-busy="true"]') ||
      m.querySelector("[data-ev-old]")
    )
      return false;
    return m.children.length > 0 && m.innerText.trim().length > 0;
  };
  const check = () => {
    const w = ev.watch;
    if (w) {
      const m = main();
      if (w.feedbackAt === null && (!m || !m.querySelector("[data-ev-old]"))) {
        w.feedbackAt = now();
        w.skeletonSeen = Boolean(m && m.querySelector('[aria-busy="true"]'));
        afterPaint((t) => (w.feedbackPaintAt = t));
      }
      if (
        w.feedbackAt !== null &&
        !w.skeletonSeen &&
        m &&
        m.querySelector('[aria-busy="true"]')
      )
        w.skeletonSeen = true;
      if (w.dataAt === null && settled(w.segment)) {
        w.dataAt = now();
        afterPaint((t) => (w.dataPaintAt = t));
      }
    } else if (ev.readyAt === null && settled(segmentOf())) {
      ev.readyAt = now();
      afterPaint((t) => (ev.readyPaintAt = t));
    }
  };
  new MutationObserver(check).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-busy"],
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element) || !e.target.closest("a")) return;
      const t = now();
      sessionStorage.setItem("ev-click", String(t));
      if (ev.watch && ev.watch.clickAt === null) ev.watch.clickAt = t;
    },
    true,
  );
}

async function openContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  const log = { documents: [], rsc: [], responses: [] };
  page.on("request", (request) => {
    const headers = request.headers();
    if (
      request.resourceType() === "document" &&
      request.frame() === page.mainFrame()
    )
      log.documents.push({
        at: Date.now(),
        url: request.url().replace(BASE, ""),
      });
    if (headers.rsc === "1")
      log.rsc.push({
        at: Date.now(),
        url: request.url().replace(BASE, ""),
        prefetch:
          headers["next-router-prefetch"] === "1" ||
          "next-router-segment-prefetch" in headers,
        headers: Object.keys(headers).filter(
          (key) => key.startsWith("next-") || key === "rsc",
        ),
      });
  });
  // When each navigation's response started arriving, as the browser saw it.
  page.on("response", (response) => {
    const request = response.request();
    const headers = request.headers();
    const isDocument =
      request.resourceType() === "document" &&
      request.frame() === page.mainFrame();
    const isNavigationRsc =
      headers.rsc === "1" &&
      headers["next-router-prefetch"] !== "1" &&
      !("next-router-segment-prefetch" in headers);
    if (isDocument || isNavigationRsc)
      log.responses.push({
        at: Date.now(),
        kind: isDocument ? "document" : "rsc",
        url: request.url().replace(BASE, ""),
        status: response.status(),
      });
  });
  return { context, page, log };
}

async function signIn(page) {
  const response = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { origin: BASE },
    timeout: 120_000,
  });
  if (!response.ok()) throw new Error(`sign-in ${response.status()}`);
}

async function waitSettled(page, segment, timeout = 150_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate((segment) => {
        const ev = window.__ev;
        if (!ev || location.pathname.split("/").filter(Boolean)[1] !== segment)
          return false;
        return ev.watch
          ? Boolean(ev.watch.dataPaintAt)
          : Boolean(ev.readyPaintAt);
      }, segment);
      if (ok) return;
    } catch {}
    await pause(25);
  }
  throw new Error(`not settled on ${segment}`);
}

async function goto(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: "load", timeout: 120_000 });
  const segment = new URL(page.url()).pathname.split("/").filter(Boolean)[1];
  await waitSettled(page, segment);
}

// One rail click, measured from the click event to painted frames.
async function railClick(page, log, segment, locale = "en") {
  await page.evaluate((segment) => {
    const m = document.querySelector("main#main-content");
    for (const child of m.children) child.setAttribute("data-ev-old", "");
    sessionStorage.removeItem("ev-click");
    window.__ev.watch = {
      segment,
      clickAt: null,
      feedbackAt: null,
      feedbackPaintAt: null,
      dataAt: null,
      dataPaintAt: null,
      skeletonSeen: false,
    };
  }, segment);
  const docBefore = await page.evaluate(() => window.__ev.docId);
  const documentsBefore = log.documents.length;
  const rscBefore = log.rsc.length;
  const href = await page
    .locator(`aside a[href^="/${locale}/${segment}"]:visible`)
    .first()
    .getAttribute("href");
  const started = Date.now();
  await page
    .locator(`aside a[href^="/${locale}/${segment}"]:visible`)
    .first()
    .click({ noWaitAfter: true });
  let result = null;
  while (!result && Date.now() - started < 90_000) {
    try {
      result = await page.evaluate((segment) => {
        const ev = window.__ev;
        if (!ev || location.pathname.split("/").filter(Boolean)[1] !== segment)
          return null;
        const stored = Number(sessionStorage.getItem("ev-click")) || null;
        const nav = performance.getEntriesByType("navigation")[0];
        if (ev.watch) {
          const w = ev.watch;
          if (!w.dataPaintAt || !w.feedbackPaintAt) return null;
          return {
            docId: ev.docId,
            clickAt: w.clickAt ?? stored,
            feedbackAt: w.feedbackPaintAt,
            dataAt: w.dataPaintAt,
            skeletonSeen: w.skeletonSeen,
            navType: nav?.type,
            url: location.href,
          };
        }
        if (!ev.readyPaintAt || !ev.fcp) return null;
        return {
          docId: ev.docId,
          clickAt: stored,
          feedbackAt: ev.fcp,
          dataAt: Math.max(ev.readyPaintAt, ev.fcp),
          skeletonSeen: false,
          navType: nav?.type,
          url: location.href,
        };
      }, segment);
    } catch {
      result = null;
    }
    if (!result) await pause(25);
  }
  if (!result) return { segment, stalled: true, wallMs: Date.now() - started };
  const documents = log.documents.slice(documentsBefore);
  await pause(300);
  // Time to the first byte of this click's own navigation response.
  const response = log.responses.find(
    (r) =>
      r.at >= result.clickAt - 20 && r.url.startsWith(`/${locale}/${segment}`),
  );
  return {
    clickAt: result.clickAt,
    firstByteMs: response ? Math.round(response.at - result.clickAt) : null,
    firstByteKind: response?.kind ?? null,
    segment,
    href,
    url: result.url.replace(BASE, ""),
    newDocument: result.docId !== docBefore,
    documentRequests: documents.length,
    navigationEntryType: result.navType,
    rscRequests: log.rsc.slice(rscBefore).filter((r) => !r.prefetch).length,
    feedbackMs: Math.round(result.feedbackAt - result.clickAt),
    dataMs: Math.round(result.dataAt - result.clickAt),
    skeletonSeen: result.skeletonSeen,
    wallMs: Date.now() - started,
  };
}

const CYCLE = ["finance", "people", "audit-log", "analytics", "today"];

async function timing() {
  const browser = await chromium.launch();
  const { context, page, log } = await openContext(browser);
  await signIn(page);
  const loadStart = load();
  await goto(page, "/en/today");
  await pause(3000);
  const clicks = [];
  for (let round = 1; round <= 3; round++)
    for (const segment of CYCLE) {
      let click = await railClick(page, log, segment);
      if (click.stalled || click.dataMs > 15_000) {
        const first = click;
        // Start again from a known page, then ask the same question once more.
        await goto(page, "/en/today");
        await pause(2000);
        click = { ...(await railClick(page, log, segment)), rerunOf: first };
      }
      clicks.push({ round, ...click });
      await pause(1500);
    }
  await context.close();
  await browser.close();
  const record = {
    label: LABEL,
    base: BASE,
    run: RUN,
    at: new Date().toISOString(),
    loadAtStart: loadStart,
    loadAtEnd: load(),
    clicks,
  };
  writeFileSync(
    path.join(OUT, "data", `timing-${LABEL}-run${RUN}.json`),
    JSON.stringify(record, null, 2),
  );
  console.log(
    JSON.stringify({
      label: LABEL,
      run: RUN,
      load: loadStart,
      clicks: clicks.map(
        (c) =>
          `${c.segment}:${c.newDocument ? "DOC" : "soft"}:${c.feedbackMs}/${c.dataMs}${c.rerunOf ? "(rerun)" : ""}`,
      ),
    }),
  );
}

// Phase boundaries are written into the Postgres log itself, so phases are cut
// by log order rather than by comparing two machines' clocks.
const mark = (name) => sql(`select 'EVMARK ${LABEL} run${RUN} ${name}'`);

async function hoverRows(page) {
  const rows = page.locator('main a[href*="record="]');
  const count = await rows.count();
  for (let i = 0; i < Math.min(count, 10); i++) {
    await rows.nth(i).hover();
    await pause(300);
  }
  await page.mouse.wheel(0, 2000);
  await pause(1000);
  await page.mouse.wheel(0, -2000);
  return count;
}

async function tx() {
  const browser = await chromium.launch();
  const { context, page, log } = await openContext(browser);
  await signIn(page);
  await pause(2000);
  const phases = [];
  const phase = async (name, act) => {
    const rscBefore = log.rsc.length;
    const documentsBefore = log.documents.length;
    const detail = await act();
    await pause(2500);
    mark(name);
    phases.push({
      name,
      detail,
      documentRequests: log.documents.length - documentsBefore,
      rscNavigations: log.rsc
        .slice(rscBefore)
        .filter((r) => !r.prefetch)
        .map((r) => r.url),
      rscPrefetches: log.rsc
        .slice(rscBefore)
        .filter((r) => r.prefetch)
        .map((r) => r.url),
    });
  };
  mark("start");
  await phase("full-load:today", () => goto(page, "/en/today"));
  await phase("idle-8s:today", () => pause(8000));
  for (const segment of ["finance", "people", "audit-log"])
    await phase(`click:${segment}`, () => railClick(page, log, segment));
  await phase("idle-8s+hover-rows:audit-log", async () => {
    await pause(4000);
    return { rowLinks: await hoverRows(page) };
  });
  await phase("click:today", () => railClick(page, log, "today"));
  await context.close();
  await browser.close();
  const record = {
    label: LABEL,
    run: RUN,
    at: new Date().toISOString(),
    load: load(),
    phases,
  };
  writeFileSync(
    path.join(OUT, "data", `tx-browser-${LABEL}-run${RUN}.json`),
    JSON.stringify(record, null, 2),
  );
  console.log(
    JSON.stringify({
      label: LABEL,
      run: RUN,
      phases: phases.map(
        (p) =>
          `${p.name}: doc=${p.documentRequests} rsc=${p.rscNavigations.length} prefetch=${p.rscPrefetches.length}`,
      ),
    }),
  );
}

async function shot(page, name) {
  const file = path.join(OUT, "img", `${LABEL}-${name}.png`);
  await page.screenshot({ path: file });
  return path.basename(file);
}

async function cases() {
  const properties = sql(
    "select id || '|' || name from properties order by name",
  )
    .split("\n")
    .map((l) => l.split("|"));
  const [second] = properties.slice(1);
  const browser = await chromium.launch();
  const out = {
    label: LABEL,
    at: new Date().toISOString(),
    load: load(),
    properties,
    cases: {},
    errors: {},
  };
  // Each case stands alone: one that fails is recorded, never allowed to hide the rest.
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  const run = async (name, body) => {
    if (only && !only.includes(name)) return;
    try {
      await body();
    } catch (error) {
      out.errors[name] = String(error).slice(0, 400);
      console.error(`case ${name} failed: ${error}`);
    }
  };

  // 1. The Property the viewer chose, across rail clicks.
  await run("property", async () => {
    const { context, page, log } = await openContext(browser);
    await signIn(page);
    await goto(page, `/en/today?property=${second[0]}`);
    const steps = [
      {
        step: "start",
        url: page.url().replace(BASE, ""),
        switcher: await switcherText(page),
        shot: await shot(page, "property-0-start"),
      },
    ];
    for (const [i, segment] of ["finance", "people", "audit-log"].entries()) {
      const click = await railClick(page, log, segment);
      await pause(800);
      steps.push({
        step: segment,
        ...click,
        switcher: await switcherText(page),
        mainHead: (await page.locator("main").first().innerText()).split(
          "\n",
        )[0],
        shot: await shot(page, `property-${i + 1}-${segment}`),
      });
    }
    out.cases.property = { chosen: second, steps };
    await context.close();
  });

  // 2. A session ended while the workspace is open.
  await run("session", async () => {
    const { context, page, log } = await openContext(browser);
    await signIn(page);
    await goto(page, "/en/today");
    const before = await shot(page, "session-0-open");
    const cookie = (await context.cookies()).find((c) =>
      c.name.endsWith("session_token"),
    );
    const token = decodeURIComponent(cookie.value).split(".")[0];
    const deleted = sql(
      `delete from public.auth_session where token = '${token}' returning 1`,
    );
    const docBefore = await page.evaluate(() => window.__ev.docId);
    const documentsBefore = log.documents.length;
    await page
      .locator('aside a[href^="/en/finance"]:visible')
      .first()
      .click({ noWaitAfter: true });
    await page.waitForURL(/\/en\/sign-in/, { timeout: 90_000 });
    await page.waitForLoadState("load");
    await pause(1500);
    const docAfter = await page
      .evaluate(() => window.__ev.docId)
      .catch(() => null);
    out.cases.session = {
      deletedRows: deleted,
      finalUrl: page.url().replace(BASE, ""),
      newDocument: docAfter !== docBefore,
      documentRequests: log.documents.slice(documentsBefore).map((d) => d.url),
      shots: [before, await shot(page, "session-1-after-click")],
    };
    await context.close();
  });

  // 3. Signed out entirely.
  await run("signedOut", async () => {
    const { context, page } = await openContext(browser);
    await page.goto(`${BASE}/en/finance`, { waitUntil: "load" });
    out.cases.signedOut = {
      requested: "/en/finance",
      finalUrl: page.url().replace(BASE, ""),
      shot: await shot(page, "signed-out"),
    };
    await context.close();
  });

  // 4. The audit log's row links, left open, hovered and scrolled.
  await run("auditRows", async () => {
    const { context, page, log } = await openContext(browser);
    await signIn(page);
    await goto(page, "/en/today");
    await pause(1000);
    const rscBefore = log.rsc.length;
    await railClick(page, log, "audit-log");
    const shotRows = await shot(page, "audit-rows");
    const rowLinks = await page.locator('main a[href*="record="]').count();
    const rowHrefs = await page
      .locator('main a[href*="record="]')
      .evaluateAll((as) => as.slice(0, 3).map((a) => a.getAttribute("href")));
    await pause(8000);
    const hovered = await hoverRows(page);
    await pause(3000);
    const after = log.rsc.slice(rscBefore);
    out.cases.auditRows = {
      rowLinks,
      rowHrefs,
      hovered: Math.min(hovered, 10),
      prefetchesOfRecords: after
        .filter((r) => r.prefetch && r.url.includes("record="))
        .map((r) => r.url),
      prefetchesOther: after
        .filter((r) => r.prefetch && !r.url.includes("record="))
        .map((r) => r.url),
      allRscAfterArriving: after.map(
        (r) =>
          `${r.prefetch ? "prefetch" : "navigation"} ${r.url} [${r.headers.join(",")}]`,
      ),
      shot: shotRows,
    };
    await context.close();
  });

  // 5. A painted filmstrip of one click, and the same click on a slow network.
  await run("filmstrip", async () => {
    const { context, page, log } = await openContext(browser);
    await signIn(page);
    await goto(page, "/en/today");
    await pause(4000);
    // A stalled click (starved Docker VM) says nothing about the app, so the
    // calm filmstrip is retried; every attempt is recorded, not just the kept one.
    const attempts = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      const film = await filmstrip(
        page,
        log,
        attempt % 2 ? "finance" : "people",
        "film-normal",
      );
      attempts.push({
        attempt,
        segment: film.segment,
        dataMs: film.click.dataMs,
        feedbackMs: film.click.feedbackMs,
      });
      out.cases.filmstrip = { ...film, attempts };
      if (film.click.dataMs <= 1500) break;
      await goto(page, "/en/today");
      await pause(4000);
    }
    await goto(page, "/en/today");
    await pause(4000);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 2500,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    out.cases.slowNetwork = {
      addedLatencyMs: 2500,
      ...(await filmstrip(page, log, "people", "film-slow")),
    };
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await context.close();
  });

  // 6. Which language a page speaks after a rail click, against a reload of the same URL.
  await run("locale", async () => {
    out.cases.locale = [];
    for (const locale of ["en", "ar"]) {
      const { context, page, log } = await openContext(browser);
      await signIn(page);
      await goto(page, `/${locale}/today`);
      await pause(1500);
      const click = await railClick(page, log, "finance", locale);
      await pause(800);
      const clicked = {
        heading: (await page.locator("main p").first().innerText()).trim(),
        lang: await page.getAttribute("html", "lang"),
        dir: await page.getAttribute("html", "dir"),
        shot: await shot(page, `locale-${locale}-1-after-click`),
      };
      await page.reload({ waitUntil: "load" });
      await waitSettled(page, "finance");
      await pause(800);
      const reloaded = {
        heading: (await page.locator("main p").first().innerText()).trim(),
        lang: await page.getAttribute("html", "lang"),
        dir: await page.getAttribute("html", "dir"),
        shot: await shot(page, `locale-${locale}-2-after-reload`),
      };
      out.cases.locale.push({
        locale,
        url: page.url().replace(BASE, ""),
        newDocument: click.newDocument,
        clicked,
        reloaded,
      });
      await context.close();
    }
  });

  await browser.close();
  const file = path.join(OUT, "data", `cases-${LABEL}.json`);
  if (only && existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, "utf8"));
    for (const key of Object.keys(previous.errors ?? {}))
      if (!only.includes(key)) out.errors[key] = previous.errors[key];
    out.cases = { ...previous.cases, ...out.cases };
    out.rerun = [
      ...(previous.rerun ?? []),
      { at: out.at, cases: only, load: out.load },
    ];
  }
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1).slice(0, 4000));
}

async function switcherText(page) {
  return (await page.locator("header").first().innerText())
    .replace(/\s+/g, " ")
    .trim();
}

// Chrome's own screencast: a frame each time the page repaints, timestamped.
// Only the frames that decide the question are kept: the last before the
// click, the first after it, the first after the data painted, and a few
// fixed marks in between.
async function filmstrip(page, log, segment, name) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    frames.push({ at: metadata.timestamp * 1000, data });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
    maxWidth: 1440,
    maxHeight: 1000,
    everyNthFrame: 1,
  });
  await pause(800);
  const click = await railClick(page, log, segment);
  await pause(1200);
  await cdp.send("Page.stopScreencast").catch(() => {});
  const clickAt = click.clickAt;
  const dataAt = clickAt + click.dataMs;
  const before = frames.filter((f) => f.at <= clickAt).pop();
  const after = frames.filter((f) => f.at > clickAt);
  const firstAtOrAfter = (t) => after.find((f) => f.at >= t);
  const picks = [
    ["last frame before the click", before],
    ["first frame after the click", after[0]],
    ["frame at +100 ms", firstAtOrAfter(clickAt + 100)],
    ["frame at +250 ms", firstAtOrAfter(clickAt + 250)],
    ["first frame after the data painted", firstAtOrAfter(dataAt)],
  ];
  const kept = [];
  const seen = new Set();
  for (const [i, [why, frame]] of picks.entries()) {
    if (!frame || seen.has(frame)) continue;
    seen.add(frame);
    const file = `${LABEL}-${name}-${i}.jpg`;
    writeFileSync(
      path.join(OUT, "img", file),
      Buffer.from(frame.data, "base64"),
    );
    kept.push({ file, why, msAfterClick: Math.round(frame.at - clickAt) });
  }
  // Every frame from the click to 600 ms after the in-page data mark is listed
  // (offset and size) in the record; a frame is saved when its size moved by
  // more than 2% from the last one saved — a visible change, not the skeleton's
  // pulse — so a reader can find the first frame that shows the page itself.
  const windowDir = `frames-${LABEL}-${name}`;
  rmSync(path.join(OUT, "img", windowDir), { recursive: true, force: true });
  mkdirSync(path.join(OUT, "img", windowDir), { recursive: true });
  const sequence = frames
    .filter((f) => f.at >= clickAt - 50 && f.at <= dataAt + 600)
    .map((f) => ({
      ...f,
      offset: Math.round(f.at - clickAt),
      bytes: Buffer.byteLength(f.data, "base64"),
    }));
  const saved = [];
  let lastBytes = null;
  for (const [i, frame] of sequence.entries()) {
    const changed =
      lastBytes === null ||
      Math.abs(frame.bytes - lastBytes) / lastBytes > 0.02;
    if (!changed && i !== sequence.length - 1) continue;
    lastBytes = frame.bytes;
    const file = `${frame.offset >= 0 ? "+" : "-"}${String(Math.abs(frame.offset)).padStart(5, "0")}ms.jpg`;
    writeFileSync(
      path.join(OUT, "img", windowDir, file),
      Buffer.from(frame.data, "base64"),
    );
    saved.push(file);
  }
  return {
    segment,
    click,
    frames: kept,
    totalFrames: frames.length,
    sequence: {
      dir: windowDir,
      all: sequence.map((f) => `${f.offset}:${f.bytes}`),
      saved,
    },
  };
}

if (MODE === "timing") await timing();
else if (MODE === "tx") await tx();
else if (MODE === "cases") await cases();
else throw new Error(`unknown mode ${MODE}`);
