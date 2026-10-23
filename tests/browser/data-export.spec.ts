import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PASSWORD, signIn } from "./front-desk";
import { psql } from "./local-database";
import { startWorker, WORKER_BUDGET_MS, whileWorking } from "./worker";

/**
 * Data export, through the screen an Organization actually uses (RANZ-48,
 * ADR 0043): an export is a record with a requester and a state, not a file
 * somebody made once.
 *
 * The pgTAP suite proves the grants, the policies and the readers, and the
 * integration suite proves a request becoming a file. This proves the part
 * neither can see: that the form posts what the server action wants, that the
 * list shows the export as pending and then as ready *without* the page being
 * told to reload, that the file a browser saves is the file the worker made,
 * that the person asking is shown by name rather than by address, that a
 * failure is a state with a reason on the screen, and what a colleague is and
 * is not shown of somebody else's export.
 *
 * The worker is a process of its own and nothing else starts one, so each test
 * that needs the file builds `apps/worker` and runs it, as a deployment does,
 * for as long as its own export takes and no longer. That bound is the point:
 * the same process closes every Property's due business day once a minute, and
 * a close cannot be undone. A worker left running for the length of the file
 * outlives that minute and shuts yesterday at the other Properties the browser
 * tests share, which fails unrelated specs for no reason they can state. Each
 * run is stopped the moment its export is in its final state, and fails here
 * if that takes longer than the budget in `worker.ts` rather than running on.
 *
 * Each run brings its own Organization, so it needs nothing the seed makes and
 * leaves nothing in anybody else's way. An export is a record and is never
 * deleted, so these accumulate, as every other suite's rows do. Everything is
 * asserted about this run's own exports, by id: the worker delivers whatever
 * else is waiting in the database too, and what it did with an export some
 * other fixture left behind is not this spec's to report.
 */
const SUFFIX = randomUUID().slice(0, 8);
const EMAIL = `e2e-export-${SUFFIX}@example.test`;
const NAME = `Export Tester ${SUFFIX}`;
// A colleague whose role exports and reads exports but cannot read the audit
// log, and one whose role may export the audit log too.
const NO_AUDIT_EMAIL = `e2e-export-noaudit-${SUFFIX}@example.test`;
const NO_AUDIT_NAME = `No Audit ${SUFFIX}`;
const AUDITOR_EMAIL = `e2e-export-auditor-${SUFFIX}@example.test`;
const AUDITOR_NAME = `Auditor ${SUFFIX}`;
// A colleague with no say over exports at all.
const OUTSIDER_EMAIL = `e2e-export-outsider-${SUFFIX}@example.test`;
const GUEST = `Zelda Exportable ${SUFFIX}`;
const FORMULA_GUEST = `=1+1 ${SUFFIX}`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-48");

