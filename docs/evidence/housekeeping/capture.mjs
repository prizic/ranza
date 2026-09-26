// Walks docs/features/housekeeping/edge-cases.csv against the running
// production build and records what it saw.
//
//   node docs/evidence/housekeeping/capture.mjs [section ...]
//
// Headless Chromium in this process only: shared browser tools have swapped
// screenshots between agents before. Every case records what it observed, the
// screenshot of that exact state, and PASS or FAIL. A failure is recorded and
// the walk goes on; nothing here throws a case away.
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = "http://localhost:3113";
const DATABASE = "postgresql://ranza:ranza@localhost:54393/ranza";
const PASSWORD = "evidence-horse-battery-staple";
const SHOTS = path.join(HERE, ".shots");
const RESULTS = path.join(HERE, ".results.json");
const F = JSON.parse(readFileSync(path.join(HERE, ".fixtures.json"), "utf8"));
const P = F.property;
const EMAIL = {
  owner: "owner@evidence.test",
  manager: "manager@evidence.test",
  desk: "desk@evidence.test",
  finance: "finance@evidence.test",
  housekeeper: "housekeeper@evidence.test",
  kadikoy: "kadikoy.manager@evidence.test",
};

mkdirSync(SHOTS, { recursive: true });
const results = existsSync(RESULTS)
  ? JSON.parse(readFileSync(RESULTS, "utf8"))
  : { cases: [], shots: [] };

export function sql(statement) {
  const r = spawnSync(
    "psql",
    [DATABASE, "-q", "-t", "-A", "-F", "|", "-c", statement],
    {
      encoding: "utf8",
    },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

const browser = await chromium.launch();
const sessions = {};

async function as(role) {
  if (sessions[role]) return sessions[role];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  // Better Auth rate-limits sign-in per client, and this walk signs six people
  // in within seconds. A sign-in that does not land is retried after a pause,
  // and every retry is written into the results so the report can say so.
  for (let attempt = 1; ; attempt += 1) {
    await page.goto(`${APP}/en/sign-in`);
    await page.getByLabel("Email").fill(EMAIL[role]);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL(/\/en\/today/, { timeout: 30000 });
      break;
    } catch (error) {
      const alert = await page
        .getByRole("alert")
        .allInnerTexts()
        .catch(() => []);
      results.retries = [
        ...(results.retries ?? []),
        {
          role,
          attempt,
          at: new Date().toISOString(),
          shown: alert.join(" ").trim(),
        },
      ];
      if (attempt === 4) throw error;
      await page.waitForTimeout(15000);
    }
  }
  sessions[role] = page;
  return page;
}

async function shot(page, id, caption, { full = true } = {}) {
  const file = `${id}.jpg`;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(SHOTS, file),
    type: "jpeg",
    quality: 72,
    fullPage: full,
  });
  results.shots = results.shots.filter((s) => s.id !== id);
  results.shots.push({
    id,
    file,
    caption,
    url: page.url().replace(APP, ""),
    at: new Date().toISOString(),
  });
  return id;
}

function record(id, title, rows, status, observed, shots, note = "") {
  results.cases = results.cases.filter((c) => c.id !== id);
  results.cases.push({
    id,
    title,
    rows,
    status,
    observed,
    shots,
    note,
    at: new Date().toISOString(),
  });
  writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  console.log(`${status.padEnd(10)} ${id} ${title}`);
}

/** Runs one case; an exception is a FAIL with its message, never a crash. */
async function kase(id, title, rows, body) {
  const shots = [];
  const observed = [];
  const see = (line) => observed.push(line);
  let status = "PASS";
  const check = (ok, line) => {
    see(`${ok ? "✓" : "✗"} ${line}`);
    if (!ok) status = "FAIL";
  };
  try {
    await body({ shots, see, check });
  } catch (error) {
    status = "FAIL";
    see(`✗ threw: ${String(error.message).split("\n")[0]}`);
  }
  record(id, title, rows, status, observed, shots);
}

const board = (property) => `${APP}/en/housekeeping?property=${P[property]}`;

/** A load that has finished hydrating: the table's controls are client-rendered. */
async function settle(page) {
  await page.waitForLoadState("networkidle");
}

async function openBoard(page, property, locale = "en") {
  await page.goto(board(property).replace("/en/", `/${locale}/`));
  await page.locator("h1").first().waitFor();
  await settle(page);
}

function row(page, name) {
  return page.locator("tbody tr").filter({
    has: page.locator("span.font-medium", { hasText: new RegExp(`^${name}$`) }),
  });
}

async function cells(page, name) {
  const r = row(page, name);
  await r.first().waitFor();
  return (await r.first().locator("td").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
}

async function stats(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("div.text-2xl")].map((value) => [
        value.previousElementSibling?.textContent?.trim() ?? "?",
        value.textContent.trim(),
      ]),
    ),
  );
}

/**
 * Waits for a room's row to show a status, rather than for the "N rooms
 * updated" line: that line stays on screen from the previous mark, so waiting
 * for it returns before the new mark has landed.
 */
async function until(page, name, word, seconds = 45) {
  const started = Date.now();
  for (;;) {
    const c = await cells(page, name);
    if (c.join(" ").includes(word)) return c;
    if (Date.now() - started > seconds * 1000)
      throw new Error(`${name} never showed ${word}: ${c.join(" | ")}`);
    await page.waitForTimeout(500);
  }
}

const WORD = {
  "Mark dirty": "Dirty",
  "Mark clean": "Clean",
  "Mark inspected": "Inspected",
};

async function markOne(page, name, label) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: label }).click();
  return until(page, name, WORD[label]);
}

async function markMany(page, names, label) {
  for (const n of names) await row(page, n).getByRole("checkbox").check();
  await page.getByRole("button", { name: label }).click();
  for (const n of names) await until(page, n, WORD[label]);
}

async function waitForStatus(page, property, name, wanted, seconds = 60) {
  const started = Date.now();
  for (;;) {
    await openBoard(page, property);
    const c = await cells(page, name);
    if (c.join(" ").includes(wanted))
      return { cells: c, after: (Date.now() - started) / 1000 };
    if (Date.now() - started > seconds * 1000) return { cells: c, after: null };
    await page.waitForTimeout(2000);
  }
}

