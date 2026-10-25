import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { PASSWORD, signIn } from "./front-desk";
import { psql } from "./local-database";

/**
 * The audit log and the data export, read the way their users read them (the
 * 2026-10-24 UX audit, DATA-01 to DATA-15).
 *
 * The unit suites prove each sentence and each state on its own; this proves
 * what only a browser can: that the whole row opens the record, that a phone
 * gets a card rather than two columns, that a button which would only be
 * refused is not offered, that the reason for a disabled button sits beside it
 * on a phone, and that the Arabic screens carry the words and digits the
 * English ones do.
 *
 * Every state is seeded: a staging database had no export and no schedule, so
 * "running", "failed" and "expired" could not be looked at there. The worker
 * is not started; rows are written as the table owner with triggers off, the
 * way the integration suite seeds a due schedule.
 *
 * Each run brings its own Organization, so it needs nothing the seed makes.
 */
const SUFFIX = randomUUID().slice(0, 8);
const OWNER_EMAIL = `e2e-data-owner-${SUFFIX}@example.test`;
const OWNER_NAME = `Dilara Owner ${SUFFIX}`;
const FINANCE_EMAIL = `e2e-data-finance-${SUFFIX}@example.test`;
const FINANCE_NAME = `Fatma Finance ${SUFFIX}`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();
const PROPERTY_NAME = `Audit UX Otel ${SUFFIX}`;
const REASON_NOTE = `daha sessiz oda istedi ${SUFFIX}`;
const ARABIC_REASON = `تم تسجيل المبلغ بالخطأ ${SUFFIX}`;

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/data-audit",
);

const READY_BY_OWNER = randomUUID();
const READY_BY_FINANCE = randomUUID();
const FAILED_TOO_LARGE = randomUUID();
const EXPIRED = randomUUID();
const PENDING_SLOW = randomUUID();
const PROCESSING = randomUUID();
const SCHEDULE_OK = randomUUID();
const SCHEDULE_FAILING = randomUUID();
const SCHEDULE_NEW = randomUUID();

test.beforeAll(async ({ playwright, baseURL }) => {
  for (const [email, name] of [
    [OWNER_EMAIL, OWNER_NAME],
    [FINANCE_EMAIL, FINANCE_NAME],
  ]) {
    const request = await playwright.request.newContext({ baseURL });
    const signedUp = await request.post("/api/auth/sign-up/email", {
      headers: { origin: new URL("/", baseURL).origin },
      data: { email, password: PASSWORD, name },
    });
    expect(signedUp.ok(), `could not sign up ${email}`).toBe(true);
    await request.get("/en/today");
    await request.dispose();
  }

  psql(
    `with org as (
       insert into public.organizations (id, name, status)
       values ('${ORGANIZATION}', 'E2E Data ${SUFFIX}', 'active') returning id
     ), sub as (
       insert into public.subscriptions (organization_id, status)
       select id, 'active' from org
     ), ent as (
       insert into public.entitlements (organization_id, module_key)
       select id, module from org, unnest(array['front_office', 'billing_folios']) as module
     ), prop as (
       insert into public.properties (id, organization_id, name, timezone)
       select '${PROPERTY}', id, '${PROPERTY_NAME}', 'Europe/Istanbul' from org returning id
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select '${PROPERTY}', id, capability, true
         from org, unnest(array['front_desk', 'finance']) as capability
     ), made_role as (
       insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       select id, 'finance_desk', id, 'Finance desk',
              array['data_export.create', 'data_export.read', 'audit.read', 'front_desk.book', 'finance.manage_folio']
         from org
     ), made as (
       insert into public.organization_memberships
         (organization_id, user_id, role, role_scope_id, access_scope)
       select org.id, person.id,
              case person.email when '${OWNER_EMAIL}' then 'owner' else 'finance_desk' end,
              case person.email
                when '${OWNER_EMAIL}' then '00000000-0000-0000-0000-000000000000'::uuid
                else org.id end,
              case person.email
                when '${OWNER_EMAIL}' then 'organization_wide'
                else 'assigned_properties' end
         from org, public.users as person
        where person.email in ('${OWNER_EMAIL}', '${FINANCE_EMAIL}')
       returning 1
     )
     insert into public.property_assignments (property_id, organization_id, user_id)
     select '${PROPERTY}', org.id, person.id
       from org, public.users as person
      where person.email = '${FINANCE_EMAIL}'`,
  );

  seedAuditRecords();
  seedExports();
});

