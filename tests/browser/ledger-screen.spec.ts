import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import {
  anArrivalToday,
  aStaffMember,
  EMAIL,
  OWNER_EMAIL,
  signIn,
  testProperty,
} from "./front-desk";
import { aFreshProperty } from "./fresh-property";
import { checkIn, openFolioOf, postCharge, reverseLine } from "./folio-ui";
import { psql } from "./local-database";
import { startWorker, WORKER_BUDGET_MS, whileWorking } from "./worker";

/**
 * The ledger screen (ACC-S3-*): the books a Folio line posts to, read.
 *
 * The entries are not seeded. The ledger is written by the worker alone, so a
 * charge and its reversal are posted on the Folio's own screen and the real
 * worker is run until both entries exist (as `ledger.spec.ts` does), and the
 * screen is then read as the people who may and may not open it. Everything
 * after the first test reads what that one made, so the tests run in order.
 *
 * The organization the browser tests share holds entries other specs posted, so
 * nothing here counts rows: it looks for this run's own by their description.
 */
test.describe.configure({ mode: "serial" });

const description = `Spa treatment ${randomUUID().slice(0, 8)}`;
const reason = `Booked for the wrong Guest ${randomUUID().slice(0, 8)}`;
let chargeEntryId = "";
let accountId1200 = "";

function organizationOf(propertyId: string): string {
  return psql(
    `select organization_id from public.properties where id = '${propertyId}'`,
  );
}

/** Every destination the role is offered, in the sidebar or the page bar's chips. */
async function railHrefs(page: Page): Promise<string[]> {
  const sidebar = page.locator("aside nav");
  if ((await sidebar.count()) === 0) {
    const chips = page.locator("header nav a[href]:visible");
    await expect(chips.first()).toBeVisible();
    return chips.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  }
  await expect(sidebar).toBeVisible();
  for (const group of await sidebar
    .locator('button[aria-expanded="false"]')
    .all()) {
    await group.click();
  }
  return sidebar
    .locator("a[href]")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
}

test("a charge and its reversal reach the books, and the Owner reads both on the ledger", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  // The posting, as a person does it.
  await signIn(page, EMAIL);
  await checkIn(page, propertyId, guestName);
  const folioId = openFolioOf(guestName);
  await postCharge(page, propertyId, folioId, description, "250.00");
  await reverseLine(page, description, reason);
  const chargeLineId = psql(
    `select id from public.folio_lines
      where folio_id = '${folioId}' and line_type = 'charge' and description = '${description}'`,
  );
  const entriesOfThisRun = `select count(*) from finance.journal_entries
      where source_type = 'folio_line'
        and source_id in ('${chargeLineId}',
          (select id from public.folio_lines where reverses_line_id = '${chargeLineId}'))`;

  const worker = startWorker();
  await whileWorking(
    worker,
    expect
      .poll(() => psql(entriesOfThisRun), { timeout: WORKER_BUDGET_MS })
      .toBe("2"),
  );

  const organizationId = organizationOf(propertyId);
  chargeEntryId = psql(
    `select id from finance.journal_entries where source_id = '${chargeLineId}'`,
  );
  accountId1200 = psql(
    `select id from finance.accounts
      where organization_id = '${organizationId}' and code = '1200'`,
  );

  // The Owner reaches every Property, so the rail offers the Ledger and the
  // journal shows both entries, newest first.
  await page.context().clearCookies();
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/en/today?property=${propertyId}`);
  expect(
    (await railHrefs(page)).map((href) => href.replace(/\?.*$/, "")),
  ).toContain("/en/ledger");

  await page.goto(`/en/ledger?property=${propertyId}`);
  await expect(
    page.getByText(
      "Entries are posted a moment after a charge or payment is recorded on a Folio.",
    ),
  ).toBeVisible();
  const charge = page.getByRole("row").filter({ hasText: description });
  const reversal = page.getByRole("row").filter({ hasText: reason });
  await expect(charge).toBeVisible();
  await expect(reversal).toBeVisible();
  await expect(charge).toContainText("250.00");
  await expect(reversal).toContainText("250.00");
  await expect(
    charge.getByRole("link", { name: "Folio line" }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/en/finance\\?property=${propertyId}&folio=${folioId}`),
  );
});

