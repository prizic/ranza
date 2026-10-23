import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import {
  aStaffMember,
  openTheCalendar,
  pickDay,
  pickUnit,
  propertyDay,
  signIn,
} from "./front-desk";
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
    await expect(
      dialog.getByRole("heading", { name: /still open/ }),
    ).toBeVisible();
    await expect(dialog).toContainText(overdue.guestName);
    await expect(dialog).toContainText(
      "a booking with no price is not charged",
    );
    await dialog
      .getByLabel("Why close with items open?")
      .fill("Guest overstayed, sorted at the desk");
    await dialog.getByRole("button", { name: "Close all 4 days" }).click();
    await expect(dialog).toBeHidden();

    await expect
      .poll(() =>
        psql(
          `select count(*) from public.business_day_closes
            where property_id = '${propertyId}'
              and reason = 'Guest overstayed, sorted at the desk'`,
        ),
      )
      .toBe("4");
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
    await dialog
      .getByRole("button", { name: "Check out", exact: true })
      .click();
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

test.describe("departures say what a Guest owes and what check-out will do (RANZ-61)", () => {
  test("a_filtered_departures_list_with_nobody_owing_says_so_and_never_that_nobody_leaves", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    anOverdueGuest(propertyId, { daysOverdue: 2 });
    await signIn(page);

    await page.goto(`/en/departures?property=${propertyId}&show=owing`);
    await expect(
      page.getByText("Nobody on this list owes anything"),
    ).toBeVisible();
    await expect(page.getByText("No departures today")).toHaveCount(0);
    await expect(
      page.getByText("1 other Guest is due out or overdue."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Show all" }).first().click();
    await expect(page).not.toHaveURL(/show=/);
    await expect(
      page.getByRole("link", { name: "Owing", exact: true }),
    ).toBeVisible();
  });

  test("change_departure_for_an_overdue_guest_asks_for_the_day_they_now_leave_instead_of_opening_on_a_past_date", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const overdue = anOverdueGuest(propertyId, { daysOverdue: 4 });
    await signIn(page);

    await page.goto(`/en/departures?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: overdue.guestName });
    await row.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Change departure" }).click();
    const dialog = page.getByRole("dialog", { name: "Change departure" });
    await expect(dialog).toContainText("This Guest is 4 days past");
    await expect(dialog).toContainText("Pick the day they now leave");
    await expect(
      dialog.getByRole("button", { name: "Save departure" }),
    ).toBeDisabled();
  });

  test("an_overdue_guest_owes_the_nights_check_out_will_charge_on_the_row_and_in_the_owing_filter", async ({
    page,
  }) => {
    const propertyId = aDeskProperty([
      "today",
      "front_desk",
      "finance",
      "housekeeping",
    ]);
    const overdue = anOverdueGuest(propertyId, {
      daysOverdue: 3,
      nightlyRateMinor: 10_000,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto(`/en/departures?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: overdue.guestName });
    await expect(row).toContainText("Overdue · 3 days");
    await expect(row).toContainText(
      /includes \d+ nights? charged at check-out/,
    );
    const rowAmount = (await row.innerText()).match(/TRY\s?[\d.,]+/)?.[0];
    expect(rowAmount, "the row shows an amount owing").toBeTruthy();
    expect(rowAmount).not.toMatch(/TRY\s?0[.,]00/);

    // The same Guest is in the owing filter, which asks the same question.
    await page.getByRole("link", { name: "Owing", exact: true }).click();
    await expect(page.getByTestId("list-filter-notice")).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: overdue.guestName }),
    ).toBeVisible();

    await page
      .getByRole("row")
      .filter({ hasText: overdue.guestName })
      .getByRole("button", { name: /^Check .* out$/ })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("3 days overdue");
    await expect(dialog).toContainText("marked dirty");
    await expect(dialog).toContainText("Due at check-out");
    // The amount the dialog asks about is the amount the row showed.
    await expect(dialog).toContainText(rowAmount!);
    const folio = dialog.getByRole("link", {
      name: "Open the Folio in a new tab",
    });
    await expect(folio).toHaveAttribute("target", "_blank");
    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-61", "overdue-check-out-owing.png"),
    });

    await dialog
      .getByLabel("Why the balance stays open")
      .fill("Guest will settle by transfer");
    await dialog
      .getByRole("button", { name: "Check out", exact: true })
      .click();
    await expect(dialog).toBeHidden();

    // Where the room was left: dirty, said beside the Guest who left it.
    const left = page.getByRole("row").filter({ hasText: overdue.guestName });
    await expect(left).toContainText("Needs cleaning");
  });
});