function userId(email: string): string {
  return psql(`select id from public.users where email = '${email}'`);
}

function seedAuditRecords(): void {
  const owner = userId(OWNER_EMAIL);
  const finance = userId(FINANCE_EMAIL);
  const folio = randomUUID();
  const stay = randomUUID();
  const record = (
    actor: string,
    action: string,
    subjectType: string,
    subjectId: string,
    minutesAgo: number,
    reason: string | null,
    context: string,
  ) =>
    `('${ORGANIZATION}', '${PROPERTY}', '${actor}', '${action}', '${subjectType}',
      '${subjectId}', now() - interval '${minutesAgo} minutes',
      ${reason === null ? "null" : `'${reason}'`}, '${context}'::jsonb)`;
  psql(
    `insert into audit.records
       (organization_id, location_id, actor_id, action, subject_type, subject_id,
        occurred_at, reason, context)
     values
       ${record(owner, "folio.payment_posted", "folio", folio, 5, null, '{"lineId":"6c80f7c9-1111-4222-8333-444455556666","amountMinor":-273500,"currency":"TRY","description":"Cash at the desk","paymentMethod":"cash"}')},
       ${record(owner, "stay.moved", "stay", stay, 10, `guest_request: ${REASON_NOTE}`, '{"reasonKind":"guest_request"}')},
       ${record(owner, "stay.checked_out", "stay", stay, 15, null, '{"balanceMinor":"0","currency":"TRY","folioClosed":true,"earlyDeparture":false,"nightsCharged":2}')},
       ${record(finance, "folio.line_reversed", "folio", folio, 20, ARABIC_REASON, '{"amountMinor":-50000,"currency":"TRY","description":"Minibar"}')},
       ${record(finance, "folio.line_reversed", "folio", folio, 25, null, '{"amountMinor":-1000,"currency":"TRY"}')}`,
  );
}

function seedExports(): void {
  const owner = userId(OWNER_EMAIL);
  const finance = userId(FINANCE_EMAIL);
  const exportRow = (
    id: string,
    requester: string,
    name: string,
    status: string,
    extras: {
      error?: string;
      scheduleId?: string;
      minutesAgo?: number;
    } = {},
  ) => {
    const finished = ["ready", "failed", "expired"].includes(status);
    const ready = status === "ready";
    return `('${id}', '${ORGANIZATION}', '${requester}', '${name}',
      array['folios_payments'], 'csv', '${status}',
      ${extras.scheduleId ? "'scheduled'" : "'on_demand'"},
      ${extras.scheduleId ? `'${extras.scheduleId}'` : "null"},
      ${ready ? "'folios.csv', 2048, 'id,amount', now() + interval '6 days'" : "null, null, null, null"},
      ${extras.error ? `'${extras.error}'` : "null"},
      now() - interval '${extras.minutesAgo ?? 30} minutes',
      ${finished ? `now() - interval '${(extras.minutesAgo ?? 30) - 1} minutes'` : "null"})`;
  };
  psql(
    `set local session_replication_role = replica;
     insert into public.export_schedules
       (id, organization_id, created_by, created_by_name, name, resource_types,
        format, frequency, status, last_run_at, next_run_at)
     values
       ('${SCHEDULE_OK}', '${ORGANIZATION}', '${owner}', '${OWNER_NAME}', 'Weekly accounting',
        array['folios_payments'], 'csv', 'weekly', 'active', now() - interval '2 hours', now() + interval '6 days'),
       ('${SCHEDULE_FAILING}', '${ORGANIZATION}', '${owner}', '${OWNER_NAME}', 'Nightly folios',
        array['folios_payments'], 'csv', 'daily', 'active', now() - interval '3 hours', now() + interval '20 hours'),
       ('${SCHEDULE_NEW}', '${ORGANIZATION}', '${owner}', '${OWNER_NAME}', 'Monthly audit',
        array['audit_log'], 'json', 'monthly', 'active', null, now() + interval '3 days');
     insert into public.data_exports
       (id, organization_id, requester_id, requester_name, resource_types, format, status,
        trigger_type, schedule_id, file_name, file_size_bytes, file_content, expires_at,
        error, requested_at, completed_at)
     values
       ${exportRow(READY_BY_OWNER, owner, OWNER_NAME, "ready", { minutesAgo: 120, scheduleId: SCHEDULE_OK })},
       ${exportRow(READY_BY_FINANCE, finance, FINANCE_NAME, "ready", { minutesAgo: 90 })},
       ${exportRow(FAILED_TOO_LARGE, owner, OWNER_NAME, "failed", { minutesAgo: 180, error: "too_large", scheduleId: SCHEDULE_FAILING })},
       ${exportRow(EXPIRED, owner, OWNER_NAME, "expired", { minutesAgo: 60 * 24 * 9 })},
       ${exportRow(PENDING_SLOW, finance, FINANCE_NAME, "pending", { minutesAgo: 12 })},
       ${exportRow(PROCESSING, owner, OWNER_NAME, "processing", { minutesAgo: 1 })}`,
  );
}

