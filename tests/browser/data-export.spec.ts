import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { PASSWORD, signIn } from "./front-desk";
import { psql, WORKER_DATABASE_URL } from "./local-database";

/**
 * Data export, through the screen an Organization actually uses (RANZ-48,
 * ADR 0043).
 *
 * The pgTAP suite proves the grants, the policies and the readers, and the
 * integration suite proves a request becoming a file. This proves the part
 * neither can see: that the form posts what the server action wants, that the
 * list shows the export as pending and then as ready *without* the page being
 * told to reload, that the file a browser saves is the file the worker made,
 * and that the person asking is shown by name rather than by address.
 *
 * The worker is a process of its own and nothing here starts one, so the test
 * builds `apps/worker` and runs it, as a deployment does: a request is not a
 * file until the worker has been round, and the first thing this proves is that
 * the one a deployment runs boots with the export job in it and makes the file.
 *
 * Each run brings its own Organization, so it needs nothing the seed makes and
 * leaves nothing in anybody else's way. An export is a record and is never
 * deleted, so these accumulate, as every other suite's rows do.
 */
const SUFFIX = randomUUID().slice(0, 8);
const EMAIL = `e2e-export-${SUFFIX}@example.test`;
const NAME = `Export Tester ${SUFFIX}`;
// A colleague whose role exports but cannot read the audit log.
const NO_AUDIT_EMAIL = `e2e-export-noaudit-${SUFFIX}@example.test`;
const GUEST = `Zelda Exportable ${SUFFIX}`;
const FORMULA_GUEST = `=1+1 ${SUFFIX}`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();

const ROOT = path.resolve(__dirname, "../..");
let worker: ChildProcess | undefined;
const workerLog: string[] = [];

test.beforeAll(async ({ playwright, baseURL }) => {
  // Made the way `db:seed:dev` makes a Staff Member: through the application's
  // own sign-up route, because the provider-subject mapping belongs to it
  // (ADR 0005). One authenticated request then maps the subject onto a Ranza
  // user, which is who a membership is given to. A context of its own for each
  // person, so one's session is not the other's.
  for (const [email, name] of [
    [EMAIL, NAME],
    [NO_AUDIT_EMAIL, `No Audit ${SUFFIX}`],
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
       select id, 'no_audit', id, 'No audit',
              array['data_export.create', 'data_export.read', 'front_desk.book']
         from org
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select org.id, person.id,
            case when person.email = '${EMAIL}' then 'owner' else 'no_audit' end,
            case when person.email = '${EMAIL}'
                 then '00000000-0000-0000-0000-000000000000'::uuid else org.id end,
            'organization_wide'
       from org, public.users as person
      where person.email in ('${EMAIL}', '${NO_AUDIT_EMAIL}')`,
  );
  psql(
    `insert into public.guests (organization_id, full_name) values
       ('${ORGANIZATION}', '${GUEST}'), ('${ORGANIZATION}', '${FORMULA_GUEST}')`,
  );

  const built = spawnSync("pnpm", ["--filter", "@ranza/worker", "build"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  expect(built.status, `building the worker failed:\n${built.stderr}`).toBe(0);
  worker = spawn("node", ["apps/worker/dist/main.mjs"], {
    cwd: ROOT,
    env: { ...process.env, WORKER_DATABASE_URL },
  });
  worker.stdout?.on("data", (chunk: Buffer) => workerLog.push(String(chunk)));
  worker.stderr?.on("data", (chunk: Buffer) => workerLog.push(String(chunk)));
});

test.afterAll(() => {
  worker?.kill("SIGTERM");
});

test("an owner requests an export, the worker makes it, and the file downloads", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await page.goto(`/en/data-export?property=${PROPERTY}`);

  await page.getByRole("button", { name: "New export" }).click();
  // Guests are already ticked, with reservations; the file this checks is of
  // guests alone, so a plain CSV a spreadsheet opens at once.
  await page.getByRole("checkbox", { name: /Reservations/ }).click();
  await page.getByRole("button", { name: "Request Export" }).click();
  await expect(page.getByText("Data export request created successfully.")).toBeVisible();

  // Back on the list, pending, and by the name they signed up with.
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Pending");
  await expect(row).not.toContainText(EMAIL);
  await expect(row.getByRole("link", { name: "Download" })).toHaveCount(0);

  // The worker goes round, on its own timer. The page was not told, and finds
  // out on its own too.
  await expect(row, `the worker said:\n${workerLog.join("")}`).toContainText(
    "Ready",
    { timeout: 60_000 },
  );
  expect(workerLog.join("")).not.toContain("data_export.failed");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    row.getByRole("link", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^export-[0-9a-f]{8}\.csv$/);
  const content = await readFile((await download.path())!, "utf8");

  expect(content.startsWith("﻿id,full_name,email,phone,created_at\r\n")).toBe(true);
  expect(content).toContain(GUEST);
  // A guest whose name is a formula is text in the file.
  expect(content).toContain(`'${FORMULA_GUEST}`);

  // The download is on the record, with who took it.
  expect(
    psql(
      `select count(*) from audit.records
        where action = 'data_export.downloaded' and context->>'format' = 'csv'
          and organization_id = '${ORGANIZATION}'`,
    ),
  ).toBe("1");
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
        where organization_id = '${ORGANIZATION}' and 'audit_log' = any (resource_types)`,
    ),
  ).toBe("0");
});
