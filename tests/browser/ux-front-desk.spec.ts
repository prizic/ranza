import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import { signIn } from "./front-desk";
import {
  aBooking,
  aDeskProperty,
  aDirtyRoomArrival,
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

test.describe("a refusal says why (RANZ-54)", () => {
  test("check_in_from_today_into_a_room_that_is_not_ready_asks_instead_of_refusing", async ({
    page,
  }) => {
    const propertyId = aDeskProperty([
      "today",
      "front_desk",
      "finance",
      "housekeeping",
    ]);
    const { guestName } = aDirtyRoomArrival(propertyId);
    await signIn(page);

    await page.goto(`/en/today?property=${propertyId}`);
    const row = page
      .getByRole("listitem")
      .filter({ hasText: guestName })
      .filter({ has: page.getByRole("button", { name: "Check in" }) });
    await expect(row).toContainText("Not ready");
    await row.getByRole("button", { name: "Check in" }).click();
    await expect(row).toContainText("isn't ready yet");
    await expect(page.getByText("cannot be checked in")).toHaveCount(0);
    await row.getByRole("button", { name: "Check in anyway" }).click();
    await expect(page.getByText("Nobody arrives today")).toBeVisible();
    await expect(page.getByText("cannot be checked in")).toHaveCount(0);
  });

  test("a_refused_check_in_says_why_and_what_to_do_next: a booking cancelled behind the desk's back", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, { startsIn: 0, nights: 2 });
    await signIn(page);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: booking.guestName });
    await expect(row).toBeVisible();

    // A colleague cancels it while this list is open.
    psql(
      `update public.reservations set status = 'cancelled'
        where reference = '${booking.reference}'`,
    );
    await row.getByRole("button", { name: "Check in" }).click();
    await expect(row).toContainText(
      "cancelled or marked a no-show, so there is nothing to do here",
    );
    await expect(row).not.toContainText("cannot be checked in");
  });
});
