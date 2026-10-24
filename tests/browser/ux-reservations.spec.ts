import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import {
  openTheCalendar,
  pickDay,
  pickUnit,
  propertyDay,
  signIn,
} from "./front-desk";
import {
  aBooking,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
} from "./ux-fixtures";

/**
 * The 2026-10-24 UX audit's Reservations findings (lane 03), walked through the
 * real UI. Each test brings a Property of its own.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/reservations",
);

test.afterAll(() => archiveMadeProperties());

/** A Guest on file with no email, as a walk-in is, with a Turkish name. */
function aWalkIn(propertyId: string, phone: string): string {
  const tag = randomUUID().slice(0, 6).replaceAll(/[0-9]/g, "x");
  const fullName = `Özdemir${tag} Ayşe`;
  psql(
    `insert into public.guests (organization_id, full_name, phone)
     select organization_id, '${fullName}', '${phone}'
       from public.properties where id = '${propertyId}'`,
  );
  return fullName;
}

function guestsNamed(fullName: string): number {
  return Number(
    psql(`select count(*) from public.guests where full_name = '${fullName}'`),
  );
}

test.describe("a returning Guest is found and booked onto (RESERVATIONS-01)", () => {
  test("a_returning_guest_without_an_email_is_found_by_name_without_accents_or_by_telephone_and_the_booking_is_added_to_them", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const number = String(
      Math.floor(1_000_000_000 + Math.random() * 8_999_999_999),
    );
    const fullName = aWalkIn(propertyId, `+90 ${number}`);
    const free = aBooking(propertyId, {
      startsIn: 60,
      nights: 1,
      label: "Elsewhere",
    });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });

    // By the name without its umlaut and cedilla.
    await dialog
      .getByLabel("Guest name")
      .fill(fullName.replace("Ö", "O").replace("ş", "s"));
    const suggestion = dialog.getByRole("button", {
      name: new RegExp(fullName.slice(0, 9)),
    });
    await expect(suggestion).toBeVisible();

    // By the telephone, typed with a trunk zero, into the telephone field.
    await dialog.getByLabel("Guest name").fill("");
    await dialog.getByLabel("Telephone").fill(`0${number}`);
    await expect(suggestion).toBeVisible();

    await suggestion.click();
    await expect(dialog.getByLabel("Guest name")).toHaveValue(fullName);
    await expect(dialog.getByText("who is already on file")).toBeVisible();

    await openTheCalendar(page, dialog);
    await pickDay(page, propertyDay(propertyId, 30));
    await pickDay(page, propertyDay(propertyId, 32));
    await page.keyboard.press("Escape");
    await pickUnit(dialog, free.unitName, "Free");
    await page.screenshot({ path: path.join(EVIDENCE, "01-picked-guest.png") });
    await dialog.getByRole("button", { name: "Create reservation" }).click();
    await expect(dialog).toBeHidden();

    expect(guestsNamed(fullName)).toBe(1);
    const booked = psql(
      `select count(*) from public.reservations as r
         join public.guests as g on g.id = r.guest_id
        where g.full_name = '${fullName}' and r.property_id = '${propertyId}'`,
    );
    expect(booked).toBe("1");
  });
});

test.describe("the booking dialog on a phone (RESERVATIONS-11)", () => {
  test("the_new_reservation_form_fits_a_375_px_dialog", async ({ page }) => {
    const propertyId = aDeskProperty();
    aBooking(propertyId, { startsIn: 60, nights: 1 });
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });
    await expect(dialog.getByLabel("Guest name")).toBeVisible();
    const sizes = await dialog.evaluate((node) => {
      const widestRight = Math.max(
        ...[...node.querySelectorAll("*")].map(
          (el) => el.getBoundingClientRect().right,
        ),
      );
      return { dialogRight: node.getBoundingClientRect().right, widestRight };
    });
    expect(sizes.widestRight).toBeLessThanOrEqual(sizes.dialogRight + 1);
    await page.screenshot({ path: path.join(EVIDENCE, "11-dialog-375.png") });
  });
});

test.describe("the list says who is late (RESERVATIONS-07, -12, -15)", () => {
  test("overdue_guests_and_bookings_that_never_arrived_are_under_overdue_and_the_list_opens_on_arrivals", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 3 });
    const missed = aBooking(propertyId, {
      startsIn: -13,
      nights: 1,
      label: "Missed",
    });
    const today = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Today",
    });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    // The opening order: the Guest arriving today before anything older.
    const firstRow = page.getByRole("row").nth(1);
    await expect(firstRow).toContainText(today.guestName);

    const overdueTab = page.getByRole("tab", { name: /^Overdue/ });
    await expect(overdueTab).toContainText("2");
    await expect(
      page.getByRole("tab", { name: /^Departing today/ }),
    ).toContainText("0");
    await overdueTab.click();
    await expect(
      page.getByRole("row").filter({ hasText: overdue.guestName }),
    ).toContainText("Overdue · 3 days");
    const missedRow = page
      .getByRole("row")
      .filter({ hasText: missed.guestName });
    await expect(missedRow).toContainText("Did not arrive · 13 days");
    await expect(missedRow).toContainText("Was due to arrive");
    await page.screenshot({ path: path.join(EVIDENCE, "07-overdue-tab.png") });

    await page.getByRole("tab", { name: /^All/ }).click();
    await page.getByRole("searchbox").fill("overdue");
    await expect(
      page.getByRole("row").filter({ hasText: overdue.guestName }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: today.guestName }),
    ).toHaveCount(0);
  });
});

