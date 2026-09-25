import { expect, test, type Page } from "@playwright/test";

import { messages } from "../../apps/operator-workspace/src/messages";
import { signIn, testProperty } from "./front-desk";

/**
 * A page reached through the rail speaks the language of its URL.
 *
 * Moving between pages is a client navigation: Next renders the new page and
 * leaves the layouts above it as they were. The root layout used to be the only
 * place a request's locale was set, so a page reached that way fell back to
 * Turkish — the default — on /en and /ar, while the client-rendered parts
 * around it (the rail, the page bar, the table headers) stayed in the right
 * language. Nothing failed; the page was simply half translated.
 *
 * Each page's own server-rendered copy is taken from the catalogue rather than
 * restated, and the other two languages' version of it must be absent. Turkish
 * is run as well, although it cannot fail this way: it is the fallback.
 *
 * Watched go red before it was believed: on main before the fix, /en and /ar
 * failed at the first click, Finance reading "Folyolar —".
 */

type Locale = keyof typeof messages;
type Catalogue = (typeof messages)[Locale];

const LOCALES: readonly Locale[] = ["en", "tr", "ar"];

// One string per destination that its page renders on the server.
const DESTINATIONS: readonly {
  segment: string;
  copy: (catalogue: Catalogue) => string;
}[] = [
  { segment: "finance", copy: (catalogue) => catalogue.foliosAt },
  { segment: "people", copy: (catalogue) => catalogue.staff.screenSummary },
  { segment: "audit-log", copy: (catalogue) => catalogue.auditLogFor },
  // Not `property`: the test Property is named "E2E Test Property", so the
  // English label would be found in Turkish and Arabic pages as data.
  { segment: "today", copy: (catalogue) => catalogue.organization },
];

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

for (const locale of LOCALES) {
  test(`a page reached through the rail on /${locale} is in that language`, async ({
    page,
  }) => {
    const propertyId = testProperty();
    await signIn(page);
    await page.goto(`/${locale}/today?property=${propertyId}`);
    await markDocument(page);

    const main = page.locator("main");
    for (const { segment, copy } of DESTINATIONS) {
      await page
        .locator(`aside a[href="/${locale}/${segment}?property=${propertyId}"]`)
        .first()
        .click();
      await expect(page).toHaveURL(
        `/${locale}/${segment}?property=${propertyId}`,
      );
      // A navigation's budget rather than an assertion's: `next dev` compiles
      // a route the first time it is asked for, and here the asking is a click.
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0, {
        timeout: 90_000,
      });

      await expect(main, `${segment} on /${locale}`).toContainText(
        copy(messages[locale]),
      );
      for (const other of LOCALES) {
        const foreign = copy(messages[other]);
        if (other === locale || copy(messages[locale]).includes(foreign))
          continue;
        await expect(main, `${segment} on /${locale}`).not.toContainText(
          foreign,
        );
      }
      // The case under test is the client navigation; a reload would pass
      // for the wrong reason.
      expect(await sameDocument(page), `${segment} reloaded the page`).toBe(
        true,
      );
    }
  });
}