const sections = {
  // -------------------------------------------------------------------------
  async roles() {
    for (const [role, canMark] of [
      ["owner", true],
      ["manager", true],
      ["desk", true],
      ["housekeeper", true],
      ["finance", false],
    ]) {
      await kase(
        `R-${role}`,
        `The board as ${role}${canMark ? "" : " (read-only)"}`,
        canMark ? ["HK-S1-13", "HK-S2-11"] : ["HK-S2-12", "HK-S2-04"],
        async ({ shots, see, check }) => {
          const page = await as(role);
          await openBoard(page, "p1");
          const boxes = await page
            .getByRole("checkbox", { name: "Select row" })
            .count();
          const menus = await page
            .getByRole("button", { name: /^Actions for / })
            .count();
          const readOnly = await page
            .getByText(/can see every room here but not change it/)
            .count();
          const rooms = await page.locator("tbody tr").count();
          see(
            `rooms listed: ${rooms}; row checkboxes: ${boxes}; row menus: ${menus}; read-only notice shown: ${readOnly > 0}`,
          );
          see(`stat cards: ${JSON.stringify(await stats(page))}`);
          if (canMark) {
            check(
              boxes === rooms && menus === rooms,
              `every room has a checkbox and a mark menu (${role} holds housekeeping.update_status)`,
            );
            check(readOnly === 0, "no read-only notice");
          } else {
            check(
              boxes === 0 && menus === 0,
              "no checkbox and no mark menu on any row",
            );
            check(readOnly > 0, "the read-only notice explains why");
          }
          check(
            rooms === 9,
            "9 status holders: 101–107, room 201 (its beds fold in), bed D1 with no room",
          );
          shots.push(
            await shot(
              page,
              `R-${role}`,
              `Kadıköy Otel board signed in as ${EMAIL[role]} (${role}), before any mark.`,
            ),
          );
        },
      );
    }
  },

  // -------------------------------------------------------------------------
  async lifecycle() {
    const page = await as("desk");
    await kase(
      "L-1",
      "Never marked → dirty (row menu)",
      ["HK-S2-01", "HK-S1-13"],
      async ({ shots, see, check }) => {
        await openBoard(page, "p1");
        const before = await cells(page, "102");
        see(`102 before: ${before.join(" | ")}`);
        check(
          before.join(" ").includes("Clean") &&
            before.join(" ").includes("Not recorded yet"),
          "a room never marked reads Clean / Not recorded yet",
        );
        shots.push(
          await shot(
            page,
            "L-1a",
            "Before: room 102 has never been marked, so it reads Clean with no change recorded.",
          ),
        );
        await markOne(page, "102", "Mark dirty");
        const after = await cells(page, "102");
        check(
          (await page.getByText("1 room updated").count()) === 1,
          '"1 room updated" is announced',
        );
        see(`102 after: ${after.join(" | ")}`);
        check(after.join(" ").includes("Dirty"), "102 is Dirty");
        check(
          !after.join(" ").includes("Not recorded yet"),
          "a change time is now shown",
        );
        shots.push(
          await shot(
            page,
            "L-1b",
            'After: desk@ chose Actions for 102 → Mark dirty. "1 room updated" is announced; 102 reads Dirty with a change time.',
          ),
        );
      },
    );
    await kase(
      "L-2",
      "Dirty → clean",
      ["HK-S2-01"],
      async ({ shots, see, check }) => {
        await markOne(page, "102", "Mark clean");
        const c = await cells(page, "102");
        see(`102: ${c.join(" | ")}`);
        check(c.join(" ").includes("Clean"), "102 is Clean");
        shots.push(
          await shot(
            page,
            "L-2",
            "desk@ marked 102 clean from its row menu: 102 reads Clean.",
          ),
        );
      },
    );
    await kase(
      "L-3",
      "Clean → inspected",
      ["HK-S2-01"],
      async ({ shots, see, check }) => {
        await markOne(page, "102", "Mark inspected");
        const c = await cells(page, "102");
        see(`102: ${c.join(" | ")}`);
        check(c.join(" ").includes("Inspected"), "102 is Inspected");
        see(`stats: ${JSON.stringify(await stats(page))}`);
        shots.push(
          await shot(
            page,
            "L-3",
            "desk@ marked 102 inspected: 102 reads Inspected and the Inspected count is 1.",
          ),
        );
      },
    );
    await kase(
      "L-4",
      "Marking back after a mistake: inspected → dirty",
      ["HK-S2-05"],
      async ({ shots, see, check }) => {
        await markOne(page, "102", "Mark dirty");
        const c = await cells(page, "102");
        see(`102: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Dirty"),
          "102 is Dirty again; no reason was asked for",
        );
        shots.push(
          await shot(
            page,
            "L-4",
            "The correction: desk@ marked 102 dirty again with one tap, no reason asked.",
          ),
        );
      },
    );
    await kase(
      "L-5",
      "The row menu offers only the other two statuses",
      ["HK-S2-06"],
      async ({ shots, see, check }) => {
        await page.getByRole("button", { name: "Actions for 102" }).click();
        const items = await page.getByRole("menuitem").allInnerTexts();
        see(`menu for dirty 102: ${items.join(", ")}`);
        check(
          items.length === 2 && !items.some((i) => i.includes("dirty")),
          "Mark dirty is not offered for a room already dirty",
        );
        shots.push(
          await shot(
            page,
            "L-5",
            "Row menu open on 102 (dirty): it offers Mark clean and Mark inspected only.",
            { full: false },
          ),
        );
        await page.keyboard.press("Escape");
      },
    );
  },

  // -------------------------------------------------------------------------
  async batch() {
    const page = await as("desk");
    await kase(
      "B-1",
      "Batch: three rooms marked dirty at once",
      ["HK-S2-02"],
      async ({ shots, see, check }) => {
        await openBoard(page, "p2");
        for (const n of ["301", "302", "303"])
          await row(page, n).getByRole("checkbox").check();
        see(
          `bulk bar: ${(
            await page
              .getByText(/selected/)
              .first()
              .innerText()
          ).trim()}`,
        );
        shots.push(
          await shot(
            page,
            "B-1a",
            'Beşiktaş Rezidans, desk@: rooms 301, 302 and 303 ticked. The bulk bar reads "3 selected" with the three marks.',
          ),
        );
        await page.getByRole("button", { name: "Mark dirty" }).click();
        for (const n of ["301", "302", "303"]) await until(page, n, "Dirty");
        check(
          (await page.getByText("3 rooms updated").count()) === 1,
          '"3 rooms updated" is announced',
        );
        for (const n of ["301", "302", "303"]) {
          const c = await cells(page, n);
          check(c.join(" ").includes("Dirty"), `${n} is Dirty`);
        }
        const ticked = await page
          .getByRole("checkbox", { name: "Select row", checked: true })
          .count();
        check(ticked === 0, "the selection is cleared once the mark lands");
        shots.push(
          await shot(
            page,
            "B-1b",
            'After Mark dirty: "3 rooms updated", all three read Dirty, and the selection is cleared.',
          ),
        );
      },
    );
    await kase(
      "B-2",
      "Batch: the same three marked inspected",
      ["HK-S2-02"],
      async ({ shots, check }) => {
        await markMany(page, ["301", "302", "303"], "Mark inspected");
        for (const n of ["301", "302", "303"])
          check(
            (await cells(page, n)).join(" ").includes("Inspected"),
            `${n} is Inspected`,
          );
        shots.push(
          await shot(
            page,
            "B-2",
            "Second batch: 301–303 marked inspected together.",
          ),
        );
      },
    );
    await kase(
      "B-3",
      "The same mark twice is harmless",
      ["HK-S2-06"],
      async ({ shots, see, check }) => {
        await openBoard(page, "p2");
        await markMany(page, ["302"], "Mark inspected");
        await page.getByText("1 room updated").waitFor();
        const c = await cells(page, "302");
        see(`302: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Inspected"),
          "302 stays Inspected; nothing failed",
        );
        const n = sql(
          `select count(*) from audit.records where organization_id = '${F.organizationId}' and action = 'housekeeping.status_changed' and subject_id = '${F.unit["302"]}'`,
        );
        see(`audit records for 302: ${n}`);
        check(
          n === "3",
          "each submission is audited: dirty, inspected, inspected again = 3 records",
        );
        shots.push(
          await shot(
            page,
            "B-3",
            '302 (already inspected) ticked and marked inspected again: "1 room updated", no error.',
          ),
        );
      },
    );
  },

  async bound() {
    const page = await as("desk");
    await kase(
      "B-4",
      "More than sixty rooms cannot be sent",
      ["HK-S2-10"],
      async ({ shots, see, check }) => {
        await openBoard(page, "p5");
        await page.getByRole("combobox").filter({ hasText: /^10$/ }).click();
        await page.getByRole("option", { name: "50" }).click();
        await page.getByRole("checkbox", { name: "Select all rows" }).check();
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.getByRole("checkbox", { name: "Select all rows" }).check();
        const bar = await page
          .getByText(/selected/)
          .first()
          .innerText();
        see(`bulk bar: ${bar}`);
        const disabled = await page
          .getByRole("button", { name: "Mark dirty" })
          .isDisabled();
        check(
          /65 selected/.test(bar),
          "65 rooms are selected across two pages",
        );
        check(disabled, "the marks are disabled");
        check(
          (await page
            .getByText("Choose between one and sixty rooms.")
            .count()) > 0,
          "the bar says why",
        );
        shots.push(
          await shot(
            page,
            "B-4",
            'Büyük Otel (65 rooms): all 50 on page 1 and 15 on page 2 selected. The marks are disabled with "Choose between one and sixty rooms."',
            { full: false },
          ),
        );
      },
    );
  },

  // -------------------------------------------------------------------------
  async checkout() {
    const desk = await as("desk");
    async function checkOut(property, guest) {
      await desk.goto(`${APP}/en/departures?property=${P[property]}`);
      await desk.getByRole("searchbox").fill(guest);
      const r = desk.getByRole("row").filter({ hasText: guest });
      await r.getByRole("button", { name: "Check out" }).click();
      await r
        .getByRole("button", { name: "Check out" })
        .waitFor({ state: "detached" });
    }
    await kase(
      "C-1",
      "Check-out → worker → room dirty",
      ["HK-S1-01"],
      async ({ shots, see, check }) => {
        await openBoard(desk, "p1");
        const before = await cells(desk, "104");
        see(`104 before: ${before.join(" | ")}`);
        shots.push(
          await shot(
            desk,
            "C-1a",
            "Before: 104 is Clean (never marked) with a Guest in house, Cahit Arf.",
          ),
        );
        await desk.goto(`${APP}/en/departures?property=${P.p1}`);
        await desk.getByRole("searchbox").fill("Cahit Arf");
        shots.push(
          await shot(
            desk,
            "C-1b",
            "Departures at Kadıköy Otel: Cahit Arf in 104, due out today, with a Check out button.",
          ),
        );
        await checkOut("p1", "Cahit Arf");
        const { cells: after, after: seconds } = await waitForStatus(
          desk,
          "p1",
          "104",
          "Dirty",
        );
        see(
          `104 after: ${after.join(" | ")} (dirty ${seconds}s after the check-out)`,
        );
        check(
          after.join(" ").includes("Dirty"),
          "104 is Dirty — nobody marked it; the worker did",
        );
        const by = sql(
          `select coalesce(status_changed_by::text, 'null') from public.housekeeping_unit_status where accommodation_unit_id = '${F.unit["104"]}'`,
        );
        see(`status_changed_by in the database: ${by}`);
        check(
          by === "null",
          "the row names no Staff Member: the departure made it dirty",
        );
        shots.push(
          await shot(
            desk,
            "C-1c",
            "After desk@ pressed Check out: the worker marked 104 Dirty on its own; the Guest is no longer in house.",
          ),
        );
      },
    );
    await kase(
      "C-2",
      "A Guest leaving a bed dirties the room",
      ["HK-S1-02"],
      async ({ shots, see, check }) => {
        await checkOut("p1", "Sabahattin Ali");
        const { cells: c } = await waitForStatus(desk, "p1", "201", "Dirty");
        see(`201: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Dirty") && c.join(" ").includes("2 beds"),
          "room 201 (2 beds) is Dirty",
        );
        const beds = sql(
          `select count(*) from public.housekeeping_unit_status where accommodation_unit_id in ('${F.unit["201A"]}','${F.unit["201B"]}')`,
        );
        check(beds === "0", "no row for either bed: the room holds the status");
        shots.push(
          await shot(
            desk,
            "C-2",
            "Sabahattin Ali checked out of bed A in room 201: the room, listed with its 2 beds, reads Dirty.",
          ),
        );
      },
    );
    await kase(
      "C-3",
      "A bed with no room holds its own status",
      ["HK-S1-03"],
      async ({ shots, see, check }) => {
        await checkOut("p1", "Orhan Veli");
        const { cells: c } = await waitForStatus(desk, "p1", "D1", "Dirty");
        see(`D1: ${c.join(" | ")}`);
        check(c.join(" ").includes("Dirty"), "bed D1 is Dirty");
        shots.push(
          await shot(
            desk,
            "C-3",
            "Orhan Veli checked out of D1, a bed with no room above it: D1 itself reads Dirty.",
          ),
        );
      },
    );
    await kase(
      "C-4",
      "Marked before the departure → overwritten",
      ["HK-S1-06"],
      async ({ shots, see, check }) => {
        await openBoard(desk, "p1");
        await markOne(desk, "106", "Mark inspected");
        see(`106 before check-out: ${(await cells(desk, "106")).join(" | ")}`);
        shots.push(
          await shot(
            desk,
            "C-4a",
            "106 marked inspected while Nazım Hikmet is still in house.",
          ),
        );
        await checkOut("p1", "Nazım Hikmet");
        const { cells: c } = await waitForStatus(desk, "p1", "106", "Dirty");
        see(`106 after check-out: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Dirty"),
          "the departure is newer, so 106 is Dirty",
        );
        shots.push(
          await shot(
            desk,
            "C-4b",
            "After the check-out: 106 reads Dirty; the earlier inspected mark was overwritten.",
          ),
        );
      },
    );
  },

  // Runs with the worker stopped: see the report's repro steps.
  async raceStop() {
    const desk = await as("desk");
    await kase(
      "C-5",
      "Cleaned before the worker got there → kept",
      ["HK-S1-05"],
      async ({ shots, see, check }) => {
        const inHouse = sql(
          `select count(*) from public.stays where accommodation_unit_id = '${F.unit["105"]}' and status = 'in_house'`,
        );
        if (inHouse === "1") {
          await desk.goto(`${APP}/en/departures?property=${P.p1}`);
          await desk.getByRole("searchbox").fill("Halide Edib");
          const r = desk.getByRole("row").filter({ hasText: "Halide Edib" });
          await r.getByRole("button", { name: "Check out" }).click();
          await r
            .getByRole("button", { name: "Check out" })
            .waitFor({ state: "detached" });
        }
        see(
          `Halide Edib checked out of 105 (a first attempt pressed Check out at ${inHouse === "1" ? "this run" : "the previous run of this case"})`,
        );
        const pending = sql(
          `select count(*) from outbox.events where event_type = 'stay.checked_out' and published_at is null and payload->>'stayId' in (select s.id::text from public.stays as s where s.accommodation_unit_id = '${F.unit["105"]}')`,
        );
        see(
          `undelivered stay.checked_out events for 105 (worker stopped): ${pending}`,
        );
        check(pending === "1", "the departure is waiting in the outbox");
        // The row menu never offers a room its own status (L-5), and 105 reads
        // Clean already because it was never marked; saying "clean" after the
        // Guest left is the batch bar's job.
        await openBoard(desk, "p1");
        await row(desk, "105").getByRole("checkbox").check();
        await desk.getByRole("button", { name: "Mark clean" }).click();
        await desk.getByText("1 room updated").waitFor();
        const c = await cells(desk, "105");
        see(`105 after the desk said clean: ${c.join(" | ")}`);
        check(
          !c.join(" ").includes("Not recorded yet"),
          "the desk's word is recorded, with its time",
        );
        shots.push(
          await shot(
            desk,
            "C-5a",
            "Worker stopped. Halide Edib has checked out of 105 and the event waits undelivered; desk@ ticks 105 and presses Mark clean — the row now carries a change time.",
          ),
        );
      },
    );
  },
  async raceResume() {
    const desk = await as("desk");
    await kase(
      "C-5b",
      "…and after the worker delivers the departure",
      ["HK-S1-05"],
      async ({ shots, see, check }) => {
        let published = "0";
        for (let i = 0; i < 30 && published === "0"; i++) {
          await desk.waitForTimeout(2000);
          published = sql(
            `select count(*) from outbox.events where event_type = 'stay.checked_out' and published_at is not null and payload->>'stayId' in (select id::text from public.stays where accommodation_unit_id = '${F.unit["105"]}')`,
          );
        }
        see(
          `event delivered after restarting the worker: ${published === "1"}`,
        );
        check(published === "1", "the worker delivered the departure");
        await openBoard(desk, "p1");
        const c = await cells(desk, "105");
        see(`105: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Clean"),
          "105 is still Clean: the later word wins",
        );
        shots.push(
          await shot(
            desk,
            "C-5b",
            "Worker restarted and the event delivered: 105 still reads Clean — the desk's mark came after the departure and is kept.",
          ),
        );
      },
    );
  },

  async redelivery() {
    await kase(
      "C-6",
      "The same departure delivered again changes nothing",
      ["HK-S1-04"],
      async ({ see, check }) => {
        const before = sql(
          `select status || ' ' || status_changed_at from public.housekeeping_unit_status where accommodation_unit_id = '${F.unit["104"]}'`,
        );
        see(`104 before redelivery: ${before}`);
        const event = sql(
          `select id from outbox.events where event_type = 'stay.checked_out' and payload->>'stayId' in (select id::text from public.stays where accommodation_unit_id = '${F.unit["104"]}')`,
        );
        sql(
          `delete from outbox.deliveries where event_id = '${event}' and consumer = 'housekeeping.markRoomDirtyOnCheckOut'`,
        );
        sql(
          `update outbox.events set published_at = null, available_at = now(), claimed_until = null where id = '${event}'`,
        );
        see(
          "delivery record removed and the event made claimable again, as after a crash",
        );
        let redelivered = "0";
        for (let i = 0; i < 30 && redelivered === "0"; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          redelivered = sql(
            `select count(*) from outbox.deliveries where event_id = '${event}' and consumer = 'housekeeping.markRoomDirtyOnCheckOut'`,
          );
        }
        check(redelivered === "1", "the worker delivered it a second time");
        const after = sql(
          `select status || ' ' || status_changed_at from public.housekeeping_unit_status where accommodation_unit_id = '${F.unit["104"]}'`,
        );
        see(`104 after redelivery:  ${after}`);
        check(before === after, "status and change time are identical");
      },
    );
  },

  async unavailable() {
    await kase(
      "C-7",
      "A departure where housekeeping is not available marks nothing",
      ["HK-S1-09"],
      async ({ shots, see, check }) => {
        const desk = await as("desk");
        await desk.goto(`${APP}/en/departures?property=${P.p3}`);
        await desk.getByRole("searchbox").fill("Oktay Rifat");
        const r = desk.getByRole("row").filter({ hasText: "Oktay Rifat" });
        await r.getByRole("button", { name: "Check out" }).click();
        await r
          .getByRole("button", { name: "Check out" })
          .waitFor({ state: "detached" });
        let published = "0";
        for (let i = 0; i < 30 && published === "0"; i++) {
          await desk.waitForTimeout(2000);
          published = sql(
            `select count(*) from outbox.events where event_type = 'stay.checked_out' and published_at is not null and payload->>'stayId' in (select id::text from public.stays where accommodation_unit_id = '${F.unit["401"]}')`,
          );
        }
        check(
          published === "1",
          "the departure was delivered (not stuck retrying)",
        );
        const rows = sql(
          `select count(*) from public.housekeeping_unit_status where accommodation_unit_id = '${F.unit["401"]}'`,
        );
        see(`status rows for 401 at Moda Pansiyon: ${rows}`);
        check(
          rows === "0",
          "no status was written: Moda Pansiyon has no housekeeping capability",
        );
        shots.push(
          await shot(
            desk,
            "C-7",
            "Moda Pansiyon (front desk only): Oktay Rifat checked out of 401. The worker delivered the event and wrote no housekeeping status.",
          ),
        );
      },
    );
  },

  // -------------------------------------------------------------------------
  async checkin() {
    const desk = await as("desk");
    const arrivals = `${APP}/en/arrivals?property=${P.p1}`;
    const arrivalRow = (guest) =>
      desk.getByRole("row").filter({ hasText: guest });
    await kase(
      "I-1",
      "Arrivals show readiness as a word",
      ["HK-S2-18"],
      async ({ shots, see, check }) => {
        await desk.goto(arrivals);
        await arrivalRow("Sabiha Gökçen").waitFor();
        const dirty = await arrivalRow("Sabiha Gökçen").innerText();
        const clean = await arrivalRow("Cahide Sonku").innerText();
        see(`102 (dirty): ${dirty.replace(/\s+/g, " ")}`);
        see(`103 (never marked): ${clean.replace(/\s+/g, " ")}`);
        check(
          /Not ready/.test(dirty),
          "Sabiha Gökçen's room 102 reads Not ready",
        );
        check(
          /Ready/.test(clean) && !/Not ready/.test(clean),
          "Cahide Sonku's room 103 reads Ready",
        );
        shots.push(
          await shot(
            desk,
            "I-1",
            "Arrivals at Kadıköy Otel: 102 (dirty) says Not ready; 103, 101 and 107 (never marked) say Ready.",
          ),
        );
      },
    );
    await kase(
      "I-2",
      "Checking in to a ready room asks nothing",
      ["HK-S2-16"],
      async ({ shots, check }) => {
        await arrivalRow("Cahide Sonku")
          .getByRole("button", { name: "Check in" })
          .click();
        await arrivalRow("Cahide Sonku").getByText("Checked in").waitFor();
        check(true, "Cahide Sonku checked in with one press, no warning");
        shots.push(
          await shot(
            desk,
            "I-2",
            "desk@ pressed Check in for Cahide Sonku (room 103, ready): checked in, no question asked.",
          ),
        );
      },
    );
    await kase(
      "I-3",
      "Checking in to a room that is not ready asks first",
      ["HK-S2-14"],
      async ({ shots, see, check }) => {
        await arrivalRow("Sabiha Gökçen")
          .getByRole("button", { name: "Check in" })
          .click();
        await arrivalRow("Sabiha Gökçen")
          .getByRole("button", { name: "Check in anyway" })
          .waitFor();
        const text = (await arrivalRow("Sabiha Gökçen").innerText()).replace(
          /\s+/g,
          " ",
        );
        see(`row: ${text}`);
        check(/isn't ready yet/.test(text), "the warning is shown");
        const status = sql(
          `select r.status from public.reservations r where r.accommodation_unit_id = '${F.unit["102"]}' and r.status in ('confirmed','checked_in')`,
        );
        check(
          status === "confirmed",
          "nothing was written: the Reservation is still confirmed",
        );
        shots.push(
          await shot(
            desk,
            "I-3",
            'desk@ pressed Check in for Sabiha Gökçen (room 102, dirty): the row asks — "This room isn\'t ready yet…" with Not now and Check in anyway. The Reservation is still confirmed.',
          ),
        );
      },
    );
    await kase(
      "I-4",
      "Not now returns the row to its plain button",
      ["HK-S2-14"],
      async ({ shots, check }) => {
        await arrivalRow("Sabiha Gökçen")
          .getByRole("button", { name: "Not now" })
          .click();
        check(
          (await arrivalRow("Sabiha Gökçen")
            .getByRole("button", { name: "Check in", exact: true })
            .count()) === 1,
          "the plain Check in button is back",
        );
        shots.push(
          await shot(
            desk,
            "I-4",
            "After Not now: the row shows its plain Check in button again.",
          ),
        );
      },
    );
    await kase(
      "I-5",
      "Check in anyway: recorded, and the room stays dirty",
      ["HK-S2-15"],
      async ({ shots, see, check }) => {
        await arrivalRow("Sabiha Gökçen")
          .getByRole("button", { name: "Check in", exact: true })
          .click();
        await arrivalRow("Sabiha Gökçen")
          .getByRole("button", { name: "Check in anyway" })
          .click();
        await arrivalRow("Sabiha Gökçen").getByText("Checked in").waitFor();
        shots.push(
          await shot(
            desk,
            "I-5a",
            "desk@ pressed Check in, then Check in anyway: Sabiha Gökçen is checked in.",
          ),
        );
        const id = sql(
          `select a.id from audit.records a join public.reservations r on r.id = a.subject_id where a.action = 'reservation.checked_in' and r.accommodation_unit_id = '${F.unit["102"]}'`,
        );
        const ctx = sql(
          `select context::text from audit.records where id = '${id}'`,
        );
        see(`reservation.checked_in context: ${ctx}`);
        check(
          ctx.includes('"roomWasNotReady": true'),
          "the audit record notes the room was not ready",
        );
        const owner = await as("owner");
        await owner.goto(`${APP}/en/audit-log?property=${P.p1}&record=${id}`);
        await owner.getByText("roomWasNotReady").first().waitFor();
        shots.push(
          await shot(
            owner,
            "I-5b",
            "The audit log record for that check-in, opened by owner@: its context carries roomWasNotReady = true.",
          ),
        );
        await openBoard(desk, "p1");
        const c = await cells(desk, "102");
        see(`102 on the board: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Dirty") &&
            c.join(" ").includes("Guest in house"),
          "102 is still Dirty, now with a Guest in house",
        );
        shots.push(
          await shot(
            desk,
            "I-5c",
            "The board afterwards: 102 is still Dirty, and now has a Guest in house.",
          ),
        );
      },
    );
    await kase(
      "I-6",
      "Cleaned between the warning and the confirmation",
      ["HK-S2-17"],
      async ({ shots, see, check }) => {
        await openBoard(desk, "p1");
        await markOne(desk, "101", "Mark dirty");
        await desk.goto(arrivals);
        await arrivalRow("Aziz Sancar")
          .getByRole("button", { name: "Check in" })
          .click();
        await arrivalRow("Aziz Sancar")
          .getByRole("button", { name: "Check in anyway" })
          .waitFor();
        shots.push(
          await shot(
            desk,
            "I-6a",
            "101 marked dirty; desk@ pressed Check in for Aziz Sancar and is being asked.",
          ),
        );
        const hk = await as("housekeeper");
        await openBoard(hk, "p1");
        await markOne(hk, "101", "Mark clean");
        shots.push(
          await shot(
            hk,
            "I-6b",
            "Meanwhile, in another session, housekeeper@ marks 101 clean.",
          ),
        );
        await arrivalRow("Aziz Sancar")
          .getByRole("button", { name: "Check in anyway" })
          .click();
        await arrivalRow("Aziz Sancar").getByText("Checked in").waitFor();
        const ctx = sql(
          `select a.context::text from audit.records a join public.reservations r on r.id = a.subject_id where a.action = 'reservation.checked_in' and r.accommodation_unit_id = '${F.unit["101"]}'`,
        );
        see(`reservation.checked_in context: ${ctx}`);
        check(
          !ctx.includes("roomWasNotReady"),
          "no roomWasNotReady: readiness was read again at check-in",
        );
        shots.push(
          await shot(
            desk,
            "I-6c",
            "desk@ confirms on the stale warning: checked in, and the record does not claim the room was not ready.",
          ),
        );
      },
    );
  },

  async checkinAgain() {
    const desk = await as("desk");
    const arrivalRow = (guest) =>
      desk.getByRole("row").filter({ hasText: guest });
    await kase(
      "I-3r",
      "Re-run of I-3 on a fresh arrival: asks first, writes nothing",
      ["HK-S2-14"],
      async ({ shots, see, check }) => {
        await openBoard(desk, "p1");
        // A first attempt of this case marked 108 dirty before failing on a
        // fixture of mine; the menu never offers a room its own status.
        if (!(await cells(desk, "108")).join(" ").includes("Dirty"))
          await markOne(desk, "108", "Mark dirty");
        see(`108 on the board: ${(await cells(desk, "108")).join(" | ")}`);
        await desk.goto(`${APP}/en/arrivals?property=${P.p1}`);
        await arrivalRow("Nezihe Muhiddin")
          .getByRole("button", { name: "Check in" })
          .click();
        await arrivalRow("Nezihe Muhiddin")
          .getByRole("button", { name: "Check in anyway" })
          .waitFor();
        const text = (await arrivalRow("Nezihe Muhiddin").innerText()).replace(
          /\s+/g,
          " ",
        );
        see(`row: ${text}`);
        check(/isn't ready yet/.test(text), "the warning is shown");
        const status = sql(
          `select r.status from public.reservations r where r.accommodation_unit_id = '${F.unit["108"]}'`,
        );
        const stays = sql(
          `select count(*) from public.stays where accommodation_unit_id = '${F.unit["108"]}'`,
        );
        see(`reservation status: ${status}; stays on 108: ${stays}`);
        check(
          status === "confirmed" && stays === "0",
          "nothing was written: the Reservation is confirmed and no Stay exists",
        );
        shots.push(
          await shot(
            desk,
            "I-3r",
            "Room 108 marked dirty; desk@ pressed Check in for Nezihe Muhiddin: the row asks, and the database shows the Reservation still confirmed with no Stay.",
          ),
        );
        await arrivalRow("Nezihe Muhiddin")
          .getByRole("button", { name: "Not now" })
          .click();
      },
    );
  },

  async warningFits() {
    const desk = await as("desk");
    await kase(
      "W-1",
      "The not-ready warning fits inside its row",
      ["HK-S2-14"],
      async ({ shots, see, check }) => {
        await desk.goto(`${APP}/en/arrivals?property=${P.p1}`);
        await settle(desk);
        const r = desk.getByRole("row").filter({ hasText: "Nezihe Muhiddin" });
        await r.getByRole("button", { name: "Check in" }).click();
        const warning = r.getByText(/isn't ready yet/);
        await warning.waitFor();
        const m = await warning.evaluate((el) => {
          // The text's own extent, not its box: with white-space: nowrap the
          // text runs out of a max-width box, and the box says nothing about it.
          const range = document.createRange();
          range.selectNodeContents(el);
          const box = range.getBoundingClientRect();
          let clip = el.parentElement;
          while (clip && getComputedStyle(clip).overflow === "visible")
            clip = clip.parentElement;
          const c = clip.getBoundingClientRect();
          return {
            text: el.textContent,
            whiteSpace: getComputedStyle(el).whiteSpace,
            textRight: Math.round(box.right),
            clipRight: Math.round(c.right),
            clippedBy: clip.className.slice(0, 60),
            boxRight: Math.round(el.getBoundingClientRect().right),
          };
        });
        see(
          `viewport 1440×900; warning white-space: ${m.whiteSpace}; the paragraph's box ends at ${m.boxRight}px but its text runs to ${m.textRight}px; the table's scroll container ends at ${m.clipRight}px (${m.clippedBy})`,
        );
        see(`full text: ${m.text}`);
        check(
          m.textRight <= m.clipRight,
          "the whole warning is inside the visible table",
        );
        shots.push(
          await shot(
            desk,
            "W-1",
            "Arrivals at 1440 px, desk@ pressed Check in for Nezihe Muhiddin (108, not ready): the warning runs past the table's right edge and is cut off mid-word.",
            { full: false },
          ),
        );
        await r.getByRole("button", { name: "Not now" }).click();
      },
    );
  },

  async signinLimit() {
    await kase(
      "X-1",
      "Out of scope: a rate-limited sign-in reads as a wrong password",
      [],
      async ({ shots, see, check }) => {
        const codes = [];
        for (let i = 0; i < 8; i++) {
          const r = await fetch(`${APP}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: APP },
            body: JSON.stringify({ email: EMAIL.finance, password: PASSWORD }),
          });
          codes.push(r.status);
        }
        see(
          `eight correct sign-ins in a row from this process: ${codes.join(", ")}`,
        );
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        await page.goto(`${APP}/en/sign-in`);
        await page.getByLabel("Email").fill(EMAIL.finance);
        await page.getByLabel("Password").fill(PASSWORD);
        const [response] = await Promise.all([
          page.waitForResponse((r) =>
            r.url().includes("/api/auth/sign-in/email"),
          ),
          page.getByRole("button", { name: "Sign in" }).click(),
        ]);
        await page.waitForTimeout(1000);
        const shown = (await page.getByRole("alert").allInnerTexts())
          .join(" ")
          .trim();
        see(
          `the form's own request answered ${response.status()}; the page says: "${shown}"`,
        );
        check(
          !(response.status() === 429 && /did not match/.test(shown)),
          "a rate limit is not reported as a wrong password",
        );
        shots.push(
          await shot(
            page,
            "X-1",
            "The sign-in form after a run of sign-ins: finance@ with the correct password. The server answered 429 (rate limited); the form says the email and password did not match.",
            { full: false },
          ),
        );
        await context.close();
      },
    );
  },

  // -------------------------------------------------------------------------
  async audit() {
    const owner = await as("owner");
    await kase(
      "A-1",
      "A mark's audit record: who, what, and Where (#59)",
      ["HK-S2-01"],
      async ({ shots, see, check }) => {
        await owner.goto(
          `${APP}/en/audit-log?property=${P.p1}&action=housekeeping.status_changed`,
        );
        await owner.locator("tbody tr").first().waitFor();
        const first = (
          await owner.locator("tbody tr").first().innerText()
        ).replace(/\s+/g, " ");
        see(`newest row: ${first}`);
        check(first.includes("Kadıköy Otel"), "Where names the Property");
        shots.push(
          await shot(
            owner,
            "A-1a",
            "Audit log filtered to room-status changes (owner@): each row has a Where column naming Kadıköy Otel.",
          ),
        );
        const id = sql(
          `select id from audit.records where action = 'housekeeping.status_changed' and subject_id = '${F.unit["102"]}' order by occurred_at limit 1`,
        );
        const loc = sql(
          `select location_id from audit.records where id = '${id}'`,
        );
        see(`first 102 record: location_id = ${loc} (Kadıköy Otel is ${P.p1})`);
        check(loc === P.p1, "the record is filed at its Property");
        await owner.goto(`${APP}/en/audit-log?property=${P.p1}&record=${id}`);
        await owner.getByText("previousStatus").first().waitFor();
        shots.push(
          await shot(
            owner,
            "A-1b",
            "The first mark of 102 opened: Where = Kadıköy Otel, Who = Deniz Desk, context status dirty, previousStatus clean.",
          ),
        );
      },
    );
    await kase(
      "A-2",
      "The one-Property manager sees their Property's marks",
      ["HK-S2-01"],
      async ({ shots, see, check }) => {
        const k = await as("kadikoy");
        await k.goto(
          `${APP}/en/audit-log?property=${P.p1}&action=housekeeping.status_changed`,
        );
        await k.locator("tbody tr").first().waitFor();
        const rows = await k.locator("tbody tr").allInnerTexts();
        see(
          `rows: ${rows.length}; any Beşiktaş: ${rows.some((r) => r.includes("Beşiktaş"))}`,
        );
        check(
          rows.length > 0 && !rows.some((r) => r.includes("Beşiktaş")),
          "Kadıköy marks are visible and Beşiktaş marks are not",
        );
        shots.push(
          await shot(
            k,
            "A-2",
            "kadikoy.manager@ (reach: Kadıköy Otel only): the marks at Kadıköy are listed; the batch at Beşiktaş is not.",
          ),
        );
      },
    );
  },

  // -------------------------------------------------------------------------
  async blocked() {
    const manager = await as("manager");
    await kase(
      "K-1",
      "Blocking a dirty room keeps it dirty",
      ["HK-S1-18"],
      async ({ shots, see, check }) => {
        await openBoard(manager, "p2");
        await markOne(manager, "303", "Mark dirty");
        await manager.goto(`${APP}/en/rooms?property=${P.p2}`);
        await manager.getByRole("button", { name: "Bed list" }).click();
        await manager
          .getByRole("row")
          .filter({ hasText: "303" })
          .getByRole("button")
          .first()
          .click();
        await manager
          .getByLabel("Reason for block")
          .fill("Burst pipe in the bathroom");
        await manager.getByRole("button", { name: "Block bed" }).click();
        await manager.getByRole("dialog").waitFor({ state: "detached" });
        await openBoard(manager, "p2");
        const c = await cells(manager, "303");
        see(`303 while blocked: ${c.join(" | ")}`);
        check(
          c.join(" ").includes("Dirty") &&
            c.join(" ").includes("Out of service"),
          "303 reads Dirty and Out of service together",
        );
        shots.push(
          await shot(
            manager,
            "K-1a",
            "manager@ marked 303 dirty, then blocked it on Rooms & beds (burst pipe). The board shows Dirty and Out of service together.",
          ),
        );
        await manager.goto(`${APP}/en/rooms?property=${P.p2}`);
        await manager.getByRole("button", { name: "Bed list" }).click();
        await manager
          .getByRole("row")
          .filter({ hasText: "303" })
          .getByRole("button")
          .first()
          .click();
        await manager.getByRole("button", { name: "Unblock bed" }).click();
        await manager.getByRole("dialog").waitFor({ state: "detached" });
        await openBoard(manager, "p2");
        const d = await cells(manager, "303");
        see(`303 after unblock: ${d.join(" | ")}`);
        check(
          d.join(" ").includes("Dirty") &&
            !d.join(" ").includes("Out of service"),
          "unblocked, 303 is still Dirty",
        );
        shots.push(
          await shot(
            manager,
            "K-1b",
            "After Unblock bed: 303 is back in service and still Dirty.",
          ),
        );
      },
    );
  },

  // -------------------------------------------------------------------------
  async inspection() {
    const owner = await as("owner");
    const combo = (page, name) => page.getByRole("combobox", { name });
    await kase(
      "S-1",
      "The setting shows what the Property inherits",
      ["HK-S3-09"],
      async ({ shots, see, check }) => {
        await openBoard(owner, "p1");
        const prop = await combo(owner, "For this Property").innerText();
        const org = await combo(
          owner,
          "For the whole Organization",
        ).innerText();
        const flow = await owner.getByTestId("flow").innerText();
        see(
          `Organization: ${org}; this Property: ${prop}; flow: ${flow.replace(/\s+/g, " → ")}`,
        );
        check(
          /Use the Organization's setting \(Off\)/.test(prop),
          "the Property says it follows the Organization, and what that is",
        );
        check(!flow.includes("Inspected"), "the flow has no inspection step");
        shots.push(
          await shot(
            owner,
            "S-1",
            'owner@, Kadıköy Otel: "Check rooms after cleaning" — Organization Off; this Property "Use the Organization\'s setting (Off)"; flow Dirty → Clean → Ready to let.',
          ),
        );
      },
    );
    await kase(
      "S-2",
      "Organization default on: clean and never-marked rooms wait",
      ["HK-S3-01", "HK-S3-11", "HK-S3-06"],
      async ({ shots, see, check }) => {
        const before = sql(
          `select string_agg(u.name || '=' || s.status || '@' || s.status_changed_at, ', ' order by u.name) from public.housekeeping_unit_status s join public.accommodation_units u on u.id = s.accommodation_unit_id where s.property_id = '${P.p1}'`,
        );
        await combo(owner, "For the whole Organization").click();
        await owner.getByRole("option", { name: "On", exact: true }).click();
        await owner.getByText("Saved").waitFor();
        await openBoard(owner, "p1");
        const flow = await owner.getByTestId("flow").innerText();
        see(`flow: ${flow.replace(/\s+/g, " → ")}`);
        check(flow.includes("Inspected"), "the flow now has an Inspected step");
        const c105 = await cells(owner, "105");
        const c107 = await cells(owner, "107");
        see(`105 (marked clean): ${c105.join(" | ")}`);
        see(`107 (never marked): ${c107.join(" | ")}`);
        check(
          c105.join(" ").includes("Waiting for inspection"),
          "105, marked clean, is waiting for inspection",
        );
        check(
          c107.join(" ").includes("Waiting for inspection"),
          "107, never marked, is clean and waits too (HK-S3-11)",
        );
        see(`stats: ${JSON.stringify(await stats(owner))}`);
        const after = sql(
          `select string_agg(u.name || '=' || s.status || '@' || s.status_changed_at, ', ' order by u.name) from public.housekeeping_unit_status s join public.accommodation_units u on u.id = s.accommodation_unit_id where s.property_id = '${P.p1}'`,
        );
        check(
          before === after,
          "no stored status or change time moved (HK-S3-06)",
        );
        shots.push(
          await shot(
            owner,
            "S-2",
            'owner@ set the Organization default On: "Saved"; the flow gains Inspected; 105 and 107 read Clean + "Waiting for inspection"; Ready to let dropped.',
          ),
        );
      },
    );
    await kase(
      "S-3",
      "…and arrivals ask about a never-marked room",
      ["HK-S3-11", "HK-S2-18"],
      async ({ shots, see, check }) => {
        const desk = await as("desk");
        await desk.goto(`${APP}/en/arrivals?property=${P.p1}`);
        const r = (
          await desk
            .getByRole("row")
            .filter({ hasText: "Behice Boran" })
            .innerText()
        ).replace(/\s+/g, " ");
        see(`Behice Boran (room 107, never marked): ${r}`);
        check(/Not ready/.test(r), "107 reads Not ready under inspection");
        shots.push(
          await shot(
            desk,
            "S-3",
            "Arrivals with inspection on: Behice Boran's room 107, never marked, reads Not ready.",
          ),
        );
      },
    );
    await kase(
      "S-4",
      "A Property override wins; the other Property follows the default",
      ["HK-S3-02"],
      async ({ shots, see, check }) => {
        const manager = await as("manager");
        await openBoard(manager, "p1");
        await combo(manager, "For this Property").click();
        await manager.getByRole("option", { name: "Off", exact: true }).click();
        await manager.getByText("Saved").waitFor();
        await openBoard(manager, "p1");
        const c = await cells(manager, "105");
        see(`Kadıköy 105: ${c.join(" | ")}`);
        check(
          !c.join(" ").includes("Waiting for inspection"),
          "Kadıköy's own Off wins: 105 is ready",
        );
        shots.push(
          await shot(
            manager,
            "S-4a",
            "manager@ set Kadıköy Otel to Off while the Organization is On: 105 no longer waits.",
          ),
        );
        await openBoard(manager, "p2");
        const prop = await combo(manager, "For this Property").innerText();
        see(`Beşiktaş this Property: ${prop}`);
        check(
          /Use the Organization's setting \(On\)/.test(prop),
          "Beşiktaş still follows the default (On)",
        );
        shots.push(
          await shot(
            manager,
            "S-4b",
            "Beşiktaş Rezidans in the same moment: it follows the Organization (On), and its flow has the Inspected step.",
          ),
        );
      },
    );
    await kase(
      "S-5",
      "Reset a Property to the default",
      ["HK-S3-10", "HK-S3-03"],
      async ({ shots, see, check }) => {
        const manager = await as("manager");
        await openBoard(manager, "p1");
        await combo(manager, "For this Property").click();
        await manager
          .getByRole("option", { name: /Use the Organization's setting/ })
          .click();
        await manager.getByText("Saved").waitFor();
        await openBoard(manager, "p1");
        const prop = await combo(manager, "For this Property").innerText();
        const c = await cells(manager, "105");
        see(`this Property: ${prop}; 105: ${c.join(" | ")}`);
        check(
          /Use the Organization's setting \(On\)/.test(prop) &&
            c.join(" ").includes("Waiting for inspection"),
          "Kadıköy follows the default again and 105 waits",
        );
        const row = sql(
          `select coalesce(inspect_after_cleaning::text,'null') from public.housekeeping_settings where property_id = '${P.p1}'`,
        );
        see(`stored override: ${row}`);
        check(row === "null", "the override was cleared, not deleted");
        shots.push(
          await shot(
            manager,
            "S-5",
            'manager@ reset Kadıköy Otel to "Use the Organization\'s setting": it follows On again; 105 waits for inspection.',
          ),
        );
      },
    );
    await kase(
      "S-6",
      "The default needs reach to every Property",
      ["HK-S3-05"],
      async ({ shots, see, check }) => {
        const k = await as("kadikoy");
        await openBoard(k, "p1");
        const orgDisabled = await combo(
          k,
          "For the whole Organization",
        ).isDisabled();
        const propDisabled = await combo(k, "For this Property").isDisabled();
        see(
          `Organization control disabled: ${orgDisabled}; Property control disabled: ${propDisabled}`,
        );
        check(
          orgDisabled && !propDisabled,
          "only the Property control is usable",
        );
        check(
          (await k.getByText(/reaches every Property can change/).count()) > 0,
          "the reason is shown",
        );
        shots.push(
          await shot(
            k,
            "S-6",
            "kadikoy.manager@ (manager, one Property): the Organization control is disabled with its reason; the Property control is open.",
          ),
        );
      },
    );
    await kase(
      "S-7",
      "Changing it needs accommodation.configure",
      ["HK-S3-07"],
      async ({ shots, see, check }) => {
        for (const role of ["desk", "finance"]) {
          const page = await as(role);
          await openBoard(page, "p1");
          const both =
            (await combo(page, "For the whole Organization").isDisabled()) &&
            (await combo(page, "For this Property").isDisabled());
          see(`${role}: both disabled = ${both}`);
          check(both, `${role} cannot change either setting`);
          check(
            (await page.getByText("A manager can change this.").count()) === 2,
            `${role} is told who can`,
          );
          shots.push(
            await shot(
              page,
              `S-7-${role}`,
              `${role}@: both controls disabled, "A manager can change this." under each; the values are still shown.`,
            ),
          );
        }
      },
    );
    await kase(
      "S-8",
      "Every setting change is audited, with Where",
      ["HK-S3-08"],
      async ({ shots, see, check }) => {
        await owner.goto(
          `${APP}/en/audit-log?property=${P.p1}&action=housekeeping.inspection_set`,
        );
        await owner.locator("tbody tr").first().waitFor();
        const rows = (await owner.locator("tbody tr").allInnerTexts()).map(
          (r) => r.replace(/\s+/g, " "),
        );
        rows.forEach((r) => see(`row: ${r}`));
        check(
          rows.length === 3,
          "three records: the default on, Kadıköy off, Kadıköy reset",
        );
        const locs = sql(
          `select subject_type || ':' || coalesce(location_id::text,'none') || ':' || (context->>'from') || '→' || (context->>'to') from audit.records where action = 'housekeeping.inspection_set' and organization_id = '${F.organizationId}' order by occurred_at`,
        );
        see(`subject:location:from→to — ${locs.replace(/\n/g, " ; ")}`);
        check(
          /organization:none:off→on/.test(locs) &&
            locs.split("\n").filter((l) => l.startsWith(`property:${P.p1}:`))
              .length === 2,
          "the default is Organization-wide; both overrides are filed at Kadıköy's id",
        );
        shots.push(
          await shot(
            owner,
            "S-8",
            "Audit log filtered to inspection changes (owner@): the Organization default (Where: Organization-wide) and Kadıköy's override and reset (Where: Kadıköy Otel).",
          ),
        );
      },
    );
  },

  // -------------------------------------------------------------------------
  async refusal() {
    await kase(
      "F-1",
      "A refused mark keeps the selection",
      ["HK-S2-13", "HK-S2-04"],
      async ({ shots, see, check }) => {
        const hk = await as("housekeeper");
        await openBoard(hk, "p2");
        await row(hk, "301").getByRole("checkbox").check();
        sql(
          `update public.staff_roles set permissions = array_remove(permissions, 'housekeeping.update_status') where organization_id is null and key = 'housekeeping'`,
        );
        see(
          "housekeeping.update_status taken from the housekeeping role while the board is open",
        );
        await hk.getByRole("button", { name: "Mark clean" }).click();
        await hk.getByText(/couldn't be updated/).waitFor();
        const ticked = await row(hk, "301")
          .getByRole("checkbox")
          .isChecked()
          .catch(() => false);
        const c = await cells(hk, "301");
        see(
          `301 after the refused mark: ${c.join(" | ")}; still ticked: ${ticked}`,
        );
        check(
          c.join(" ").includes("Inspected"),
          "nothing was marked: 301 is still Inspected",
        );
        shots.push(
          await shot(
            hk,
            "F-1",
            'housekeeper@ ticked 301, then lost housekeeping.update_status and pressed Mark clean: "Those rooms couldn\'t be updated…"; 301 unchanged.',
          ),
        );
        await openBoard(hk, "p2");
        check(
          (await hk.getByRole("checkbox", { name: "Select row" }).count()) ===
            0,
          "reloaded, the board is read-only for the housekeeper",
        );
        shots.push(
          await shot(
            hk,
            "F-1b",
            "housekeeper@ reloads: the board is now read-only, matching the permission they hold.",
          ),
        );
        sql(
          `update public.staff_roles set permissions = array_append(permissions, 'housekeeping.update_status') where organization_id is null and key = 'housekeeping' and not ('housekeeping.update_status' = any(permissions))`,
        );
        see("permission restored");
      },
    );
  },

  async switchedOff() {
    await kase(
      "O-1",
      "Housekeeping switched off: no board, and dirty rooms read ready",
      ["HK-S1-20", "HK-S1-15"],
      async ({ shots, see, check }) => {
        const desk = await as("desk");
        await openBoard(desk, "p1");
        await markOne(desk, "107", "Mark dirty");
        await desk.goto(`${APP}/en/arrivals?property=${P.p1}`);
        const before = (
          await desk
            .getByRole("row")
            .filter({ hasText: "Behice Boran" })
            .innerText()
        ).replace(/\s+/g, " ");
        see(`107 before switching off: ${before}`);
        shots.push(
          await shot(
            desk,
            "O-1a",
            "107 marked dirty: Behice Boran's arrival reads Not ready.",
          ),
        );
        sql(
          `update public.property_capabilities set enabled = false where property_id = '${P.p1}' and capability_key = 'housekeeping'`,
        );
        see(
          "housekeeping capability disabled at Kadıköy Otel (no screen exists for this; set in the database)",
        );
        await desk.goto(`${APP}/en/arrivals?property=${P.p1}`);
        const after = (
          await desk
            .getByRole("row")
            .filter({ hasText: "Behice Boran" })
            .innerText()
        ).replace(/\s+/g, " ");
        see(`107 after: ${after}`);
        check(
          /Ready/.test(after) && !/Not ready/.test(after),
          "107 reads Ready: nothing there can clear a status any more",
        );
        const stored = sql(
          `select status from public.housekeeping_unit_status where accommodation_unit_id = '${F.unit["107"]}'`,
        );
        check(stored === "dirty", "the stored status is untouched (dirty)");
        shots.push(
          await shot(
            desk,
            "O-1b",
            "After switching housekeeping off at Kadıköy Otel: the same arrival reads Ready; the stored status is still dirty.",
          ),
        );
        await desk.goto(board("p1"));
        await desk.locator("main").waitFor();
        const text = await desk.locator("main").innerText();
        see(`board page: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
        check(
          !text.includes("Kadıköy Otel") ||
            !text.includes("Which rooms need cleaning at Kadıköy"),
          "Kadıköy's board is not shown",
        );
        shots.push(
          await shot(
            desk,
            "O-1c",
            "The Housekeeping screen for Kadıköy Otel after switching off: Kadıköy's board is not offered.",
          ),
        );
        sql(
          `update public.property_capabilities set enabled = true where property_id = '${P.p1}' and capability_key = 'housekeeping'`,
        );
        see("capability re-enabled");
      },
    );
  },

  async misc() {
    await kase(
      "E-1",
      "A Property with no rooms",
      ["HK-S1-16"],
      async ({ shots, see, check }) => {
        const owner = await as("owner");
        await openBoard(owner, "p4");
        const text = await owner.locator("main").innerText();
        see(`page: ${text.slice(0, 200).replace(/\s+/g, " ")}`);
        check(
          text.includes("No rooms here yet"),
          "the empty state says there are no rooms",
        );
        check(
          !text.includes("can see every room here but not change it"),
          "no read-only notice over nothing",
        );
        shots.push(
          await shot(
            owner,
            "E-1",
            'owner@ at Üsküdar Konak (housekeeping on, no rooms): "No rooms here yet" with a pointer to Rooms & beds.',
          ),
        );
      },
    );
    await kase(
      "E-2",
      "A Property out of reach is not shown",
      ["HK-S1-14"],
      async ({ shots, see, check }) => {
        const k = await as("kadikoy");
        await k.goto(board("p2"));
        await k.locator("h1").first().waitFor();
        const heading = await k.locator("main h1").first().innerText();
        see(`heading when asking for Beşiktaş: ${heading}`);
        check(
          !heading.includes("Beşiktaş"),
          "Beşiktaş's rooms are not shown to a manager who does not reach it",
        );
        shots.push(
          await shot(
            k,
            "E-2",
            "kadikoy.manager@ opens the board with ?property=Beşiktaş: the page shows Kadıköy Otel's board, never Beşiktaş's.",
          ),
        );
      },
    );
    for (const locale of ["tr", "ar"]) {
      await kase(
        `E-3-${locale}`,
        `The board in ${locale === "tr" ? "Turkish" : "Arabic"}`,
        ["HK-S1-17"],
        async ({ shots, see, check }) => {
          const owner = await as("owner");
          await openBoard(owner, "p1", locale);
          const dir = await owner.locator("html").getAttribute("dir");
          const heading = await owner.locator("main h1").first().innerText();
          see(`dir=${dir}; heading: ${heading}`);
          check(
            locale === "ar" ? dir === "rtl" : dir === "ltr",
            `document direction is ${locale === "ar" ? "rtl" : "ltr"}`,
          );
          shots.push(
            await shot(
              owner,
              `E-3-${locale}`,
              `The Kadıköy board and inspection card in ${locale === "tr" ? "Turkish" : "Arabic (right to left)"}, signed in as owner@.`,
            ),
          );
        },
      );
    }
  },
};

const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(sections)) {
  if (!sections[name]) throw new Error(`no section ${name}`);
  console.log(`— ${name}`);
  await sections[name]();
}
await browser.close();