test.describe("Reservations take a booking and read one (RANZ-58)", () => {
  test("a_returning_guest_typed_by_name_is_suggested_and_picking_one_fills_their_details", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const email = `returning-${randomUUID().slice(0, 8)}@example.test`;
    const number = String(
      Math.floor(1_000_000_000 + Math.random() * 8_999_999_999),
    );
    const known = aBooking(propertyId, {
      startsIn: 20,
      nights: 2,
      label: "Returning",
      contact: { email, phone: `+90 ${number}` },
    });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });
    await dialog.getByLabel("Guest name").fill(known.guestName.slice(0, -3));
    const suggestion = dialog.getByRole("button", {
      name: new RegExp(known.guestName),
    });
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText(email);
    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-58", "returning-guest-suggested.png"),
    });
    await suggestion.click();
    await expect(dialog.getByLabel("Email")).toHaveValue(email);
    await expect(dialog.getByLabel("Phone")).toHaveValue(`+90 ${number}`);

    // A number of the same Guest, typed by its digits, finds them too.
    await dialog.getByLabel("Guest name").fill(number);
    await expect(
      dialog.getByRole("button", { name: new RegExp(known.guestName) }),
    ).toBeVisible();
  });

  test("a_half_filled_booking_asks_before_it_is_thrown_away", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    aBooking(propertyId, { startsIn: 20, nights: 2 });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });
    const guest = dialog.getByLabel("Guest name");
    await guest.fill("Half Typed");

    await page.keyboard.press("Escape");
    await expect(dialog.getByText("Discard this booking?")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(guest).toHaveValue("Half Typed");

    await page.keyboard.press("Escape");
    await dialog
      .getByRole("alert")
      .getByRole("button", { name: "Discard it" })
      .click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "New reservation" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "New reservation" })
        .getByLabel("Guest name"),
    ).toHaveValue("");
  });

  test("a_telephone_number_with_letters_is_refused_in_our_words_and_an_unpriced_booking_is_a_warning", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const unit = aBooking(propertyId, { startsIn: 40, nights: 1 });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });

    const phone = dialog.getByLabel("Phone");
    await phone.fill("abc");
    expect(
      await phone.evaluate((el: HTMLInputElement) => el.validationMessage),
    ).toBe("A telephone number has only digits, spaces and + ( ) - .");
    await phone.fill("+90 532 000 11 22");
    expect(
      await phone.evaluate((el: HTMLInputElement) => el.validationMessage),
    ).toBe("");

    // The stay dates come before the room, so availability can mark it.
    await expect(
      dialog.getByText("Choose dates first to see free units"),
    ).toBeVisible();
    await openTheCalendar(page, dialog);
    await pickDay(page, propertyDay(propertyId, 70));
    await pickDay(page, propertyDay(propertyId, 71));
    await pickUnit(dialog, unit.unitName);
    const notice = dialog.locator("p", { hasText: /No price is set for/ });
    await expect(notice).toBeVisible();
  });

  test("a_booking_is_found_by_the_dates_and_the_number_a_desk_types", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 12,
      nights: 2,
      label: "Findable",
      contact: { phone: "+90 532 777 88 99" },
    });
    aBooking(propertyId, { startsIn: 30, nights: 2, label: "Other" });
    const starts = psql(
      `select to_char(starts_on, 'DD.MM.YYYY') || '|' || to_char(starts_on, 'DD/MM')
         from public.reservations where reference = '${booking.reference}'`,
    ).split("|");
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    const search = page.getByRole("searchbox");
    const listed = page.getByRole("row").filter({ hasText: booking.guestName });

    // Placeholder: the whole sentence, not a cut-off list of column names.
    await expect(search).toHaveAttribute(
      "placeholder",
      "Search guest, room, reference, phone or date",
    );
    for (const typed of [
      starts[0]!,
      starts[1]!,
      "5327778899",
      "05327778899",
      "905327778899",
    ]) {
      await search.fill(typed);
      await expect(listed, `typed ${typed}`).toBeVisible();
    }
    await search.fill("5327778898");
    await expect(listed).toHaveCount(0);
  });

  test("change_booking_names_the_unit_once_and_keeps_the_booking_the_way_the_other_dialogs_do", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 9,
      nights: 2,
      label: "Change",
    });
    const id = psql(
      `select id from public.reservations where reference = '${booking.reference}'`,
    );
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}&change=${id}`);
    const dialog = page.getByRole("dialog", { name: "Change booking" });
    await expect(dialog).toBeVisible();
    // The room is the editable field, not also a read-only block above it.
    await expect(dialog.getByText("Which unit?", { exact: true })).toHaveCount(
      1,
    );
    await expect(
      dialog.getByRole("button", { name: "Keep the booking" }),
    ).toBeVisible();
  });

  test("a_booking_sheet_offers_the_actions_the_row_menu_does_and_cancelling_presets_reasons", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 15,
      nights: 2,
      label: "Sheet",
    });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("searchbox").fill(booking.guestName);
    await page
      .getByRole("row")
      .filter({ hasText: booking.guestName })
      .getByText(booking.reference)
      .click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText(booking.guestName);
    await sheet.getByRole("button", { name: /More actions/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Change booking" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Cancel booking" }).click();

    const cancel = page.getByRole("dialog", { name: "Cancel this booking" });
    await expect(cancel).toContainText("which has a new reference");
    await cancel.getByRole("button", { name: "Booked in error" }).click();
    await expect(cancel.getByLabel("Reason")).toHaveValue("Booked in error");
    await cancel.getByRole("button", { name: "Cancel booking" }).click();
    await expect(cancel).toBeHidden();
    expect(
      psql(
        `select status from public.reservations where reference = '${booking.reference}'`,
      ),
    ).toBe("cancelled");
  });
});

test.describe("Arrivals work in the order a desk works them (RANZ-60)", () => {
  test("arrivals_open_in_working_order_name_why_a_room_is_not_ready_and_offer_a_new_booking", async ({
    page,
  }) => {
    const propertyId = aDeskProperty([
      "today",
      "front_desk",
      "finance",
      "housekeeping",
    ]);
    const late = aBooking(propertyId, {
      startsIn: -2,
      nights: 5,
      label: "Late",
    });
    const evening = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Evening",
      expectedArrival: "18:00",
    });
    const morning = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Morning",
      expectedArrival: "09:00",
    });
    const unsaid = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Unsaid",
    });
    const dirty = aDirtyRoomArrival(propertyId);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`/en/arrivals?property=${propertyId}`);
    await expect(page).toHaveTitle(/^Arrivals · /);
    // evaluateAll does not wait: the rows are there before they are read.
    await expect(page.getByRole("row")).toHaveCount(6);
    const names = await page
      .getByRole("row")
      .evaluateAll((rows) =>
        rows
          .map((row) => row.textContent ?? "")
          .filter((text) => text.includes("Test ")),
      );
    const order = [late, morning, evening, unsaid].map((booking) =>
      names.findIndex((text) => text.includes(booking.guestName)),
    );
    expect(order, "late, then by expected time, nobody-said last").toEqual(
      [...order].sort((a, b) => a - b),
    );
    expect(order.every((index) => index >= 0)).toBe(true);

    await page.screenshot({
      path: path.join(EVIDENCE, "RANZ-60", "arrivals-in-working-order.png"),
    });

    // The cause is on the badge, and the menu leads to the board.
    const dirtyRow = page.getByRole("row").filter({ hasText: dirty.guestName });
    await expect(dirtyRow).toContainText("Dirty");
    await dirtyRow.getByRole("button", { name: "Check in" }).click();
    await expect(dirtyRow).toContainText(
      `${dirty.unitName} has not been cleaned yet.`,
    );
    await dirtyRow.getByRole("button", { name: /More actions/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Open in Housekeeping" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // No time given is said in words; the list says when it was read.
    await expect(
      page.getByRole("row").filter({ hasText: unsaid.guestName }),
    ).toContainText("No time given");
    await expect(page.getByTestId("list-updated-at")).toBeVisible();

    // A walk-in starts on this page and ends in the booking form, open.
    await page.getByRole("link", { name: "New booking" }).click();
    await expect(
      page.getByRole("dialog", { name: "New reservation" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/^Reservations · /);
  });

  test("checking_a_guest_in_moves_focus_to_the_next_check_in_and_names_each_button_by_its_guest", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const first = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "One",
    });
    const second = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Two",
    });
    await signIn(page);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    const buttons = page.getByRole("button", { name: /^Check in Test / });
    await expect(buttons).toHaveCount(2);
    const names = await buttons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    const leading = names[0]!.includes(first.guestName) ? first : second;
    const following = leading === first ? second : first;
    await page
      .getByRole("button", { name: `Check in ${leading.guestName}` })
      .click();
    // Asked after the list has been read again, not in the moment before: the
    // refresh that shows the Guest checked in re-renders every row, and focus
    // that is on the next check-in only until then is focus that was lost.
    await expect(
      page.getByRole("row").filter({ hasText: leading.guestName }),
    ).toContainText("Checked in");
    await expect(
      page.getByRole("button", { name: `Check in ${following.guestName}` }),
    ).toBeFocused();
  });

  test("a_list_that_could_not_be_refreshed_says_so_above_the_rows_that_are_left", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Stale",
    });
    await signIn(page);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    await expect(page.getByTestId("list-updated-at")).toBeVisible();
    await page.route("**/api/front-office/arrivals*", (route) =>
      route.fulfill({ status: 500 }),
    );

    // The next poll fails: the rows stay, and the page says they may be old.
    await expect(
      page.getByRole("alert").filter({ hasText: "could not be refreshed" }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(
      page.getByRole("row").filter({ hasText: booking.guestName }),
    ).toBeVisible();
  });

  test("a_no_show_says_how_early_it_is_before_the_red_button", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 0,
      nights: 2,
      label: "Early",
      expectedArrival: "23:59",
    });
    await signIn(page);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: booking.guestName });
    await row.getByRole("button", { name: /More actions/ }).click();
    await page.getByRole("menuitem", { name: "Mark as no-show" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as a no-show" });
    // Before the Property's cutoff the business day is still yesterday's, so
    // whether 23:59 has passed depends on when this runs: either is said.
    await expect(dialog).toContainText(
      /Their expected arrival, 23:59, has passed|which has not passed yet/,
    );
    await expect(dialog).toContainText("which has a new reference");
  });

  test("a_role_that_may_not_check_in_or_out_is_told_so_above_the_list", async ({
    page,
    request,
    baseURL,
  }) => {
    const propertyId = aDeskProperty();
    aBooking(propertyId, { startsIn: 0, nights: 2, label: "Seen" });
    anOverdueGuest(propertyId, { daysOverdue: 1 });
    const finance = await aStaffMember(
      request,
      baseURL!,
      propertyId,
      "finance",
    );
    await signIn(page, finance.email);

    await page.goto(`/en/arrivals?property=${propertyId}`);
    await expect(
      page.getByText(
        "You can see who is expected. Checking in needs the Front desk, Manager or Owner role.",
      ),
    ).toBeVisible();
    await page.goto(`/en/departures?property=${propertyId}`);
    await expect(
      page.getByText(
        "You can see who is leaving. Checking out needs the Front desk, Manager or Owner role.",
      ),
    ).toBeVisible();
  });
});