test.beforeAll(async ({ playwright, baseURL }) => {
  // Made the way `db:seed:dev` makes a Staff Member: through the application's
  // own sign-up route, because the provider-subject mapping belongs to it
  // (ADR 0005). One authenticated request then maps the subject onto a Ranza
  // user, which is who a membership is given to. A context of its own for each
  // person, so one's session is not the other's.
  for (const [email, name] of [
    [EMAIL, NAME],
    [NO_AUDIT_EMAIL, NO_AUDIT_NAME],
    [AUDITOR_EMAIL, AUDITOR_NAME],
    [OUTSIDER_EMAIL, `Outsider ${SUFFIX}`],
  ]) {
    const request = await playwright.request.newContext({ baseURL });
    const signedUp = await request.post("/api/auth/sign-up/email", {
      headers: { origin: new URL("/", baseURL).origin },
      data: { email, password: PASSWORD, name },
    });
    expect(signedUp.ok(), `could not sign up ${email}`).toBe(true);
    await request.get("/en/today");
    await request.dispose();
    expect(
      psql(`select count(*) from public.users where email = '${email}'`),
      "the workspace did not create a Ranza user",
    ).toBe("1");
  }

  psql(
    `with org as (
       insert into public.organizations (id, name, status)
       values ('${ORGANIZATION}', 'E2E Export ${SUFFIX}', 'active') returning id
     ), sub as (
       insert into public.subscriptions (organization_id, status)
       select id, 'active' from org
     ), ent as (
       insert into public.entitlements (organization_id, module_key)
       select id, module from org, unnest(array['front_office', 'billing_folios']) as module
     ), prop as (
       insert into public.properties (id, organization_id, name)
       select '${PROPERTY}', id, 'E2E Export Property ${SUFFIX}' from org returning id
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select '${PROPERTY}', id, capability, true
         from org, unnest(array['front_desk', 'finance']) as capability
     ), made_role as (
       insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       select id, role.key, id, role.name, role.permissions
         from org, (values
           ('no_audit', 'No audit',
             array['data_export.create', 'data_export.read', 'front_desk.book']),
           ('auditor', 'Auditor',
             array['data_export.create', 'data_export.read', 'front_desk.book', 'audit.read']),
           ('outsider', 'Outsider', array['front_desk.book'])
         ) as role (key, name, permissions)
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select org.id, person.id,
            case person.email
              when '${EMAIL}' then 'owner'
              when '${NO_AUDIT_EMAIL}' then 'no_audit'
              when '${AUDITOR_EMAIL}' then 'auditor'
              else 'outsider'
            end,
            case when person.email = '${EMAIL}'
                 then '00000000-0000-0000-0000-000000000000'::uuid else org.id end,
            'organization_wide'
       from org, public.users as person
      where person.email in
        ('${EMAIL}', '${NO_AUDIT_EMAIL}', '${AUDITOR_EMAIL}', '${OUTSIDER_EMAIL}')`,
  );
  psql(
    `insert into public.guests (organization_id, full_name) values
       ('${ORGANIZATION}', '${GUEST}'), ('${ORGANIZATION}', '${FORMULA_GUEST}')`,
  );
});

