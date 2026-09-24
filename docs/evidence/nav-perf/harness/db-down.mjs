// The database goes away while the workspace is open: what does a rail click
// show, and does the next one recover once it is back? Only this lane's own
// throwaway container is stopped.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE;
const LABEL = process.env.LABEL;
const CONTAINER = process.env.CONTAINER;
const PGPORT = process.env.PGPORT;
const OUT = process.env.OUT;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (...args) => execFileSync("docker", args).toString().trim();
const ready = () => {
  for (let i = 0; i < 120; i++) {
    try {
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
          "-Atc",
          "select 1",
        ],
        {
          env: { ...process.env, PGPASSWORD: "ranza", PGCONNECT_TIMEOUT: "5" },
          stdio: "ignore",
        },
      );
      return i;
    } catch {
      execFileSync("sleep", ["1"]);
    }
  }
  throw new Error("database did not come back");
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const documents = [];
page.on("request", (r) => {
  if (r.resourceType() === "document" && r.frame() === page.mainFrame())
    documents.push(r.url().replace(BASE, ""));
});
await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: {
    email: "deniz@example.test",
    password: "correct-horse-battery-staple",
  },
  headers: { origin: BASE },
});
await page.goto(`${BASE}/en/today`, { waitUntil: "networkidle" });
await pause(2000);

docker("stop", CONTAINER);
const down = { documentsBefore: documents.length };
const started = Date.now();
await page
  .locator('aside a[href^="/en/finance"]:visible')
  .first()
  .click({ noWaitAfter: true });
await pause(15_000);
down.afterMs = Date.now() - started;
down.url = page.url().replace(BASE, "");
down.documentRequests = documents.slice(down.documentsBefore);
down.body = (
  await page
    .locator("body")
    .innerText()
    .catch(() => "")
)
  .replace(/\s+/g, " ")
  .slice(0, 300);
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-dbdown-1-click-while-down.png`),
});

docker("start", CONTAINER);
const readyAfter = ready();
await pause(2000);
const up = { documentsBefore: documents.length };
const t = Date.now();
const people = page.locator('aside a[href^="/en/people"]:visible');
up.railStillThere = (await people.count()) > 0;
if (up.railStillThere) await people.first().click({ noWaitAfter: true });
else await page.goto(`${BASE}/en/people`);
await pause(15_000);
up.afterMs = Date.now() - t;
up.url = page.url().replace(BASE, "");
up.documentRequests = documents.slice(up.documentsBefore);
up.body = (
  await page
    .locator("body")
    .innerText()
    .catch(() => "")
)
  .replace(/\s+/g, " ")
  .slice(0, 300);
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-dbdown-2-after-restart.png`),
});
await browser.close();

const result = { label: LABEL, down, readySecondsAfterStart: readyAfter, up };
writeFileSync(
  path.join(OUT, "data", `dbdown-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 1));