test("an entry opens as its own page with balanced lines, a Folio link and a way back that keeps the filters", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/ledger?property=${propertyId}&account=${accountId1200}`);

  await page
    .getByRole("row")
    .filter({ hasText: description })
    .getByRole("link", { name: description })
    .click();
  await expect(page).toHaveURL(new RegExp(`entry=${chargeEntryId}`));
  await expect(
    page.getByRole("heading", { name: /^Entry \d+$/ }),
  ).toBeVisible();

  // Receivables debited and Other revenue credited, the same amount each way.
  const lines = page.getByRole("row");
  await expect(lines.filter({ hasText: "1200" })).toContainText("250.00");
  await expect(lines.filter({ hasText: "4100" })).toContainText("250.00");
  await expect(page.getByText(/Debits equal credits/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the Folio" }),
  ).toHaveAttribute("href", /\/en\/finance\?property=.+&folio=.+/);

  // The page bar's back button returns to the list the reader came from, with
  // the account they had chosen (ADR 0035).
  const back = page.locator('header a[aria-label="Back"]');
  await expect(back).toHaveAttribute("href", /account=/);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`account=${accountId1200}`));
  await expect(page).not.toHaveURL(/entry=/);
  await expect(
    page.getByRole("row").filter({ hasText: description }),
  ).toBeVisible();
});

test("an entry that is not there says so, and a filter that matches nothing says that", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/en/ledger?property=${propertyId}&entry=${randomUUID()}`);
  await expect(page.getByText("That entry isn't here")).toBeVisible();

  await page.goto(
    `/en/ledger?property=${propertyId}&from=2000-01-01&to=2000-01-02`,
  );
  await expect(page.getByText("No entries match")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
});

test("the Accounts tab shows the chart with its balances in one currency", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/ledger?property=${propertyId}`);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL(/tab=accounts/);

  const receivables = page.getByRole("row").filter({ hasText: "1200" });
  await expect(receivables).toContainText("Guest receivables");
  await expect(page.getByRole("row").filter({ hasText: "4100" })).toContainText(
    "Other revenue",
  );
  await expect(
    page.getByText(/Different currencies are never added together/),
  ).toBeVisible();
});

test("the ledger reads in Turkish and in Arabic, mirrored", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/tr/ledger?property=${propertyId}`);
  await expect(page.getByRole("link", { name: "Yevmiye" })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: description }),
  ).toBeVisible();

  await page.goto(`/ar/ledger?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("link", { name: "اليومية" })).toBeVisible();
  await page.getByRole("link", { name: "الحسابات", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "ذمم النزلاء المدينة" }),
  ).toBeVisible();
});

test("a role that reaches only some Properties is not offered the ledger and is told why at its address (ACC-S3-01)", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  // Finance holds finance.view_ledger but reaches only the Properties assigned
  // to it, and an entry carries no Property to narrow to.
  const { email } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "finance",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);
  await page.goto(`/en/today?property=${propertyId}`);
  expect(
    (await railHrefs(page)).map((href) => href.replace(/\?.*$/, "")),
  ).not.toContain("/en/ledger");

  await page.goto(`/en/ledger?property=${propertyId}`);
  await expect(
    page.getByRole("heading", {
      name: "The ledger needs the whole Organization",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: description }),
  ).toHaveCount(0);
});

test("a role without the permission is refused for the permission even with the whole Organization's reach (ACC-S3-01)", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  const { email, userId } = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );
  psql(
    `update public.organization_memberships set access_scope = 'organization_wide'
      where user_id = '${userId}'`,
  );
  await signIn(page, email);
  await page.goto(`/en/ledger?property=${propertyId}`);
  await expect(
    page.getByRole("heading", { name: "Your role can't open this page" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: description }),
  ).toHaveCount(0);
});

test("a Folio at a Property where the Folio screen is closed is named and not linked (ACC-S3-06)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const propertyId = testProperty();
  // Another Property keeps Folio finance on, so the Organization's ledger is
  // still readable while the Property the charge was posted at has it off.
  const elsewhere = aFreshProperty("ledger folio link", {
    capabilities: ["today", "finance"],
  });
  const financeAt = (enabled: boolean) =>
    psql(
      `update public.property_capabilities set enabled = ${enabled}
        where property_id = '${propertyId}' and capability_key = 'finance'`,
    );
  await signIn(page, OWNER_EMAIL);

  financeAt(false);
  try {
    await page.goto(`/en/ledger?property=${elsewhere.propertyId}`);
    const row = page.getByRole("row").filter({ hasText: description });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Folio line" })).toHaveCount(0);

    await page.goto(
      `/en/ledger?property=${elsewhere.propertyId}&entry=${chargeEntryId}`,
    );
    await expect(
      page.getByRole("heading", { name: /^Entry \d+$/ }),
    ).toBeVisible();
    await expect(
      page.getByText("The Folio this came from isn't one you can open."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open the Folio" }),
    ).toHaveCount(0);
  } finally {
    financeAt(true);
  }
});
