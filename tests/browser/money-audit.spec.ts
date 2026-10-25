import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";
import { aComparedProperty } from "./compared-properties";
import { aFreshProperty } from "./fresh-property";
import { aStaffMember, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
  type Housed,
} from "./ux-fixtures";

/**
 * The 2026-10-24 UX audit's money findings, walked through the real UI:
 * Finance, Analytics and All Properties (lane 07). Each test brings a Property
 * of its own, because an overdue Guest holds a business day open for ever.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/money",
);
const shot = (name: string) => path.join(EVIDENCE, `${name}.png`);

test.afterAll(() => archiveMadeProperties());

const ANALYTICS = ["today", "front_desk", "finance", "analytics"];

/** Text as a person reads it: without the isolates that keep a name in place, and with plain spaces. */
const plain = (text: string | null): string =>
  (text ?? "").replace(/[⁦-⁩]/g, "").replace(/ /g, " ");

function folioOf(guest: Housed): string {
  return psql(`select id from public.folios where stay_id = '${guest.stayId}'`);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("what guests owe (FINANCE-01, 05, 08, 12)", () => {
  test("today_departures_and_finance_give_one_answer_and_the_folio_opens_from_owing_and_goes_back_to_it", async ({
    page,
    request,
    baseURL,
  }) => {
    const propertyId = aDeskProperty();
    const behind = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    const finance = await aStaffMember(
      request,
      baseURL!,
      propertyId,
      "finance",
    );
    await page.setViewportSize({ width: 1280, height: 900 });

    // The desk's Departures says what the Guest owes in the same figure.
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);
    await expect(
      page.getByRole("row").filter({ hasText: behind.guestName }),
    ).toContainText("TRY 600.00");
    await page.context().clearCookies();

    // Nothing on the bill yet, five nights slept: 600.00 is owed at check-out.
    await signIn(page, finance.email);
    await page.goto(`/en/today?property=${propertyId}`);
    const tile = page
      .locator('main a[href^="/en/finance?"]')
      .filter({ hasText: "Open Folios" })
      .first();
    await expect(tile).toContainText("Owed");
    expect(plain(await tile.innerText())).toMatch(
      /Owed TRY 600\.00, TRY 600\.00 of it at check-out/,
    );

    await page.goto(`/en/finance?property=${propertyId}&show=owing`);
    const row = page.getByRole("row").filter({ hasText: behind.guestName });
    await expect(row).toContainText("TRY 600.00");
    await expect(row).toContainText("TRY 0.00 billed");
    await expect(row).toContainText("TRY 600.00 for 5 nights at check-out");
    await expect(page.getByTestId("owing-summary")).toContainText(
      /1 folio owes TRY\s600\.00/,
    );
    await page.screenshot({ path: shot("01-owing-list-agrees-with-today") });

    // Opening the folio keeps the tab, and Back returns to it.
    await row.getByRole("link").first().click();
    await expect(page).toHaveURL(/show=owing/);
    await expect(page).toHaveURL(/folio=/);
    const fact = (label: string) =>
      page.locator("dt", { hasText: label }).locator("xpath=..");
    await expect(fact("Balance on the bill")).toContainText("TRY 0.00");
    await expect(fact("Owes at check-out")).toContainText("TRY 600.00");
    await page.getByRole("link", { name: "Back" }).first().click();
    await expect(page).toHaveURL(/show=owing/);
    await expect(page).not.toHaveURL(/folio=/);
    await expect(
      page.getByRole("row").filter({ hasText: behind.guestName }),
    ).toBeVisible();
  });

  test("a_folio_that_does_not_open_says_so_and_a_booking_without_a_price_says_who_to_ask", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    anOverdueGuest(propertyId, { daysOverdue: 1, withFolio: true });
    const unpriced = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/en/finance?property=${propertyId}&folio=${randomUUID()}`);
    const notice = page.getByTestId("folio-not-found");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("That folio can't be opened here");
    await page.screenshot({ path: shot("02-folio-not-found") });

    await page.goto(
      `/en/finance?property=${propertyId}&folio=${folioOf(unpriced)}`,
    );
    await expect(page.getByTestId("nights-note")).toBeVisible();
    await page.screenshot({ path: shot("03-folio-unpriced") });
  });

  test("a_charge_is_confirmed_with_the_guest_the_room_and_the_amount_before_it_posts_in_english_and_arabic", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    const folio = folioOf(guest);

    await page.goto(`/en/finance?property=${propertyId}&folio=${folio}`);
    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeDisabled();
    await page.locator("#charge-description").fill("Minibar");
    await page.locator("#charge-amount").fill("12.505");
    await expect(
      page.getByText("A TRY amount has at most 2 decimal places."),
    ).toBeVisible();
    await expect(post).toBeDisabled();
    await page.locator("#charge-amount").fill("1,250.00");
    await expect(page.getByTestId("charge-summary")).toContainText(
      "TRY 1,250.00",
    );
    await post.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(guest.guestName);
    await expect(dialog).toContainText(guest.unitName);
    await expect(dialog).toContainText("TRY 1,250.00");
    await page.screenshot({ path: shot("04-charge-confirm") });
    // Nothing is posted until the confirm is pressed.
    await expect(
      page.getByRole("row").filter({ hasText: "Minibar" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("#charge-amount")).toHaveValue("1,250.00");
    await post.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Post charge" })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Minibar" }),
    ).toContainText("TRY 1,250.00");

    await page.goto(`/ar/finance?property=${propertyId}&folio=${folio}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator("#charge-description").fill("خدمة الغرف");
    await page.locator("#charge-amount").fill("٢٬٥٠٠٫٥٠");
    await page.getByRole("button", { name: "قيد", exact: true }).click();
    const arabic = page.getByRole("dialog");
    await expect(arabic).toContainText(guest.guestName);
    await expect(arabic).toContainText("2,500.50");
    await page.screenshot({ path: shot("05-charge-confirm-arabic") });
  });

  test("on_a_phone_the_balance_is_on_the_card_and_a_line_shows_its_amount_and_reverse", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 12000,
      withFolio: true,
    });
    const folio = folioOf(guest);
    psql(
      `insert into public.folio_lines
         (organization_id, property_id, folio_id, line_type, description, amount_minor)
       select organization_id, property_id, id, 'charge', 'Minibar', 7500
         from public.folios where id = '${folio}'`,
    );
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });

    await page.goto(`/en/finance?property=${propertyId}`);
    const card = page.getByRole("row").filter({ hasText: guest.guestName });
    await expect(card).toBeVisible();
    const balance = card.getByText("TRY 675.00").first();
    await expect(balance).toBeVisible();
    const box = await balance.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("06-finance-list-phone") });

    await page.goto(`/en/finance?property=${propertyId}&folio=${folio}`);
    const line = page.getByRole("row").filter({ hasText: "Minibar" });
    await expect(line).toBeVisible();
    for (const target of [
      line.getByText("TRY 75.00").first(),
      line.getByRole("button", { name: "Reverse" }),
    ]) {
      await expect(target).toBeVisible();
      const where = await target.boundingBox();
      expect(where!.x).toBeGreaterThanOrEqual(0);
      expect(where!.x + where!.width).toBeLessThanOrEqual(375);
    }
    await noHorizontalScroll(page);
    await line.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.screenshot({ path: shot("07-folio-lines-phone") });
  });
});