test.describe("the stay ruler (RESERVATIONS-14)", () => {
  test("the_change_departure_ruler_labels_the_days_at_equal_gaps", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, { daysOverdue: 1 });
    await signIn(page);
    await page.goto(`/en/reservations?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: guest.guestName });
    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Change departure" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const labels = dialog.getByRole("img").locator("text");
    await expect(labels.first()).toBeVisible();
    expect(await labels.count()).toBeGreaterThan(1);
    expect(await labels.count()).toBeLessThanOrEqual(8);
    await page.screenshot({
      path: path.join(EVIDENCE, "14-change-departure-ruler.png"),
    });
  });
});

test.describe("a row's actions (RESERVATIONS-05, -06, -08, -13)", () => {
  test("focus_returns_to_the_rows_menu_button_when_its_dialog_closes", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, { startsIn: 10, nights: 2 });
    await signIn(page);
    await page.goto(`/en/reservations?property=${propertyId}`);

    const row = page.getByRole("row").filter({ hasText: booking.guestName });
    const menu = row.getByRole("button", { name: /^More actions for/ });
    await menu.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Cancel booking" }).press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test("a_late_booking_opens_change_booking_with_the_reason_and_the_no_show_way_out_not_a_red_error", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const missed = aBooking(propertyId, {
      startsIn: -4,
      nights: 1,
      label: "Missed",
    });
    await signIn(page);
    await page.goto(`/en/reservations?property=${propertyId}`);

    const row = page.getByRole("row").filter({ hasText: missed.guestName });
    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Change booking" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/was due on .* and the Guest has not arrived/),
    ).toBeVisible();
    await expect(
      dialog.getByText("The arrival must be today or later."),
    ).toHaveCount(0);
    await page.screenshot({
      path: path.join(EVIDENCE, "06-change-late-booking.png"),
    });

    await dialog.getByRole("button", { name: "Mark as no-show" }).click();
    await expect(page.getByRole("dialog", { name: /no-show/i })).toBeVisible();
  });

  test("a_requested_booking_says_what_can_be_done_and_a_guest_due_out_leads_to_departures", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const requested = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Requested",
    });
    psql(
      `set session_replication_role = replica;
       update public.reservations set status = 'requested' where reference = '${requested.reference}'`,
    );
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 2 });
    await signIn(page);
    await page.goto(`/en/reservations?property=${propertyId}`);

    await expect(
      page.getByRole("row").filter({ hasText: requested.guestName }),
    ).toContainText("Cancel it and take the booking again");

    const row = page.getByRole("row").filter({ hasText: overdue.guestName });
    await row.getByRole("button", { name: /^More actions for/ }).click();
    await page
      .getByRole("menuitem", { name: "Check out (opens Departures)" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/en/departures\\?property=${propertyId}`),
    );
  });
});

test.describe("the search box says what it searches (RESERVATIONS-16)", () => {
  test("the_placeholder_is_read_whole_at_1280_px", async ({ page }) => {
    const propertyId = aDeskProperty();
    aBooking(propertyId, { startsIn: 10, nights: 2 });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/en/reservations?property=${propertyId}`);
    const search = page.getByRole("searchbox");
    await expect(search).toHaveAttribute(
      "placeholder",
      "Name, room, phone, date",
    );
    const fits = await search.evaluate((input) => {
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(input).font}`;
      probe.textContent = (input as HTMLInputElement).placeholder;
      document.body.append(probe);
      const wide = probe.getBoundingClientRect().width;
      probe.remove();
      const style = getComputedStyle(input);
      return (
        wide <=
        input.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
      );
    });
    await page.screenshot({ path: path.join(EVIDENCE, "16-search-1280.png") });
    expect(fits).toBe(true);
  });
});

test.describe("the action cell leaves the status whole (RESERVATIONS-09)", () => {
  test("the_status_chip_is_whole_beside_the_pinned_actions_on_the_arriving_tab", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const requested = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Requested",
    });
    psql(
      `set session_replication_role = replica;
       update public.reservations set status = 'requested' where reference = '${requested.reference}'`,
    );
    aBooking(propertyId, { startsIn: 0, nights: 2, label: "Confirmed" });
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("tab", { name: /^Arriving today/ }).click();
    await page.screenshot({ path: path.join(EVIDENCE, "09-arriving-tab.png") });
    for (const name of ["Requested", "Confirmed"]) {
      const row = page.getByRole("row").filter({ hasText: `Test ${name}` });
      const chip = row.getByText(name, { exact: true });
      const cell = row.locator("td[data-pinned]");
      const chipBox = (await chip.boundingBox())!;
      const actionBox = (await cell.boundingBox())!;
      expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(actionBox.x);
    }
  });
});

test.describe("in Arabic (RESERVATIONS-01, -07, -18)", () => {
  test("the_list_and_the_dialog_read_in_arabic_and_mirror", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const number = String(
      Math.floor(1_000_000_000 + Math.random() * 8_999_999_999),
    );
    const fullName = aWalkIn(propertyId, `+90 ${number}`);
    aBooking(propertyId, { startsIn: -13, nights: 1, label: "Missed" });
    aBooking(propertyId, { startsIn: 20, nights: 1, label: "Later" });
    await signIn(page);

    await page.goto(`/ar/reservations?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("tab", { name: /^المتأخرون/ }).click();
    await expect(page.getByText(/لم يصل · 13 يومًا/)).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "07-overdue-tab-ar.png"),
    });

    await page.getByRole("button", { name: "حجز جديد" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("اسم الضيف")).toBeVisible();
    await dialog.getByLabel("الهاتف").fill(`0${number}`);
    await dialog
      .getByRole("button", { name: new RegExp(fullName.slice(0, 9)) })
      .click();
    await expect(dialog.getByText(/سيُضاف هذا الحجز إلى/)).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, "01-picked-guest-ar.png"),
    });
  });
});
