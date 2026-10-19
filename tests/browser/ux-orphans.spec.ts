import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { signIn } from "./front-desk";
import { PORTAL_URL } from "./portal";
import { psql } from "./local-database";
import {
  aBooking,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
  holdRoomOutOfOrder,
} from "./ux-fixtures";

/**
 * The 2026-10-11 UX audit's findings that a lane which had already landed left
 * to a later pass: the desk lists' size and search, the tab strips on a phone,
 * the room a request holds out of order named where the desk reads it, the
 * Room calendar's details and move dialogs, and the sign-in landmark.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/orphans",
);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

test.afterAll(() => archiveMadeProperties());

test.describe("the search box (RES-04)", () => {
  test("reservations_are_found_by_a_phone_typed_with_spaces_two_words_and_a_slipped_letter", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const tag = randomUUID().slice(0, 8);
    const first = aBooking(propertyId, {
      startsIn: 3,
      nights: 2,
      label: "Yılmaz",
      contact: {
        email: `ayse-${tag}@otel.example`,
        phone: "+90 532 123 45 67",
      },
    });
    const second = aBooking(propertyId, {
      startsIn: 4,
      nights: 2,
      label: "Demir",
      contact: { phone: "+90 555 987 65 43" },
    });
    await signIn(page);
    await page.goto(`/en/reservations?property=${propertyId}`);
    const search = page.getByRole("searchbox");
    const firstRow = page.getByRole("row").filter({ hasText: first.guestName });
    const secondRow = page
      .getByRole("row")
      .filter({ hasText: second.guestName });
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    const finds = async (query: string) => {
      await search.fill(query);
      await expect(firstRow).toBeVisible();
      await expect(secondRow).toHaveCount(0);
    };
    // The number as a desk writes it, not as it is stored.
    await finds("+90 532 123");
    await finds("0532 123 45");
    await finds("(532) 123-45");
    // Two words, from the name and from the e-mail.
    await finds("yılmaz otel.example");
    // A slipped letter: five or more, and not a reference or a room.
    await finds("yilmax");

    await search.fill("+90 777 000");
    await expect(
      page.getByText("Nothing matches these filters."),
    ).toBeVisible();
  });
});

test.describe("a desk list holds the day (ARR-15, DEP-08)", () => {
  test("arrivals_open_on_one_page_for_a_day_of_twelve", async ({ page }) => {
    const propertyId = aDeskProperty();
    for (let index = 0; index < 12; index += 1) {
      aBooking(propertyId, { startsIn: 0, nights: 2, label: "Arrival" });
    }
    await signIn(page);
    await page.goto(`/en/arrivals?property=${propertyId}`);
    await expect(
      page.getByRole("row").filter({ hasText: "Test Arrival" }),
    ).toHaveCount(12);
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
  });

  test("departures_open_on_one_page_for_a_day_of_twelve", async ({ page }) => {
    const propertyId = aDeskProperty();
    for (let index = 0; index < 12; index += 1) {
      anOverdueGuest(propertyId, { daysOverdue: 1 });
    }
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);
    await expect(
      page.getByRole("row").filter({ hasText: "Test Overdue" }),
    ).toHaveCount(12);
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
  });
});

test.describe("tab strips on a phone (RES-03, MAINT-09)", () => {
  test("the_reservation_tabs_and_the_maintenance_tabs_fit_a_375_px_screen", async ({
    page,
  }) => {
    const propertyId = aDeskProperty([
      "today",
      "front_desk",
      "finance",
      "maintenance",
    ]);
    aBooking(propertyId, { startsIn: 2, nights: 2 });
    await page.setViewportSize({ width: 375, height: 800 });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    const tabs = page.getByRole("tablist", { name: "Show bookings" });
    await expect(tabs).toBeVisible();
    const search = await page.getByRole("searchbox").boundingBox();
    const strip = await tabs.boundingBox();
    // The pill grows to hold the tabs that wrap, instead of letting the second
    // row spill over the search box under it.
    expect(strip!.y + strip!.height).toBeLessThanOrEqual(search!.y);
    for (const tab of await tabs.getByRole("tab").all()) {
      const box = (await tab.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      expect(box.y + box.height).toBeLessThanOrEqual(strip!.y + strip!.height);
    }
    await page.screenshot({
      path: path.join(EVIDENCE, "reservation-tabs-375.png"),
    });

    await page.goto(`/en/maintenance?property=${propertyId}`);
    const board = page.getByRole("tablist").last();
    await expect(board.getByRole("tab", { name: "Settings" })).toBeVisible();
    for (const tab of await board.getByRole("tab").all()) {
      const box = (await tab.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    await page.screenshot({
      path: path.join(EVIDENCE, "maintenance-tabs-375.png"),
    });
  });
});

test.describe("a room held out of order says by what and until when (MAINT-17, MAINT-12)", () => {
  test("arrivals_and_the_room_calendar_name_the_request_and_the_day_it_is_back", async ({
    page,
  }) => {
    const propertyId = aDeskProperty([
      "today",
      "front_desk",
      "finance",
      "maintenance",
    ]);
    const dated = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Dated",
    });
    const undated = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Undated",
    });
    const datedNumber = holdRoomOutOfOrder(propertyId, dated.unitName, 5);
    const undatedNumber = holdRoomOutOfOrder(
      propertyId,
      undated.unitName,
      null,
    );
    const [backOn, backOnWithYear] = psql(
      `select to_char(app.property_today('${propertyId}') + 5, 'Mon FMDD')
              || '|' ||
              to_char(app.property_today('${propertyId}') + 5, 'Mon FMDD, YYYY')`,
    ).split("|");
    await signIn(page);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    const datedRow = page.getByRole("row").filter({ hasText: dated.guestName });
    await expect(datedRow).toContainText(`Out of order · MT-${datedNumber}`);
    await expect(datedRow).toContainText(`Back ${backOnWithYear}`);
    const undatedRow = page
      .getByRole("row")
      .filter({ hasText: undated.guestName });
    await expect(undatedRow).toContainText(
      `Out of order · MT-${undatedNumber}`,
    );
    await expect(undatedRow).toContainText("No return date set");
    await page.screenshot({
      path: path.join(EVIDENCE, "arrivals-out-of-order.png"),
    });

    await page.goto(`/en/room-calendar?property=${propertyId}&days=14`);
    const unitRow = page.locator(`[role="row"][data-unit-id]`).filter({
      hasText: dated.unitName,
    });
    // The calendar says "Out of order", as Maintenance and Arrivals do.
    await expect(unitRow).toContainText(`Out of order · MT-${datedNumber}`);
    await expect(page.getByText("Out of service")).toHaveCount(0);
    await page
      .locator("[data-bar-key]")
      .filter({ hasText: dated.guestName })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      `MT-${datedNumber} · Back ${backOn}`,
    );
    await page.screenshot({
      path: path.join(EVIDENCE, "calendar-out-of-order.png"),
    });
    await page.keyboard.press("Escape");

    await page.goto(`/ar/arrivals?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const arabicRow = page
      .getByRole("row")
      .filter({ hasText: dated.guestName });
    await expect(arabicRow).toContainText(`MT-${datedNumber}`);
    await expect(arabicRow).toContainText("خارج الخدمة");
    await expect(arabicRow).toContainText("يعود");
  });
});

test.describe("the Room calendar's details and move dialogs (ROOMCAL-05, ROOMCAL-09)", () => {
  test("a_stay_bar_gives_the_booking_code_and_a_move_dialog_names_the_room_while_it_loads", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const housed = anOverdueGuest(propertyId, { daysOverdue: 1 });
    const booked = aBooking(propertyId, {
      startsIn: 3,
      nights: 2,
      label: "Moving",
    });
    await page.route("**/api/front-office/booking-change*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await route.continue();
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.goto(`/en/room-calendar?property=${propertyId}&days=14`);

    const bar = (name: string) =>
      page.locator("[data-bar-key]").filter({ hasText: name }).first();
    await bar(housed.guestName).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("Reservation");
    await expect(drawer).toContainText(housed.reference);
    await page.keyboard.press("Escape");

    await bar(booked.guestName).click();
    await drawer.getByRole("button", { name: "Move…" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toContainText(booked.unitName);
    // Still waiting for the rooms: the field names the room, never an id.
    await expect(dialog.getByRole("combobox").first()).toContainText(
      booked.unitName,
    );
    expect(await dialog.innerText()).not.toMatch(UUID);
    await page.screenshot({
      path: path.join(EVIDENCE, "move-dialog-loading.png"),
    });
  });
});

test.describe("the sign-in gate (GP-10)", () => {
  test("both_sign_in_pages_have_one_main_landmark_with_the_heading_in_it", async ({
    page,
  }) => {
    for (const url of ["/en/sign-in", `${PORTAL_URL}/en/sign-in`]) {
      await page.goto(url);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole("banner")).toHaveCount(1);
    }
  });
});