/** The newest export of this run's Organization asked for by this person. */
function exportOf(email: string): string {
  const id = psql(
    `select export.id
       from public.data_exports as export
       join public.users as requester on requester.id = export.requester_id
      where export.organization_id = '${ORGANIZATION}' and requester.email = '${email}'
      order by export.requested_at desc limit 1`,
  );
  expect(id, `no export asked for by ${email}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

function stateOf(exportId: string): string {
  return psql(
    `select status || '|' || coalesce(error, '') from public.data_exports where id = '${exportId}'`,
  );
}

/** Opens the form, ticks the datasets (nothing is ticked to begin with) and asks. */
async function request(
  page: Page,
  datasets: RegExp[],
  options: { format?: "JSON"; range?: boolean } = {},
): Promise<void> {
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await page.getByRole("tab", { name: "Request an export" }).click();
  for (const dataset of datasets) {
    await page.getByRole("checkbox", { name: dataset }).click();
  }
  if (options.format) {
    await page.getByRole("radio", { name: new RegExp(options.format) }).check();
  }
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(
    page.getByText("Export requested. It appears below while it is prepared."),
  ).toBeVisible();
}

test("an owner requests an export, the worker makes it, and the file downloads", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, EMAIL);
  // Guests alone, so a plain CSV a spreadsheet opens at once.
  await request(page, [/Guests and residents/]);
  const exportId = exportOf(EMAIL);

  // A record with a requester and a state, before any worker has been near it.
  expect(
    psql(
      `select status || '|' || trigger_type || '|' || requester_name
              || '|' || array_to_string(resource_types, ',') || '|' || (file_content is null)::text
         from public.data_exports where id = '${exportId}'`,
    ),
  ).toBe(`pending|on_demand|${NAME}|residents_guests|true`);

  // Back on the list, pending, and by the name they signed up with.
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Pending");
  await expect(row).not.toContainText(EMAIL);
  await expect(row.getByRole("link", { name: "Download" })).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE, "export-pending.png") });

  // The worker goes round on its own timer, and is stopped as soon as this
  // export is ready. The page was not told, and finds out on its own too.
  const worker = startWorker();
  await whileWorking(
    worker,
    expect(row).toContainText("Ready", { timeout: WORKER_BUDGET_MS }),
  );
  expect(stateOf(exportId)).toBe("ready|");
  expect(worker.output()).not.toContain(`export ${exportId}`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    row.getByRole("link", { name: "Download" }).click(),
  ]);
  // Named for the Organization, what is in it and the day it was made.
  expect(download.suggestedFilename()).toMatch(
    /^e2e-export-[0-9a-f]{8}-guests-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const content = await readFile((await download.path())!, "utf8");

  // The Organization is this run's own, so the file is exactly its two
  // Guests under the header and nothing else.
  expect(content.startsWith("﻿id,full_name,email,phone,created_at\r\n")).toBe(
    true,
  );
  const lines = content.split("\r\n").filter((line) => line !== "");
  expect(lines).toHaveLength(3);
  expect(content).toContain(GUEST);
  // A guest whose name is a formula is text in the file.
  expect(content).toContain(`'${FORMULA_GUEST}`);
  expect(content).not.toContain(`,${FORMULA_GUEST},`);

  // The download is on the record, with who took it.
  expect(
    psql(
      `select count(*) from audit.records
        where action = 'data_export.downloaded' and subject_id = '${exportId}'`,
    ),
  ).toBe("1");
  await page.screenshot({ path: path.join(EVIDENCE, "export-ready.png") });

  // Another Staff Member, who may read exports: the same record, by the same
  // name, and the file.
  const colleagueContext = await browser.newContext({ baseURL: baseURL! });
  const colleague = await colleagueContext.newPage();
  try {
    await signIn(colleague, NO_AUDIT_EMAIL);
    await colleague.goto(`/en/data-export?property=${PROPERTY}`);
    const seen = colleague.getByRole("row").filter({ hasText: NAME });
    await expect(seen).toContainText("Ready");
    await expect(seen).not.toContainText(EMAIL);
    const [theirs] = await Promise.all([
      colleague.waitForEvent("download"),
      seen.getByRole("link", { name: "Download" }).click(),
    ]);
    expect(await readFile((await theirs.path())!, "utf8")).toBe(content);
  } finally {
    await colleagueContext.close();
  }

  // And one who may not: nothing in the list, and the file's address is the
  // answer a missing export gets.
  const outsiderContext = await browser.newContext({ baseURL: baseURL! });
  const outsider = await outsiderContext.newPage();
  try {
    await signIn(outsider, OUTSIDER_EMAIL);
    await outsider.goto(`/en/data-export?property=${PROPERTY}`);
    await expect(outsider.getByText(NAME)).toHaveCount(0);
    await expect(outsider.getByRole("link", { name: "Download" })).toHaveCount(
      0,
    );
    const direct = await outsider.request.get(
      `/api/data-export/${exportId}/download`,
    );
    expect(direct.status()).toBe(404);
  } finally {
    await outsiderContext.close();
  }
});

test("an export whose requester lost the right before the worker came fails, and says why", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, AUDITOR_EMAIL);
  // The audit log is the dataset this role may ask for only while it holds
  // audit.read.
  await request(page, [/Audit log/]);
  const exportId = exportOf(AUDITOR_EMAIL);
  expect(stateOf(exportId)).toBe("pending|");

  const row = page.getByRole("row").filter({ hasText: AUDITOR_NAME });
  await expect(row).toContainText("Pending");

  // The Organization takes audit.read from the role between the request and
  // the worker. Made as the table owner: a role is edited from the staff
  // screen, which is not what this spec is about.
  psql(
    `update public.staff_roles
        set permissions = array['data_export.create', 'data_export.read', 'front_desk.book']
      where organization_id = '${ORGANIZATION}' and key = 'auditor'`,
  );

  const worker = startWorker();
  await whileWorking(
    worker,
    expect(row).toContainText("Failed", { timeout: WORKER_BUDGET_MS }),
  );

  // A state with a reason, on the row, and no file anywhere.
  await expect(row).toContainText(
    "The requester can no longer export these datasets.",
  );
  await expect(row.getByRole("link", { name: "Download" })).toHaveCount(0);
  expect(stateOf(exportId)).toBe("failed|requester_not_permitted");
  expect(
    psql(
      `select (file_content is null)::text from public.data_exports where id = '${exportId}'`,
    ),
  ).toBe("true");
  // The worker said which export and why, in its own log.
  expect(worker.output()).toContain(
    `data_export.failed: export ${exportId} as requester_not_permitted`,
  );
  await page.screenshot({ path: path.join(EVIDENCE, "export-failed.png") });

  // The Owner sees the same failure on the same record, by the same name.
  const ownerContext = await browser.newContext({ baseURL: baseURL! });
  const owner = await ownerContext.newPage();
  try {
    await signIn(owner, EMAIL);
    await owner.goto(`/en/data-export?property=${PROPERTY}`);
    const seen = owner.getByRole("row").filter({ hasText: AUDITOR_NAME });
    await expect(seen).toContainText("Failed");
    await expect(seen).not.toContainText(AUDITOR_EMAIL);
  } finally {
    await ownerContext.close();
  }
});