/**
 * `page.goto` straight after a sign-in can fail with ERR_ABORTED while the
 * sign-in's own redirect is still settling; leaving through a blank page first
 * gives the navigation nothing to abort.
 */
async function open(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

test("audit log: money, reasons and the clock read as words, and the whole row opens its record", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `/en/audit-log?property=${PROPERTY}`);

  // DATA-08: the header names the Property whose clock it is, not an IANA id.
  const header = page.getByRole("columnheader", { name: /^When/ });
  await expect(header).toHaveText(`When (${PROPERTY_NAME} time)`);
  await expect(page.locator("body")).not.toContainText("Europe/Istanbul");

  // DATA-02: a payment is money received.
  const payment = page.getByRole("row").filter({ hasText: "Payment posted" });
  await expect(payment).toContainText(/2,735\.00/);
  expect(await payment.textContent()).not.toMatch(/-\s?(TRY|₺)?\s?2,735/);

  // DATA-05: the reason kind is a sentence, not a code.
  const moved = page.getByRole("row").filter({ hasText: REASON_NOTE });
  await expect(moved).toContainText(`The Guest asked: ${REASON_NOTE}`);
  await expect(page.locator("body")).not.toContainText("guest_request");

  // DATA-04: a record that needs no reason does not say so in every row; one
  // that needed a reason and has none does.
  const checkedOut = page.getByRole("row").filter({ hasText: "Checked out" });
  // The words stay for a screen reader and are not on the screen.
  await expect(checkedOut.getByText("No reason required")).toHaveClass(
    /sr-only/,
  );
  const hidden = await checkedOut.getByText("No reason required").boundingBox();
  expect(hidden?.width).toBeLessThanOrEqual(1);
  const missing = page
    .getByRole("row")
    .filter({ hasText: "No reason recorded" });
  await expect(missing).toHaveCount(1);
  await page.screenshot({ path: path.join(EVIDENCE, "audit-list-1440.png") });

  // DATA-03: pressing anywhere in the row, the Why cell here, opens the record.
  // The link stretched over the row takes the press, which is the point:
  // force skips the check that something else is on top.
  await moved.getByText(REASON_NOTE).click({ force: true });
  await expect(page).toHaveURL(/record=/);

  // The record: the clock is named under the time, and DATA-01: every row of
  // the details has a name and the balance a currency.
  await expect(page.getByText(`${PROPERTY_NAME} time`)).toBeVisible();
  await page.goBack();
  await checkedOut.getByRole("link", { name: "Checked out" }).click();
  await expect(page.getByText("Nights charged at check-out")).toBeVisible();
  const balance = page
    .getByRole("row")
    .filter({ hasText: "Balance at closing" });
  await expect(balance).toContainText(/TRY\s?0\.00/);
  await expect(page.locator("body")).not.toContainText("nightsCharged");
  await page.screenshot({ path: path.join(EVIDENCE, "audit-record-1440.png") });
});

test("audit log: a phone gets a card per record, with who, where and why", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, `/en/audit-log?property=${PROPERTY}`);

  const moved = page.getByRole("row").filter({ hasText: REASON_NOTE });
  await expect(moved).toBeVisible();
  await expect(moved.locator('[data-label="Who"]')).toBeVisible();
  await expect(moved.locator('[data-label="Why"]')).toContainText(REASON_NOTE);
  await expect(page.getByRole("columnheader", { name: /^When/ })).toBeHidden();
  await noSidewaysScroll(page);
  await page.screenshot({ path: path.join(EVIDENCE, "audit-list-375.png") });

  await moved.getByText(REASON_NOTE).click({ force: true });
  await expect(page).toHaveURL(/record=/);
});

