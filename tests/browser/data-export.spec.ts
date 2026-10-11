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

async function request(page: Page, datasets: RegExp[]): Promise<void> {
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await page.getByRole("button", { name: "New export" }).click();
  for (const dataset of datasets) {
    await page.getByRole("checkbox", { name: dataset }).click();
  }
  await page.getByRole("button", { name: "Request Export" }).click();
  await expect(
    page.getByText("Data export request created successfully."),
  ).toBeVisible();
}

test("an owner requests an export, the worker makes it, and the file downloads", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, EMAIL);
  // Guests are already ticked, with reservations; the file this checks is of
  // guests alone, so a plain CSV a spreadsheet opens at once.
  await request(page, [/Reservations/]);
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
  expect(download.suggestedFilename()).toMatch(/^export-[0-9a-f]{8}\.csv$/);
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
  // audit.read; ticked with the guests it starts with.
  await request(page, [/Audit Log/]);
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

test("an export the requester could not have asked for is refused at the form", async ({
  page,
}) => {
  await signIn(page, NO_AUDIT_EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);
  await page.getByRole("button", { name: "New export" }).click();
  await page.getByRole("checkbox", { name: /Audit Log/ }).click();
  await page.getByRole("button", { name: "Request Export" }).click();

  await expect(
    page.getByText("You may not request an export of these datasets."),
  ).toBeVisible();
  expect(
    psql(
      `select count(*) from public.data_exports
        where organization_id = '${ORGANIZATION}' and 'audit_log' = any (resource_types)
          and requester_name = '${NO_AUDIT_NAME}'`,
    ),
  ).toBe("0");
});
