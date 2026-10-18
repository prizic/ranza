import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import { signIn } from "./front-desk";
import {
  aBacklog,
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

test.describe("a backlog held by one overdue Guest (RANZ-63)", () => {
  test("a_backlog_held_by_one_guest_closes_in_one_go_with_one_reason: the range, what holds it, one reason carried across", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 7 });
    // After the Guest: a booking cannot start on a closed day.
    aBacklog(propertyId, 5);
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1100 });

    await page.goto(`/en/close-day?property=${propertyId}`);
    await expect(
      page.getByText(/4 days are waiting to be closed, .* to .*\./),
    ).toBeVisible();
    await expect(
      page.getByText(/The same item holds every one of these days:/),
    ).toContainText(overdue.guestName);
    await expect(page.getByText(/Nothing here stops a close\./)).toBeVisible();

    // The overdue row: how late, which booking, Check out first and Extend second.
    const row = page
      .getByRole("listitem")
      .filter({ hasText: overdue.guestName })
      .first();
    await expect(row).toContainText("Overdue · 7 days");
    await expect(row).toContainText(overdue.reference);
    await expect(row).toContainText("post at the close or at check-out");
    const checkOut = row.getByRole("button", { name: /^Check .* out$/ });
    const extend = row.getByRole("button", { name: "Extend" });
    await expect(checkOut).toBeVisible();
    await expect(extend).toBeVisible();
    expect(
      await checkOut.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe(
      await extend.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-63", "backlog-held-by-one-guest.png"),
    });

    // One reason, carried across every waiting day.
    await page.getByRole("button", { name: "Close all 4 days" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Still open:")).toBeVisible();
    await expect(dialog).toContainText(overdue.guestName);
    await expect(dialog).toContainText(
      "a booking with no price is not charged",
    );
    await dialog
      .getByLabel("Reason")
      .fill("Guest overstayed, sorted at the desk");
    await dialog.getByRole("button", { name: "Close all 4 days" }).click();
    await expect(page.getByText(/ is still open$/)).toBeVisible();

    expect(
      psql(
        `select count(*) from public.business_day_closes
          where property_id = '${propertyId}'
            and reason = 'Guest overstayed, sorted at the desk'`,
      ),
    ).toBe("4");
  });

  test("a_backlog_held_by_different_items_each_day_offers_no_shared_reason: the days are listed with what holds each", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    // Overdue only since two days ago: the two oldest waiting days are quiet.
    anOverdueGuest(propertyId, { daysOverdue: 2 });
    aBacklog(propertyId, 5);
    await signIn(page);

    await page.goto(`/en/close-day?property=${propertyId}`);
    await expect(page.getByText("What holds each day")).toBeVisible();
    await expect(page.getByText(/: nothing open$/).first()).toBeVisible();
    await expect(page.getByText(/: 1 item open$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Close all / })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Close / })).toBeVisible();
  });

  test("extending_an_unpriced_overdue_stay_warns_that_nothing_is_charged", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 4 });
    // After the Guest: a booking cannot start on a closed day.
    aBacklog(propertyId, 3);
    await signIn(page);

    await page.goto(`/en/close-day?property=${propertyId}`);
    const row = page
      .getByRole("listitem")
      .filter({ hasText: overdue.guestName });
    await row.getByRole("button", { name: "Extend" }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(
          "This booking has no price, so the nights an extension adds will not be charged.",
        ),
    ).toBeVisible();
  });

  test("an_overdue_guest_is_checked_out_from_the_close_the_day_checklist", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 4 });
    // After the Guest: a booking cannot start on a closed day.
    aBacklog(propertyId, 3);
    await signIn(page);

    await page.goto(`/en/close-day?property=${propertyId}`);
    const row = page
      .getByRole("listitem")
      .filter({ hasText: overdue.guestName })
      .first();
    await row.getByRole("button", { name: /^Check .* out$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(overdue.guestName);
    await dialog.getByRole("button", { name: "Confirm check-out" }).click();
    // The page behind an open dialog is hidden from the accessibility tree, so
    // an empty list means nothing until the dialog has gone.
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Extend" })).toHaveCount(0);
    expect(
      psql(`select status from public.stays where id = '${overdue.stayId}'`),
    ).toBe("departed");
    // Nothing holds the days now, so one close carries no reason.
    await expect(page.getByText("Nothing left open.").first()).toBeVisible();
  });

  test("the_close_the_day_page_reads_in_arabic_and_mirrors", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 5 });
    // After the Guest: a booking cannot start on a closed day.
    aBacklog(propertyId, 4);
    await signIn(page);

    await page.goto(`/ar/close-day?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText(/ما يُبقي|العنصر نفسه يُبقي/)).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: overdue.guestName }).first(),
    ).toContainText("متأخر");
    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-63", "backlog-held-by-one-guest-ar.png"),
    });
  });
});
