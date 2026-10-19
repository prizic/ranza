import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import {
  anArrivalToday,
  aStaffMemberHolding,
  portfolioProperty,
  signIn,
  testProperty,
} from "./front-desk";
import {
  aBacklog,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
  type Housed,
} from "./ux-fixtures";

/**
 * The 2026-10-11 UX audit's money findings, walked through the real UI:
 * Finance (RANZ-67), Analytics (RANZ-70) and All Properties (RANZ-71). Each
 * test brings a Property of its own, because an overdue Guest holds a business
 * day open for ever.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/ux-audit");
const shot = (ticket: string, name: string) =>
  path.join(EVIDENCE, ticket, `${name}.png`);

test.afterAll(() => archiveMadeProperties());

/** Text as a person reads it: without the isolates that keep a name in place, and with plain spaces. */
const plain = (text: string | null): string =>
  (text ?? "").replace(/[\u2066-\u2069]/g, "").replace(/\u00a0/g, " ");

/** The Folio a Guest's stay opened. */
function folioOf(guest: Housed): string {
  return psql(`select id from public.folios where stay_id = '${guest.stayId}'`);
}

test.describe("Finance (RANZ-67)", () => {
  test("the_list_finds_a_folio_by_room_and_booking_and_leads_with_who_owes_most", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const behind = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    const settled = anOverdueGuest(propertyId, {
      daysOverdue: 0,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/en/finance?property=${propertyId}`);

    const rows = page.getByRole("row");
    await expect(rows.filter({ hasText: behind.guestName })).toBeVisible();
    await expect(rows.filter({ hasText: behind.reference })).toBeVisible();
    await expect(
      rows.filter({ hasText: behind.guestName }).getByText("Overdue · 2 days"),
    ).toBeVisible();

    // What the desk says aloud finds the folio: a room, a booking code.
    const search = page.getByRole("searchbox");
    await search.fill(behind.unitName);
    await expect(rows.filter({ hasText: behind.guestName })).toBeVisible();
    await expect(rows.filter({ hasText: settled.guestName })).toHaveCount(0);
    await search.fill(settled.reference);
    await expect(rows.filter({ hasText: settled.guestName })).toBeVisible();
    await search.fill("");

    // Owing: the nights check-out will still charge count, the settled folio does not.
    await page.getByRole("link", { name: "Owing" }).click();
    await expect(page).toHaveURL(/show=owing/);
    await expect(rows.filter({ hasText: behind.guestName })).toBeVisible();
    await expect(rows.filter({ hasText: settled.guestName })).toHaveCount(0);
    await expect(page.getByTestId("owing-summary")).toContainText(
      /1 folio owes TRY\s600\.00/,
    );

    // A tab with nothing in it says so, and is not "no folios yet".
    await page.getByRole("link", { name: "Closed" }).click();
    await expect(page.getByText("No closed folios")).toBeVisible();
    await expect(page.getByText("No folios yet")).toHaveCount(0);
    await page.getByRole("link", { name: "Show all" }).click();
    await expect(rows.filter({ hasText: behind.guestName })).toBeVisible();
  });

  test("a_folio_says_whose_it_is_what_it_has_come_to_and_why_nothing_is_charged_yet", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    const unpriced = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });

    await page.goto(
      `/en/finance?property=${propertyId}&folio=${folioOf(guest)}`,
    );
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: new RegExp(guest.guestName),
      }),
    ).toContainText(guest.unitName);
    await expect(
      page.getByRole("link", { name: `Booking ${guest.reference}` }),
    ).toBeVisible();
    await expect(page.getByText("Overdue · 2 days")).toBeVisible();
    const fact = (label: string) =>
      page.locator("dt", { hasText: label }).locator("xpath=..");
    await expect(fact("Charged")).toContainText("TRY 0.00");
    await expect(fact("Still to charge")).toContainText(
      "5 nights · TRY 600.00",
    );
    await expect(fact("Owes at check-out")).toContainText("TRY 600.00");
    await expect(page.getByTestId("nights-note")).toContainText(
      "No nights charged yet",
    );
    await expect(page.getByTestId("nights-note")).toContainText(
      "No day has been closed at this Property yet",
    );
    await page.screenshot({ path: shot("RANZ-67", "folio-no-nights-yet") });

    // The booking with no price says it will never charge a night.
    await page.goto(
      `/en/finance?property=${propertyId}&folio=${folioOf(unpriced)}`,
    );
    await expect(page.getByTestId("nights-note")).toContainText(
      "no price, so no nights are charged",
    );
  });

  test("a_folio_links_its_own_history_in_the_audit_log", async ({ page }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    const folio = folioOf(guest);
    await page.goto(`/en/finance?property=${propertyId}&folio=${folio}`);
    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/en/audit-log\\?property=${propertyId}&subject=${folio}`),
    );
    await expect(page.locator("main")).not.toContainText(
      "Something went wrong",
    );
  });

  test("a_malformed_folio_in_the_address_is_no_folio_and_not_a_failed_page", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.goto(`/en/finance?property=${propertyId}&folio=not-an-id`);
    await expect(
      page.getByRole("row").filter({ hasText: guest.guestName }),
    ).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("a_charge_typed_with_grouping_posts_and_a_refused_one_keeps_what_was_typed", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    const folio = folioOf(guest);

    await page.goto(`/en/finance?property=${propertyId}&folio=${folio}`);
    const description = page.locator("#charge-description");
    const amount = page.locator("#charge-amount");
    await description.fill("Minibar");
    await amount.fill("12.505");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(
      page.getByText("A TRY amount has at most 2 decimal places."),
    ).toBeVisible();
    await expect(description).toHaveValue("Minibar");
    await expect(amount).toHaveValue("12.505");

    await amount.fill("1,250.00");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const line = page.getByRole("row").filter({ hasText: "Minibar" });
    await expect(line).toContainText("TRY 1,250.00");
    await expect(description).toHaveValue("");
    await expect(amount).toHaveValue("");
  });

  test("a_payment_starts_from_what_is_owed_asks_for_the_method_and_says_what_it_records", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(
      `/en/finance?property=${propertyId}&folio=${folioOf(guest)}`,
    );

    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/Amount/)).toHaveValue("600.00");
    await expect(dialog.getByRole("combobox")).toContainText(
      "Choose how it was paid",
    );
    await expect(dialog.getByTestId("payment-summary")).toContainText(
      "choose the method",
    );

    // No method is chosen for the clerk: skipping it is asked about, not recorded as a card.
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("Choose how it was paid.")).toBeVisible();
    await expect(dialog.getByLabel(/Amount/)).toHaveValue("600.00");

    // More than is owed needs the clerk to say so.
    await dialog.getByLabel(/Amount/).fill("1,000.00");
    const submit = dialog.getByRole("button", { name: "Record payment" });
    await expect(submit).toBeDisabled();
    await expect(dialog).toContainText(
      "This is TRY 400.00 more than the TRY 600.00 owed",
    );
    await dialog.getByLabel(/Amount/).fill("600.00");
    await expect(submit).toBeEnabled();

    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Cash" }).click();
    await expect
      .poll(async () =>
        plain(await dialog.getByTestId("payment-summary").textContent()),
      )
      .toContain(`Records TRY 600.00 paid by Cash for ${guest.guestName}`);
    await page.screenshot({ path: shot("RANZ-67", "payment-confirm") });
    await submit.click();

    await expect(dialog).toHaveCount(0);
    const line = page.getByRole("row").filter({ hasText: "Payment" });
    await expect(line).toContainText("Cash");
    await expect(line).toContainText("-TRY 600.00");
  });

  test("a_reversal_names_what_it_does_and_the_line_reads_as_a_correction", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(
      `/en/finance?property=${propertyId}&folio=${folioOf(guest)}`,
    );
    await page.locator("#charge-description").fill("Late checkout fee");
    await page.locator("#charge-amount").fill("300");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: "Late checkout fee" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Reverse" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Reverse this charge?");
    await expect(dialog).toContainText("Late checkout fee");
    await expect(dialog).toContainText("stays on the folio, marked reversed");
    await expect(dialog).toContainText("This cannot be undone");
    await dialog.getByLabel("Reason").fill("ab");
    await dialog.getByRole("button", { name: "Reverse" }).click();
    await expect(dialog.getByLabel("Reason")).toBeFocused();
    await dialog.getByLabel("Reason").fill("Charged to the wrong room");
    await dialog.getByRole("button", { name: "Reverse" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Late checkout fee" })
        .filter({ hasText: /^Late checkout fee/ }),
    ).toContainText("reversed");
    await expect(page.getByText("Reversal of Late checkout fee")).toBeVisible();
    await expect
      .poll(async () => plain(await page.getByText(/^Reason: /).textContent()))
      .toBe("Reason: Charged to the wrong room");
    await expect(
      page.getByText(/A correction never removes a line/),
    ).toBeVisible();
  });

  test("a_folio_reads_and_posts_in_arabic_and_turkish_with_the_grouping_of_each", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    const folio = folioOf(guest);

    await page.goto(`/tr/finance?property=${propertyId}&folio=${folio}`);
    await page.locator("#charge-description").fill("Minibar");
    await page.locator("#charge-amount").fill("1.250,00");
    await page.getByRole("button", { name: "İşle", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: "Minibar" }),
    ).toContainText("1.250,00");
    await expect(
      page.getByRole("button", { name: "Ödeme kaydet" }),
    ).toBeVisible();

    await page.goto(`/ar/finance?property=${propertyId}&folio=${folio}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator("#charge-description").fill("خدمة الغرف");
    await page.locator("#charge-amount").fill("٢٬٥٠٠٫٥٠");
    await page.getByRole("button", { name: "قيد", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: "خدمة الغرف" }),
    ).toContainText("2,500.50");
    await page.getByRole("button", { name: "تسجيل دفعة" }).click();
    await expect(page.getByRole("dialog")).toContainText("طريقة الدفع");
  });

  test("on_a_phone_the_guest_and_the_balance_are_both_in_view_without_scrolling_sideways", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/finance?property=${propertyId}`);
    const row = page.getByRole("row").filter({ hasText: guest.guestName });
    await expect(row).toBeVisible();
    const balance = row.getByText(/at check-out/);
    await expect(balance).toBeVisible();
    const box = await balance.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: shot("RANZ-67", "list-phone") });
  });
});