/**
 * An export this run's owner asked for that is already ready, made as the
 * owner of the database makes one: the states are drawn by a trigger for every
 * role, so it walks pending, processing, ready. For a test that is about how a
 * finished export is shown and not about the worker that makes it.
 */
function aReadyExport(
  datasets: string[],
  counts: Record<string, number>,
): string {
  const id = psql(
    `with made as (
       insert into public.data_exports
         (organization_id, requester_id, requester_name, resource_types, format)
       select membership.organization_id, membership.user_id, '${NAME}',
              array[${datasets.map((dataset) => `'${dataset}'`).join(",")}], 'csv'
         from public.organization_memberships as membership
        where membership.organization_id = '${ORGANIZATION}'
          and membership.user_id = (select id from public.users where email = '${EMAIL}')
       returning id
     )
     select id from made`,
  );
  psql(
    `update public.data_exports set status = 'processing' where id = '${id}'`,
  );
  psql(
    `update public.data_exports
        set status = 'ready', file_name = 'ready-${id.slice(0, 8)}.csv',
            file_content = 'a,b', file_size_bytes = 3,
            record_counts = '${JSON.stringify(counts)}'::jsonb,
            completed_at = now(), expires_at = now() + interval '7 days'
      where id = '${id}'`,
  );
  return id;
}

const SCREENSHOTS = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-74",
);

test("the form opens with nothing ticked, says what an export holds and who can fetch it, and warns that several datasets in one CSV are stacked", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await page.getByRole("tab", { name: "Request an export" }).click();

  // Nothing is ticked, and the button waits for a choice.
  for (const checkbox of await page.getByRole("checkbox").all()) {
    await expect(checkbox).not.toBeChecked();
  }
  await expect(
    page.getByRole("button", { name: "Request export" }),
  ).toBeDisabled();

  // What an export holds, before it is asked for (DX-04), and what cannot leave (DX-07).
  await expect(
    page.getByText(
      /everything in the chosen datasets that you can read in E2E Export/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Not included: staff and payroll/)).toBeVisible();

  // No warning, no notice, until there is a choice.
  await expect(page.getByText(/This file will hold personal data/)).toHaveCount(
    0,
  );
  await page.getByRole("checkbox", { name: /Guests and residents/ }).click();
  await expect(
    page.getByText(/This file will hold personal data/),
  ).toBeVisible();
  await expect(
    page.getByText(/downloaded for 7 days by you, and by colleagues/),
  ).toBeVisible();
  await expect(page.getByText(/share one file/)).toHaveCount(0);

  // A second dataset in CSV is stacked in one file, and the form says so (DX-03).
  await page.getByRole("checkbox", { name: /Reservations and stays/ }).click();
  await expect(page.getByText(/share one file/)).toBeVisible();
  await page.getByText("JSON (structured)").click();
  await expect(page.getByText(/share one file/)).toHaveCount(0);

  // Rooms alone hold no personal data.
  await page.getByRole("checkbox", { name: /Guests and residents/ }).click();
  await page.getByRole("checkbox", { name: /Reservations and stays/ }).click();
  await page.getByRole("checkbox", { name: /Rooms and beds/ }).click();
  await expect(page.getByText(/This file will hold personal data/)).toHaveCount(
    0,
  );

  // A range that cuts nothing of what is chosen says so.
  await page.getByRole("button", { name: /^From/ }).click();
  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(page.getByText(/These dates cut nothing here/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Audit log/ }).click();
  await expect(page.getByText(/Days are read on the clock of /)).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS, "request-form.png"),
    fullPage: true,
  });

  // Focus is visible on the file types (DX-21): the card, not the hidden radio.
  await page.getByRole("radio", { name: /CSV/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /JSON/ })).toBeChecked();
  const ring = await page
    .locator("label", { has: page.getByRole("radio", { name: /JSON/ }) })
    .evaluate((label) => getComputedStyle(label).boxShadow);
  expect(ring).not.toBe("none");
});

