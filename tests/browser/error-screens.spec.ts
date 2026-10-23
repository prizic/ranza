import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { psql } from "./local-database";
import { aStaffMember, signIn } from "./front-desk";
import { aBooking, aDeskProperty, archiveMadeProperties } from "./ux-fixtures";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-76",
);

/**
 * A workspace page that cannot be drawn says so, with a way to try again and a
 * reference, and the failure is recorded (RANZ-76).
 *
 * Only four routes had a screen of their own; every other failure showed the
 * framework's blank page. The failure here is a real one: the Reservations
 * list multiplies a booking's nightly price by its nights in a `bigint`, so a
 * price near the top of the range makes the database refuse the read. Finance
 * used to fail on a `?folio=` that was not an id; it now reads that as no
 * Folio, so a record is the trigger. If the list learns to hold such a price,
 * this needs another way to fail — the screens themselves are also proved
 * without a browser in route-error.test.tsx.
 */
const FAILING = (propertyId: string, locale: string) =>
  `/${locale}/reservations?property=${propertyId}`;

/** A Property of this run's own holding a booking whose total cannot be worked out. */
function aPropertyThatCannotBeDrawn(): string {
  const propertyId = aDeskProperty();
  const { reference } = aBooking(propertyId, { startsIn: 2, nights: 3 });
  // Written with the triggers off: the booking trigger stamps a price from the
  // price list, which a fixture has no reach to.
  psql(
    `set session_replication_role = replica;
     update public.reservations
        set nightly_rate_minor = 9000000000000000000, rate_currency = 'TRY'
      where reference = '${reference}'`,
  );
  return propertyId;
}

test.afterAll(() => archiveMadeProperties());

for (const [locale, say] of [
  [
    "en",
    {
      title: "Something went wrong",
      retry: "Try again",
      reference: "Reference:",
    },
  ],
  ["ar", { title: "حدث خطأ ما", retry: "حاول مجددًا", reference: "المرجع:" }],
] as const) {
  test(`a failed page says so, keeps the shell and records it in ${locale}`, async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const propertyId = aPropertyThatCannotBeDrawn();
    const { email } = await aStaffMember(
      request,
      baseURL!,
      propertyId,
      "owner",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email);

    const recorded: unknown[][] = [];
    page.on("console", async (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("workspace.render_failed")
      ) {
        recorded.push(message.args());
      }
    });

    await page.goto(FAILING(propertyId, locale));
    await expect(page.getByRole("heading", { name: say.title })).toBeVisible();
    await expect(page.getByRole("button", { name: say.retry })).toBeVisible();
    const reference = page.getByText(say.reference);
    await expect(reference).toBeVisible();
    expect(await reference.innerText()).toMatch(/\d{6,}/);

    // The shell around it is intact: the rail still leads somewhere.
    await expect(page.locator("aside nav a").first()).toBeVisible();
    await expect
      .poll(() => recorded.length, "the failure is recorded")
      .toBeGreaterThan(0);
    await page.screenshot({
      path: path.join(EVIDENCE, `error-screen-${locale}.png`),
    });

    // Trying again against a page that still fails is the same screen, not a hang.
    await page.getByRole("button", { name: say.retry }).click();
    await expect(page.getByRole("heading", { name: say.title })).toBeVisible();

    // And the way out works: Today opens.
    await page.locator("aside nav a").first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/today`));
    await expect(page.getByRole("heading", { name: say.title })).toHaveCount(0);
  });
}
