import { expect, test, type Page } from "@playwright/test";

import { messages } from "../../apps/operator-workspace/src/messages";
import { signIn, testProperty } from "./front-desk";
import { psql } from "./local-database";

/**
 * Moving between workspace pages, the way somebody at the desk does all day.
 *
 * Every link in the rail used to be a plain anchor, so every page switch was a
 * new document: the scripts ran again, the shell rendered again, and the client
 * cache was thrown away. Nothing failed — it was only slow — which is why this
 * asserts the document survives rather than timing anything.
 *
 * Two more things follow from the same client navigation. The selected
 * Property lives in the query string, and a link that dropped it would
 * move the viewer to another Property without the switcher. And the layout no
 * longer renders on a page switch, so an ended session is noticed by the page
 * or not at all.
 *
 * Watched go red before it was believed: with one rail link turned back into
 * an anchor the first test fails at the survival check, and with
 * `requireViewer` removed from Finance the second stays on Finance.
 */

async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { sameDocument?: boolean }).sameDocument = true;
  });
}

async function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as Window & { sameDocument?: boolean }).sameDocument === true,
  );
}

async function settled(page: Page): Promise<void> {
  // A navigation's budget rather than an assertion's: `next dev` compiles a
  // route the first time it is asked for, and here the asking is a click.
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, {
    timeout: 90_000,
  });
}

test("the rail moves between pages without a new document, and keeps the Property", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/en/today?property=${propertyId}`);
  await markDocument(page);

  for (const segment of ["finance", "people", "today"]) {
    await page
      .locator(`aside a[href="/en/${segment}?property=${propertyId}"]`)
      .first()
      .click();
    await expect(page).toHaveURL(`/en/${segment}?property=${propertyId}`);
    await settled(page);
    expect(await sameDocument(page), `${segment} reloaded the page`).toBe(true);
  }
});

test("a session ended while the workspace is open goes to sign in on the next page", async ({
  page,
  context,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/en/today?property=${propertyId}`);
  await settled(page);

  // This browser's session only — the seeded account may be signed in
  // elsewhere, and ending those is not this test's business.
  const cookie = (await context.cookies()).find((candidate) =>
    candidate.name.endsWith("session_token"),
  );
  expect(cookie, "no session cookie after signing in").toBeDefined();
  const [token] = decodeURIComponent(cookie!.value).split(".");
  expect(
    psql(
      `delete from public.auth_session where token = '${token}' returning 1`,
    ),
  ).toBe("1");

  await page
    .locator(`aside a[href="/en/finance?property=${propertyId}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  // Reached by a client-side redirect, so the sign-in page sets its own locale
  // too; it used to fall back to Turkish here.
  await expect(
    page.getByRole("heading", { name: messages.en.welcomeBack }),
  ).toBeVisible();
});

test("inner pages have a back button in the header bar with proper routing", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/en/today?property=${propertyId}`);
  await settled(page);

  // Today is the workspace root: no back button in header
  await expect(page.locator('header a[aria-label="Back"]')).toHaveCount(0);

  // Navigate to an inner page (audit log)
  await page.goto(`/en/audit-log?property=${propertyId}`);
  await settled(page);

  // Audit log has back button in header
  const backButton = page.locator('header a[aria-label="Back"]');
  await expect(backButton).toBeVisible();

  // Clicking back returns to Today preserving the active property
  await backButton.click();
  await settled(page);
  await expect(page).toHaveURL(`/en/today?property=${propertyId}`);

  // It is a link one level up in every language, never history: a detail view
  // goes to its list, keeping the Property.
  await page.goto(
    `/ar/finance?property=${propertyId}&folio=00000000-0000-4000-8000-000000000000`,
  );
  await settled(page);
  await expect(
    page.locator(`header a[aria-label="${messages.ar.back}"]`),
  ).toHaveAttribute("href", `/ar/finance?property=${propertyId}`);

  await page.goto(`/tr/rooms?property=${propertyId}`);
  await settled(page);
  await expect(
    page.locator(`header a[aria-label="${messages.tr.back}"]`),
  ).toHaveAttribute("href", `/tr/today?property=${propertyId}`);
});