test("a role sees the datasets it will not cover disabled with the permission they need, and a request its role loses between page and press says which dataset", async ({
  page,
}) => {
  await signIn(page, NO_AUDIT_EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await page.getByRole("tab", { name: "Request an export" }).click();

  const audit = page.getByRole("checkbox", { name: /Audit log/ });
  await expect(audit).toBeDisabled();
  await expect(
    page.getByText("Your role needs “Reading the audit log” to export this."),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Charges|Folios/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Rooms and beds/ }),
  ).toBeEnabled();

  // The role gains audit.read while the page is open, the person ticks it, and
  // it is taken away again before they press: the database refuses, and the
  // screen names the dataset and keeps what was ticked (RANZ-54).
  psql(
    `update public.staff_roles
        set permissions = array['data_export.create', 'data_export.read', 'front_desk.book', 'audit.read']
      where organization_id = '${ORGANIZATION}' and key = 'no_audit'`,
  );
  await page.reload();
  await page.getByRole("tab", { name: "Request an export" }).click();
  await page.getByRole("checkbox", { name: /Audit log/ }).click();
  psql(
    `update public.staff_roles
        set permissions = array['data_export.create', 'data_export.read', 'front_desk.book']
      where organization_id = '${ORGANIZATION}' and key = 'no_audit'`,
  );
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your role cannot export: Audit log." }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Audit log/ })).toBeChecked();
  expect(
    psql(
      `select count(*) from public.data_exports
        where organization_id = '${ORGANIZATION}' and 'audit_log' = any (resource_types)
          and requester_name = '${NO_AUDIT_NAME}'`,
    ),
  ).toBe("0");
});

test("a range is asked for, the worker cuts the audit log by it, and the file and the row say so", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);

  // One export for every date, one for a month long gone, each by the screen.
  await page.getByRole("tab", { name: "Request an export" }).click();
  await page.getByRole("checkbox", { name: /Audit log/ }).click();
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText(/^Export requested\./)).toBeVisible();
  const whole = exportOf(EMAIL);

  await page.getByRole("tab", { name: "Request an export" }).click();
  await page.getByRole("checkbox", { name: /Audit log/ }).click();
  await page.getByRole("button", { name: /^From/ }).click();
  await page.getByRole("button", { name: "Last month" }).click();
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText(/^Export requested\./)).toBeVisible();
  const cut = psql(
    `select id from public.data_exports
      where organization_id = '${ORGANIZATION}' and range_from is not null
      order by requested_at desc limit 1`,
  );
  expect(cut).not.toBe(whole);
  expect(
    psql(`select range_timezone from public.data_exports where id = '${cut}'`),
  ).toBe("Europe/Istanbul");

  const worker = startWorker();
  await whileWorking(
    worker,
    Promise.all([
      expect
        .poll(() => stateOf(cut), { timeout: WORKER_BUDGET_MS })
        .toBe("ready|"),
      expect
        .poll(() => stateOf(whole), { timeout: WORKER_BUDGET_MS })
        .toBe("ready|"),
    ]),
  );

  // Last month has no audit record of this run's Organization in it.
  expect(
    psql(
      `select record_counts->>'audit_log' from public.data_exports where id = '${cut}'`,
    ),
  ).toBe("0");
  expect(
    Number(
      psql(
        `select record_counts->>'audit_log' from public.data_exports where id = '${whole}'`,
      ),
    ),
  ).toBeGreaterThan(0);
  expect(
    psql(`select file_name from public.data_exports where id = '${cut}'`),
  ).toMatch(
    /^e2e-export-[0-9a-f]{8}-audit-log-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  await page.reload();
  const row = page.getByRole("row").filter({ hasText: /0 records/ });
  await expect(row).toContainText("Audit log");
  await expect(row.getByRole("link", { name: "Download" })).toBeVisible();
  await page.screenshot({
    path: path.join(SCREENSHOTS, "history-with-a-range.png"),
  });
});