test("audit log in Arabic: a correction reads with its actor and its reason as written, and no zone id", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `/ar/audit-log?property=${PROPERTY}`);

  const correction = page.getByRole("row").filter({ hasText: ARABIC_REASON });
  await expect(correction).toBeVisible();
  await expect(correction).toContainText(FINANCE_EMAIL);
  const heading = page.getByRole("columnheader").first();
  await expect(heading).toContainText(PROPERTY_NAME);
  await expect(page.locator("body")).not.toContainText("Europe/");
  // A reversal keeps its sign: it says which way the money went.
  expect(await correction.textContent()).toMatch(/[-−]/);
  const payment = page.getByRole("row").filter({ hasText: /2,735|٢٬٧٣٥/ });
  expect(await payment.first().textContent()).not.toMatch(/[-−]\s?2,735/);
  await page.screenshot({ path: path.join(EVIDENCE, "audit-list-ar.png") });
});

test("data export: a file that is not the reader's to take is not offered, and a schedule says how it last ran", async ({
  page,
}) => {
  await signIn(page, FINANCE_EMAIL);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, `/en/data-export?property=${PROPERTY}`);

  // DATA-10: the colleague's ready file is named as theirs; one's own has the
  // button.
  const own = page
    .getByRole("row")
    .filter({ hasText: FINANCE_NAME })
    .filter({ hasText: "Ready" });
  const theirs = page.getByRole("row").filter({
    hasText: `Only ${OWNER_NAME}, or someone whose role reaches every Property`,
  });
  await expect(theirs).toHaveCount(1);
  await expect(theirs.getByRole("link", { name: "Download" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(1);
  await expect(own.getByRole("link", { name: "Download" })).toBeVisible();
  await expect(
    page.getByText("Too large to export", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Expired", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "export-history.png") });

  // DATA-11: each schedule says how its last run ended.
  await page.getByRole("tab", { name: "Schedules" }).click();
  const ok = page.getByRole("row").filter({ hasText: "Weekly accounting" });
  await expect(ok).toContainText("Last run:");
  await expect(ok).toContainText("Ready");
  const failing = page.getByRole("row").filter({ hasText: "Nightly folios" });
  await expect(failing).toContainText("Failed");
  await expect(failing).toContainText("Too large to export");
  const fresh = page.getByRole("row").filter({ hasText: "Monthly audit" });
  await expect(fresh).toContainText("Not run yet");
  await page.screenshot({ path: path.join(EVIDENCE, "export-schedules.png") });

  // The way from a schedule's last run to that run in History.
  await ok.getByRole("button", { name: "Show in History" }).click();
  await expect(
    page.getByRole("tab", { name: /History|Exports/ }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('tr[aria-current="true"]')).toHaveCount(1);
});

test("data export: the reason a button is off sits beside it on a phone, and the form names the clock", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, `/en/data-export?property=${PROPERTY}`);
  await page.getByRole("tab", { name: "Request an export" }).click();

  // DATA-12: the sentence and the button are one screen apart at most.
  const button = page.getByRole("button", { name: "Request export" });
  const why = page.getByText("Choose a dataset first.");
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeDisabled();
  await expect(why).toBeVisible();
  await expect(why).toBeInViewport();
  await expect(button).toBeInViewport();
  await expect(button).toHaveAttribute(
    "aria-describedby",
    "export-request-why-not",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "export-button-reason-375.png"),
  });

  // DATA-13: a range of days names the clock it is read on.
  await page
    .getByRole("checkbox", { name: /Payments and folios|Folios/ })
    .click();
  await page.getByRole("button", { name: /^From/ }).click();
  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(
    page.getByText(
      `Days are read on the clock of ${PROPERTY_NAME} (UTC+03:00 today)`,
    ),
  ).toBeVisible();
  await expect(button).toBeEnabled();
  await noSidewaysScroll(page);
  await page
    .getByText(`Days are read on the clock of ${PROPERTY_NAME}`)
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE, "export-clock-375.png") });
});

test("data export in Arabic: the form's numbers are the digits the rest of the page uses", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, `/ar/data-export?property=${PROPERTY}`);
  await page.getByRole("tab", { name: "طلب تصدير" }).click();
  const form = page.locator("main");
  await expect(form).toBeVisible();
  const text = (await form.innerText()) ?? "";
  expect(text).not.toMatch(/[٠-٩۰-۹٫٬]/);
  expect(text).toMatch(/5000/);
});
