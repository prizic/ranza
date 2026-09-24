// A non-default role: a front_desk Staff Member assigned to one Property.
// The account is created through the app's own sign-up route and first
// request (ADR 0005); the membership is granted in SQL, as db-seed-dev does,
// because there is no self-service way to accept an invitation yet.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE;
const LABEL = process.env.LABEL;
const PGPORT = process.env.PGPORT;
const OUT = process.env.OUT;
const EMAIL = "evidence-frontdesk@example.test";
const PASSWORD = "evidence-frontdesk-password-1";
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
    {
      env: { ...process.env, PGPASSWORD: "ranza", PGCONNECT_TIMEOUT: "60" },
    },
  )
    .toString()
    .trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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

let response = await page.request.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email: EMAIL, password: PASSWORD, name: "Evidence Front Desk" },
  headers: { origin: BASE },
});
if (!response.ok())
  response = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { origin: BASE },
  });
if (!response.ok())
  throw new Error(
    `front desk account: ${response.status()} ${await response.text()}`,
  );
await page.goto(`${BASE}/en/today`, { waitUntil: "load" });
const beforeGrant = {
  url: page.url().replace(BASE, ""),
  main: (await page.locator("main").first().innerText())
    .replace(/\s+/g, " ")
    .slice(0, 160),
};
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-role-0-no-membership.png`),
});

const [first] = sql("select id || '|' || name from properties order by name")
  .split("\n")
  .map((l) => l.split("|"));
sql(`
  with member as (select id from public.users where lower(email) = lower('${EMAIL}')),
  organization as (select organization_id as id from public.properties where id = '${first[0]}'),
  membership as (
    insert into public.organization_memberships (organization_id, user_id, role, access_scope, role_scope_id)
    select organization.id, member.id, 'front_desk', 'assigned_properties', '00000000-0000-0000-0000-000000000000'
    from organization, member
    on conflict do nothing
  )
  insert into public.property_assignments (property_id, organization_id, user_id)
  select '${first[0]}', organization.id, member.id from organization, member
  on conflict do nothing`);

await page.goto(`${BASE}/en/today?property=${first[0]}`, {
  waitUntil: "networkidle",
});
const rail = await page.$$eval("aside a", (as) => [
  ...new Set(as.map((a) => a.getAttribute("href"))),
]);
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-role-1-today.png`),
});
await page.evaluate(() => (window.__sameDocument = true));
const clicks = [];
for (const segment of ["finance", "people", "today"]) {
  const link = page.locator(`aside a[href^="/en/${segment}"]:visible`);
  if ((await link.count()) === 0) {
    clicks.push({ segment, inRail: false });
    continue;
  }
  const before = documents.length;
  await link.first().click();
  await page.waitForURL(new RegExp(`/en/${segment}`));
  await page.waitForLoadState("load");
  await pause(1500);
  clicks.push({
    segment,
    inRail: true,
    url: page.url().replace(BASE, ""),
    documentRequests: documents.length - before,
    sameDocument: await page.evaluate(() => window.__sameDocument === true),
  });
}
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-role-2-after-clicks.png`),
});
await page.goto(`${BASE}/en/audit-log?property=${first[0]}`, {
  waitUntil: "networkidle",
});
const auditDirect = {
  url: page.url().replace(BASE, ""),
  main: (await page.locator("main").first().innerText())
    .replace(/\s+/g, " ")
    .slice(0, 200),
  rowLinks: await page.locator('main a[href*="record="]').count(),
};
await page.screenshot({
  path: path.join(OUT, "img", `${LABEL}-role-3-audit-direct.png`),
});
await browser.close();

const result = {
  label: LABEL,
  role: "front_desk",
  property: first,
  beforeGrant,
  rail,
  clicks,
  auditDirect,
};
writeFileSync(
  path.join(OUT, "data", `role-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 1));
