import { expect, test, type Page } from "@playwright/test";

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
});