const ANALYTICS = ["today", "front_desk", "finance", "analytics"];

test.describe("Analytics (RANZ-70)", () => {
  test("a_window_reads_as_a_month_does_and_names_the_days_waiting_with_the_way_to_close_them", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    aBacklog(propertyId, 11);
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/en/analytics?property=${propertyId}&range=7d`);

    await expect(
      page.getByRole("heading", { name: "Last 7 days" }),
    ).toBeVisible();
    // The month's words, not the old window's.
    await expect(page.locator("main")).toContainText(
      "Revenue per available night (RevPAR)",
    );
    await expect(page.locator("main")).not.toContainText("Occupied Units");
    await expect(page.locator("main")).not.toContainText(
      "Analytics & Reporting",
    );

    // Nothing has closed in the window, so there is no revenue and nothing is
    // shown as zero; the days waiting are named, with where to clear them.
    const waiting = page.getByTestId("days-waiting");
    await expect(waiting).toContainText("10 days are waiting to be closed.");
    await expect(waiting).toContainText(
      "No day has closed yet, so there are no revenue figures.",
    );
    await expect(page.locator("main")).not.toContainText("TRY 0.00");
    await page.screenshot({ path: shot("RANZ-70", "window-days-waiting") });

    await waiting.getByRole("link", { name: "Close the day" }).click();
    await expect(page).toHaveURL(/\/en\/close-day\?property=/);
  });

  test("on_a_phone_the_three_headline_figures_are_read_together_before_any_note", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    anOverdueGuest(propertyId, {
      daysOverdue: 1,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    aBacklog(propertyId, 3);
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/analytics?property=${propertyId}`);

    const figures = page.locator("[data-figure]");
    await expect(figures).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      // Streamed in: counted before it is laid out.
      await expect(figures.nth(index)).toBeVisible();
      const box = await figures.nth(index).boundingBox();
      expect(
        box!.y + box!.height,
        `figure ${index} is below the fold`,
      ).toBeLessThanOrEqual(800);
    }
    // The notes come after the figures they explain.
    await expect(page.getByTestId("days-waiting")).toBeVisible();
    const notes = await page.getByTestId("days-waiting").boundingBox();
    const last = await figures.nth(2).boundingBox();
    expect(notes!.y).toBeGreaterThan(last!.y);
    await page.screenshot({ path: shot("RANZ-70", "phone-headline") });

    // The days are one press away, not a page of cards.
    await expect(page.locator("tr[data-date]").first()).toBeHidden();
    await page.getByRole("button", { name: /^Show the \d+ days$/ }).click();
    await expect(page.locator("tr[data-date]").first()).toBeVisible();
  });

  test("a_day_opens_from_anywhere_on_its_row_and_its_stay_opens_its_booking", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 0,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/en/analytics?property=${propertyId}`);

    // The row, and not only its date, is the target.
    // Days nobody has closed are open too: today is the last of them.
    const today = page.locator("tr[data-day-state='open']").last();
    await today.locator("td").nth(1).click();
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
    const dialog = page.getByRole("dialog");
    const link = dialog.getByRole("link", {
      name: `Open booking ${guest.reference}`,
    });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(
      /\/en\/reservations\?property=.*&open=[0-9a-f-]{36}/,
    );
  });

  test("a_reader_without_money_is_told_in_words_and_who_to_ask_and_is_not_told_what_revenue_covers", async ({
    page,
    request,
    baseURL,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    anOverdueGuest(propertyId, { daysOverdue: 1, withFolio: true });
    const { email } = await aStaffMemberHolding(request, baseURL!, propertyId, [
      "finance.view_ledger",
    ]);
    await signIn(page, email);
    await page.goto(`/en/analytics?property=${propertyId}`);
    const main = page.locator("main");
    await expect(main).toContainText(
      "Revenue figures are shown only to staff who manage money. Ask your manager if you need them.",
    );
    await expect(main).not.toContainText("finance.manage_folio");
    await expect(main).not.toContainText("Revenue and the rates");
    await expect(main).toContainText("Occupancy counts every day so far");
  });

  test("the_window_in_arabic_mirrors_and_keeps_its_figures", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    anOverdueGuest(propertyId, { daysOverdue: 1, withFolio: true });
    await signIn(page);
    await page.goto(`/ar/analytics?property=${propertyId}&range=30d`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: "آخر 30 يومًا" }),
    ).toBeVisible();
    await expect(page.locator("[data-figure]").first()).toBeVisible();
  });
});

test.describe("All Properties (RANZ-71)", () => {
  const portfolioUrl = (propertyId: string, more = "") =>
    `/en/portfolio?property=${propertyId}${more}`;
  const cards = (page: Page) => page.locator("main li[data-property-id]");

  /** The share each card leads with, in the order the cards are drawn. */
  const shares = async (page: Page): Promise<(number | null)[]> =>
    (await cards(page).locator("[data-share]").allInnerTexts()).map((text) =>
      text.includes("—") ? null : Number.parseFloat(text.replace(",", ".")),
    );

  test("the_properties_can_be_put_in_order_and_a_figure_opens_the_list_behind_it", async ({
    page,
    context,
  }) => {
    const here = testProperty();
    portfolioProperty();
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(portfolioUrl(here));

    await page.getByRole("link", { name: "Lowest occupancy" }).click();
    await expect(page).toHaveURL(/sort=occupancy/);
    await expect(page).toHaveURL(new RegExp(`property=${here}`));
    // Lowest first, and a Property with no share last, not first.
    await expect
      .poll(async () => {
        const ordered = await shares(page);
        const known = ordered.filter(
          (value): value is number => value !== null,
        );
        const unknownLast =
          ordered.findIndex((value) => value === null) === -1 ||
          ordered
            .slice(ordered.findIndex((value) => value === null))
            .every((value) => value === null);
        return (
          unknownLast &&
          known.every(
            (value, index) => index === 0 || known[index - 1]! <= value,
          )
        );
      })
      .toBe(true);
    await page.screenshot({ path: shot("RANZ-71", "ordered-by-occupancy") });

    // A figure is a link to the list behind it, at that Property.
    const first = cards(page).first();
    const id = await first.getAttribute("data-property-id");
    await first
      .getByRole("link", { name: /Arrivals still to come at/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/en/arrivals\\?property=${id}`));
    const cookies = await context.cookies();
    expect(
      cookies.find((cookie) => cookie.name === "ranza_property")?.value,
    ).toBe(id);
  });

  test("the_properties_can_be_read_as_a_table_with_the_same_figures", async ({
    page,
  }) => {
    const here = testProperty();
    portfolioProperty();
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(portfolioUrl(here));
    await expect(cards(page).first()).toBeVisible();
    const count = await cards(page).count();

    await page.getByRole("link", { name: "Table" }).click();
    await expect(page).toHaveURL(/view=table/);
    const table = page.getByRole("table", { name: "Properties side by side" });
    await expect(table.locator("tbody tr")).toHaveCount(count);
    await expect(
      table
        .locator("tbody tr")
        .first()
        .getByRole("link", { name: /^Open (?!maintenance)/ }),
    ).toBeVisible();
    await page.screenshot({ path: shot("RANZ-71", "table") });

    await page.getByRole("link", { name: "Cards" }).click();
    await expect(cards(page)).toHaveCount(count);
  });

  test("the_stamp_says_the_day_and_the_zone_and_refresh_reads_the_figures_again", async ({
    page,
  }) => {
    const here = testProperty();
    const second = portfolioProperty();
    await signIn(page);
    await page.goto(portfolioUrl(here));
    await expect(page.getByText(/^Figures as of /)).toContainText(
      /\d{4}.*\d{2}:\d{2}.*· /,
    );

    const arrivals = (name: string) =>
      page
        .locator("main li[data-property-id]")
        .filter({ has: page.getByRole("heading", { exact: true, name }) })
        .getByText("Arrivals still to come", { exact: true })
        .locator("xpath=../dd");
    const before = Number(
      await arrivals("E2E Test Property (portfolio)").innerText(),
    );
    anArrivalToday(second);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(arrivals("E2E Test Property (portfolio)")).toHaveText(
      String(before + 1),
    );
  });

  test("a_card_leads_with_the_share_and_says_occupancy_on_the_tile_and_the_card", async ({
    page,
  }) => {
    const here = testProperty();
    portfolioProperty();
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(portfolioUrl(here));
    const first = cards(page).first();
    await expect(first.locator("[data-share]")).toBeVisible();
    await expect(first.getByText("Occupancy", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Units in use");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