test.describe("Analytics (FINANCE-02, 03, 09, 13)", () => {
  test("a_stay_dated_before_its_room_was_made_never_gives_more_than_full_and_the_day_opens_the_folio", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    // The room was made after the Guest's first night, as on the audited Property.
    psql(
      `update public.accommodation_units
          set created_at = now()
        where property_id = '${propertyId}'`,
    );
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });

    await page.goto(`/en/analytics?property=${propertyId}`);
    const occupancy = page
      .locator("[data-figure]")
      .filter({ hasText: "Occupancy" })
      .first();
    await expect(occupancy).toBeVisible();
    const shown = Number.parseFloat(
      (await occupancy.innerText()).match(/(\d+(?:\.\d+)?)%/)![1]!,
    );
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(100);
    const [occupied, available] = (await occupancy.innerText())
      .match(/(\d+) occupied ÷ (\d+) available/)!
      .slice(1)
      .map(Number);
    expect(occupied).toBeLessThanOrEqual(available!);
    await page.screenshot({ path: shot("08-analytics-occupancy-within-100") });

    // A day with the Guest in it leads to their Folio.
    const day = psql(
      `select to_char(starts_on + 1, 'YYYY-MM-DD') from public.stays where id = '${guest.stayId}'`,
    );
    await page.goto(
      `/en/analytics?property=${propertyId}&month=${day.slice(0, 7)}&day=${day}`,
    );
    const link = page.getByRole("dialog").locator("[data-folio-link]").first();
    await expect(link).toBeVisible();
    await page.screenshot({ path: shot("09-analytics-day-folio-link") });
    await link.click();
    await expect(page).toHaveURL(/\/en\/finance\?property=.*&folio=/);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: new RegExp(guest.guestName),
      }),
    ).toBeVisible();
  });

  test("a_month_that_has_run_one_day_and_a_rate_with_nothing_closed_say_what_is_true_in_arabic_too", async ({
    page,
  }) => {
    const propertyId = aDeskProperty(ANALYTICS);
    anOverdueGuest(propertyId, { daysOverdue: 1, withFolio: true });
    await signIn(page);
    await page.setViewportSize({ width: 1280, height: 1000 });

    await page.goto(`/en/analytics?property=${propertyId}`);
    await expect(
      page.getByText("No day has closed yet, so there is nothing to divide."),
    ).toBeVisible();
    await expect(page.getByText(/no available nights/i)).toHaveCount(0);

    await page.goto(`/ar/analytics?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).not.toContainText("NaN");
    await page.screenshot({ path: shot("10-analytics-arabic") });
  });
});

test.describe("All Properties (FINANCE-15)", () => {
  test("an_owner_with_one_property_is_told_where_to_give_access_and_a_finance_role_is_told_to_ask", async ({
    page,
    request,
    baseURL,
  }) => {
    const only = aFreshProperty("one", {
      capabilities: ["today", "analytics", "staff_administration"],
    });
    const owner = await aStaffMember(
      request,
      baseURL!,
      only.propertyId,
      "owner",
    );
    await signIn(page, owner.email);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`/en/portfolio?property=${only.propertyId}`);
    await expect(
      page.getByRole("heading", { name: "Nothing to compare yet" }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Ask an Owner");
    const people = page.getByRole("link", { name: "Open People" });
    await expect(people).toHaveAttribute(
      "href",
      `/en/people?property=${only.propertyId}`,
    );
    await page.screenshot({ path: shot("11-portfolio-one-property-owner") });

    await page.goto(`/ar/portfolio?property=${only.propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("link", { name: "افتح الفريق" })).toBeVisible();
    await page.screenshot({ path: shot("12-portfolio-one-property-arabic") });
  });

  test("a_role_that_cannot_give_access_is_still_told_to_ask_an_owner", async ({
    page,
    request,
    baseURL,
  }) => {
    const only = aComparedProperty("only finance", {
      currency: "TRY",
      rooms: 2,
      inHouse: 1,
      dueOutToday: 0,
      arrivalsToCome: 0,
      openMaintenance: 0,
      owedMinor: 1000,
    });
    const finance = await aStaffMember(
      request,
      baseURL!,
      only.propertyId,
      "finance",
    );
    await signIn(page, finance.email);
    await page.goto(`/en/portfolio?property=${only.propertyId}`);
    await expect(page.locator("main")).toContainText("Ask an Owner");
    await expect(page.getByRole("link", { name: "Open People" })).toHaveCount(
      0,
    );
  });
});
