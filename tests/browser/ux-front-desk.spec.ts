import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { signIn } from "./front-desk";
import {
  aBooking,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
} from "./ux-fixtures";

/**
 * The 2026-10-11 UX audit's front-desk findings, walked through the real UI
 * (RANZ-51, RANZ-58, RANZ-60, RANZ-61, RANZ-63). Each test brings a Property
 * of its own, because an overdue Guest holds a business day open for ever.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/ux-audit");

test.afterAll(() => archiveMadeProperties());

test.describe("the overdue Guest (RANZ-51)", () => {
  test("an_overdue_guest_stays_on_the_reservations_list_and_says_how_late: in English and Arabic", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 3 });
    aBooking(propertyId, { startsIn: 5, nights: 2 });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    const inHouse = page.getByRole("tab", { name: /^In house/ });
    await expect(inHouse).toContainText("1");
    await inHouse.click();
    const row = page.getByRole("row").filter({ hasText: overdue.guestName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Overdue · 3 days")).toBeVisible();

    await page.goto(`/en/departures?property=${propertyId}`);
    const departure = page
      .getByRole("row")
      .filter({ hasText: overdue.guestName });
    await expect(departure.getByText("Overdue · 3 days")).toBeVisible();

    await page.goto(`/ar/reservations?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("tab").nth(2).click();
    await expect(
      page.getByRole("row").filter({ hasText: overdue.guestName }),
    ).toBeVisible();
    await expect(page.getByText(/متأخر · 3 أيام/)).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-51", "overdue-in-house-ar.png"),
    });
  });
});
