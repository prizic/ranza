import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { PASSWORD, signIn } from "./front-desk";
import { psql } from "./local-database";

/**
 * The parts of the ledger screen the one-currency, two-entry run in
 * `ledger-screen.spec.ts` cannot show (ACC-S3-08): an Organization whose books
 * are empty, a journal longer than a page, and a ledger in more than one
 * currency and from more than one source.
 *
 * The books are append-only, so the shared browser Organization could not be
 * put back after seeding them; this spec brings an Organization of its own,
 * as `data-audit-ux.spec.ts` does, and writes its entries as the table owner
 * (the worker is the only writer in production, and the screen under test only
 * reads). Serial, because the first test reads the books before the second
 * fills them.
 */
test.describe.configure({ mode: "serial" });

const SUFFIX = randomUUID().slice(0, 8);
const OWNER_EMAIL = `e2e-ledger-owner-${SUFFIX}@example.test`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();
const PAGE_SIZE = 50;
const DOLLAR_ENTRIES = PAGE_SIZE + 5;
const LIRA_ENTRIES = 2;
const AMOUNT_EACH = 100;

/** Receivables after `entries` postings of `AMOUNT_EACH`, as the English screen writes it. */
function receivablesAfter(entries: number): string {
  return (entries * AMOUNT_EACH).toLocaleString("en", {
    minimumFractionDigits: 2,
  });
}

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const signedUp = await request.post("/api/auth/sign-up/email", {
    headers: { origin: new URL("/", baseURL!).origin },
    data: {
      email: OWNER_EMAIL,
      password: PASSWORD,
      name: "Ledger Paging Owner",
    },
  });
  expect(signedUp.ok(), `could not sign up ${OWNER_EMAIL}`).toBe(true);
  await request.get("/en/today");
  await request.dispose();

  psql(
    `with org as (
       insert into public.organizations (id, name, status)
       values ('${ORGANIZATION}', 'E2E Ledger ${SUFFIX}', 'active') returning id
     ), sub as (
       insert into public.subscriptions (organization_id, status)
       select id, 'active' from org
     ), ent as (
       insert into public.entitlements (organization_id, module_key)
       select id, module from org, unnest(array['front_office', 'billing_folios']) as module
     ), prop as (
       insert into public.properties (id, organization_id, name, timezone)
       select '${PROPERTY}', id, 'Ledger Paging Otel ${SUFFIX}', 'Europe/Istanbul' from org returning id
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select '${PROPERTY}', id, 'finance', true from org
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select org.id, person.id, 'owner',
            '00000000-0000-0000-0000-000000000000'::uuid, 'organization_wide'
       from org, public.users as person
      where person.email = '${OWNER_EMAIL}'`,
  );
  psql(`select finance.ensure_default_accounts('${ORGANIZATION}')`);
});

/**
 * `count` balanced entries of one source and currency, receivables against
 * other revenue, posted oldest first: the journal is read newest first by entry
 * number, so the last one posted is the first one shown.
 */
function seedEntries(
  sourceType: string,
  currency: string,
  count: number,
): void {
  psql(
    `with made as (
       insert into finance.journal_entries
         (organization_id, entry_date, currency, description, source_type, source_id)
       select '${ORGANIZATION}', current_date - (${count} - n), '${currency}',
              '${sourceType} ' || lpad(n::text, 2, '0'), '${sourceType}', gen_random_uuid()
         from generate_series(1, ${count}) as n
        order by n
       returning id, organization_id
     )
     insert into finance.journal_lines
       (organization_id, journal_entry_id, account_id, direction, amount_minor, line_number)
     select made.organization_id, made.id, account.id, leg.direction, ${AMOUNT_EACH * 100}, leg.position
       from made
       cross join (values ('debit', 1, '1200'), ('credit', 2, '4100'))
         as leg (direction, position, code)
       join finance.accounts as account
         on account.organization_id = made.organization_id and account.code = leg.code`,
  );
}

test("an Organization whose books are empty is told so, not shown a table", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/ledger?property=${PROPERTY}`);

  await expect(page.getByText("No entries yet")).toBeVisible();
  await expect(
    page.getByText(
      "Entries appear here after a charge or payment is posted to a Folio.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(0);
  // Nothing is filtered, so there is nothing to clear.
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(
    0,
  );
});

test("a journal longer than a page is read in pages, newest first, and the way back keeps what was chosen", async ({
  page,
}) => {
  seedEntries("e2e_dollar", "USD", DOLLAR_ENTRIES);
  seedEntries("e2e_lira", "TRY", LIRA_ENTRIES);
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/en/ledger?property=${PROPERTY}&currency=USD`);
  const rows = page.getByRole("row");
  // The header row and one full page; no way back to a newer page from the first.
  await expect(rows).toHaveCount(PAGE_SIZE + 1);
  await expect(page.getByRole("link", { name: "Newest entries" })).toHaveCount(
    0,
  );
  await expect(rows.nth(1)).toContainText(`e2e_dollar ${DOLLAR_ENTRIES}`);

  await page.getByRole("link", { name: "Older entries" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page).toHaveURL(/currency=USD/);
  // What is left, oldest last, and nothing older to ask for.
  await expect(rows).toHaveCount(DOLLAR_ENTRIES - PAGE_SIZE + 1);
  await expect(rows.last()).toContainText("e2e_dollar 01");
  await expect(page.getByRole("link", { name: "Older entries" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Newest entries" }).click();
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(page).toHaveURL(/currency=USD/);
  await expect(rows).toHaveCount(PAGE_SIZE + 1);
});

test("a ledger in two currencies from two sources offers both filters and each narrows the journal", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/ledger?property=${PROPERTY}`);

  await page.getByRole("combobox", { name: "Currency" }).click();
  await page.getByRole("option", { name: "TRY", exact: true }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/currency=TRY/);
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(LIRA_ENTRIES + 1);
  await expect(rows.filter({ hasText: "e2e_dollar" })).toHaveCount(0);

  await page.getByRole("link", { name: "Clear filters" }).click();
  await page.getByRole("combobox", { name: "Source" }).click();
  await page.getByRole("option", { name: "e2e_dollar", exact: true }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/source=e2e_dollar/);
  await expect(rows.filter({ hasText: "e2e_lira" })).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("e2e_dollar");
});

test("the Accounts tab shows one currency at a time and never adds two", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/ledger?property=${PROPERTY}&tab=accounts&currency=TRY`);
  const receivables = page.getByRole("row").filter({ hasText: "1200" });
  await expect(receivables).toContainText(receivablesAfter(LIRA_ENTRIES));

  await page.goto(`/en/ledger?property=${PROPERTY}&tab=accounts&currency=USD`);
  await expect(receivables).toContainText(receivablesAfter(DOLLAR_ENTRIES));
});