test("an export that failed for size names the limits and what to do, and Request again starts from the same request", async ({
  page,
}) => {
  const id = psql(
    `with made as (
       insert into public.data_exports
         (organization_id, requester_id, requester_name, resource_types, format)
       select organization_id, user_id, '${NAME}', array['folios_payments', 'audit_log'], 'json'
         from public.organization_memberships
        where organization_id = '${ORGANIZATION}'
          and user_id = (select id from public.users where email = '${EMAIL}')
       returning id
     )
     select id from made`,
  );
  psql(
    `update public.data_exports
        set status = 'failed', error = 'too_large', completed_at = now()
      where id = '${id}'`,
  );

  await signIn(page, EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  const row = page.getByRole("row").filter({ hasText: "Too large to export" });
  await expect(row.first()).toContainText("100,000 rows");
  await expect(row.first()).toContainText("25 MB");
  await expect(row.first()).toContainText("choose a range of dates");
  await row.first().getByRole("button", { name: "Request again" }).click();

  // The form starts from that request: the same datasets and file type.
  await expect(
    page.getByRole("checkbox", { name: /Folios and payments/ }),
  ).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Audit log/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /JSON/ })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Guests and residents/ }),
  ).not.toBeChecked();
  await page.screenshot({
    path: path.join(SCREENSHOTS, "too-large-then-again.png"),
  });
});

test("a download that is no longer there sends the person back to the screen, which says why; a script gets a bare 404", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  const gone = randomUUID();
  await page.goto(
    `/api/data-export/${gone}/download?locale=en&property=${PROPERTY}`,
  );
  await expect(page).toHaveURL(
    /\/en\/data-export\?property=[0-9a-f-]+&unavailable=1/,
  );
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "That file is no longer available" }),
  ).toContainText("Files are kept for 7 days");

  const bare = await page.request.get(`/api/data-export/${gone}/download`);
  expect(bare.status()).toBe(404);
  const wrongLocale = await page.request.get(
    `/api/data-export/${gone}/download?locale=xx&property=${PROPERTY}`,
    { maxRedirects: 0 },
  );
  expect(wrongLocale.status()).toBe(404);
});

test("a role that may not read exports is told so, not that the Subscription lacks the module", async ({
  page,
}) => {
  await signIn(page, OUTSIDER_EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await expect(page.getByText(/Subscription/)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "History" })).toHaveCount(0);
});

for (const width of [375, 768]) {
  test(`the screen does not scroll sideways at ${width} px and the download is in reach, in English and Arabic`, async ({
    page,
  }) => {
    aReadyExport(["residents_guests", "audit_log"], {
      residents_guests: 120,
      audit_log: 1,
    });
    await signIn(page, EMAIL);
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "ar"]) {
      await page.goto(`/${locale}/data-export?property=${PROPERTY}`);
      const row = page.getByRole("row").filter({ hasText: NAME }).first();
      await expect(row).toBeVisible();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits, `${locale} at ${width}px scrolls sideways`).toBe(true);
      const download = row.getByRole("link").first();
      if ((await download.count()) > 0) {
        const box = await download.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      // The tabs wrap rather than push the page wide.
      await page.getByRole("tab").last().click();
      const stillFits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(stillFits, `${locale} form at ${width}px scrolls sideways`).toBe(
        true,
      );
      if (locale === "ar" && width === 375) {
        await page.getByRole("tab").nth(2).click();
        // The programs a CSV opens in are Latin names inside a right-to-left
        // line, each its own run (DX-18).
        await expect(page.locator("bdi[dir=ltr]")).toHaveCount(3);
        await page.screenshot({
          path: path.join(SCREENSHOTS, "request-form-arabic-375.png"),
        });
      }
    }
  });
}
