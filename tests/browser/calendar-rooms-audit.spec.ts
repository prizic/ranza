import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { propertyDay, signIn } from "./front-desk";
import {
  aBooking,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
} from "./ux-fixtures";
import { messages } from "../../apps/operator-workspace/src/messages";

/**
 * The room calendar and the Rooms page, as the UX audit of 2026-10-24 found
 * them (CALENDAR-01 to CALENDAR-19): what only a browser can show, in English
 * and in Arabic, on rooms each run brings with it.
 */

test.afterAll(archiveMadeProperties);

const LOCALES = ["en", "ar"] as const;
type Locale = (typeof LOCALES)[number];

async function openCalendar(
  page: Page,
  propertyId: string,
  locale: Locale,
  extra = "",
): Promise<void> {
  await page.goto(
    `/${locale}/room-calendar?property=${propertyId}&days=14${extra}`,
  );
  await expect(page.locator("[data-unit-id]").first()).toBeVisible();
}

async function openBar(page: Page, guest: string) {
  await page
    .locator("[data-bar-key]")
    .filter({ hasText: guest })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // The sheet slides in; its width is only true once it has stopped.
  await expect(async () => {
    const first = await drawer.boundingBox();
    await page.waitForTimeout(150);
    const second = await drawer.boundingBox();
    expect(second?.x).toBe(first?.x);
  }).toPass();
  return drawer;
}

for (const locale of LOCALES) {
  const words = messages[locale];

  test.describe(`the room calendar in ${locale}`, () => {
    test(`an overdue Guest's details use the whole panel and open Change departure on tomorrow (${locale})`, async ({
      page,
    }) => {
      const propertyId = aDeskProperty();
      const late = anOverdueGuest(propertyId, {
        daysOverdue: 6,
        nightlyRateMinor: 120000,
        withFolio: true,
      });
      psql(
        `insert into public.folio_lines
           (organization_id, property_id, folio_id, line_type, description, amount_minor)
         select f.organization_id, f.property_id, f.id, 'charge', 'Minibar', 733000
           from public.folios f where f.stay_id = '${late.stayId}'`,
      );
      await page.setViewportSize({ width: 1280, height: 860 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);

      const drawer = await openBar(page, late.guestName);
      // CALENDAR-01: the panel is the width the frame promises, and nothing in
      // it is wider than the panel.
      const box = await drawer.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(500);
      expect(
        await drawer.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `docs/evidence/ux-audit-2026-10-24/calendar-rooms/drawer-overdue-${locale}.png`,
      });

      // CALENDAR-05: the day they now leave is already filled in.
      await drawer.getByRole("button", { name: words.changeDeparture }).click();
      const dialog = page.getByRole("dialog").last();
      await expect(dialog.locator('input[name="endsOn"]')).toHaveValue(
        propertyDay(propertyId, 1),
      );
      await expect(
        dialog.getByRole("button", { name: words.saveDeparture }),
      ).toBeEnabled();
    });

    test(`on a phone the drawer is as wide as the screen (${locale})`, async ({
      page,
    }) => {
      const propertyId = aDeskProperty();
      const booking = aBooking(propertyId, {
        startsIn: -5,
        nights: 3,
        label: "Phone",
      });
      await page.setViewportSize({ width: 375, height: 700 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);
      const drawer = await openBar(page, booking.guestName);
      const box = await drawer.boundingBox();
      expect(box?.width).toBe(375);
      expect(
        await drawer.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(0);
    });

    test(`a booking whose arrival passed does not read as a plain confirmed one (${locale})`, async ({
      page,
    }) => {
      const propertyId = aDeskProperty();
      const gone = aBooking(propertyId, {
        startsIn: -5,
        nights: 3,
        label: "Gone",
      });
      const late = aBooking(propertyId, {
        startsIn: -2,
        nights: 4,
        label: "Late",
      });
      await page.setViewportSize({ width: 1280, height: 860 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);

      // Every night gone: reads as "did not arrive", with the days counted.
      const goneBar = page
        .locator("[data-bar-key]")
        .filter({ hasText: gone.guestName })
        .first();
      await expect(goneBar).toHaveAttribute(
        "aria-label",
        locale === "en" ? /did not arrive/ : /لم يصل/,
      );
      const drawer = await openBar(page, gone.guestName);
      await expect(drawer).toContainText(
        locale === "en" ? "Did not arrive · 5 days" : "لم يصل",
      );
      await expect(drawer).toContainText(words.roomCalendar.didNotArriveNote);
      await expect(drawer).not.toContainText(words.roomCalendar.confirmed);
      await page.screenshot({
        path: `docs/evidence/ux-audit-2026-10-24/calendar-rooms/drawer-did-not-arrive-${locale}.png`,
      });
      await page.keyboard.press("Escape");

      // Late with nights still ahead: Arrivals can still check them in.
      const lateBar = page
        .locator("[data-bar-key]")
        .filter({ hasText: late.guestName })
        .first();
      await expect(lateBar).toHaveAttribute(
        "aria-label",
        locale === "en" ? /has not arrived/ : /لم يصل بعد/,
      );
      const lateDrawer = await openBar(page, late.guestName);
      await expect(lateDrawer).toContainText(
        locale === "en" ? "Not arrived · 2 days late" : "لم يصل",
      );
      await expect(
        lateDrawer.getByRole("link", {
          name: words.roomCalendar.open.arrivals,
        }),
      ).toBeVisible();
    });

    test(`a drawer's reference opens that booking, not the plain list (${locale})`, async ({
      page,
    }) => {
      const propertyId = aDeskProperty();
      const booking = aBooking(propertyId, {
        startsIn: 2,
        nights: 2,
        label: "Link",
      });
      await page.setViewportSize({ width: 1280, height: 860 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);
      const drawer = await openBar(page, booking.guestName);
      const link = drawer.getByRole("link", {
        name: new RegExp(booking.reference),
      });
      await expect(link).toHaveAttribute("href", /[?&]open=[0-9a-f-]{36}/);
      await link.click();
      await expect(page).toHaveURL(/\/reservations\?.*open=/);
      await expect(page.getByRole("dialog")).toContainText(booking.guestName);
    });

    test(`the grid starts high up, the filters are one click away and call a room a room (${locale})`, async ({
      page,
    }) => {
      const propertyId = aDeskProperty();
      aBooking(propertyId, { startsIn: 1, nights: 2, label: "Chrome" });
      await page.setViewportSize({ width: 1280, height: 860 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);

      // CALENDAR-12: the toolbar was four rows; the grid now begins within a
      // laptop's first screen, as it did not at 371 px.
      const grid = page.getByRole("table").first();
      expect((await grid.boundingBox())!.y).toBeLessThan(260);
      await page.screenshot({
        path: `docs/evidence/ux-audit-2026-10-24/calendar-rooms/calendar-top-${locale}.png`,
      });

      const roomType = page.getByRole("combobox", {
        name: words.roomCalendar.typeFilter,
      });
      await expect(roomType).toBeHidden();
      await page
        .getByRole("button", { name: words.roomCalendar.filters })
        .click();
      // CALENDAR-16: the filters say room, not Unit.
      await expect(roomType).toBeVisible();
      expect(words.roomCalendar.typeFilter).not.toMatch(/unit|Birim|الوحدة/i);
      await expect(
        page.getByRole("list", { name: words.roomCalendar.legend }),
      ).toBeVisible();
    });

    test(`the free row says what it counts (${locale})`, async ({ page }) => {
      const propertyId = aDeskProperty();
      aBooking(propertyId, { startsIn: 1, nights: 2, label: "Free" });
      await page.setViewportSize({ width: 1280, height: 860 });
      await signIn(page);
      await openCalendar(page, propertyId, locale);
      const row = page
        .getByRole("rowheader")
        .filter({ hasText: words.roomCalendar.freeRow });
      await expect(row).toHaveAttribute(
        "title",
        words.roomCalendar.freeRowHint,
      );
    });
  });
}

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a bar is not offered a drag it would ignore (CALENDAR-17)", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, {
      startsIn: 1,
      nights: 2,
      label: "Touch",
    });
    await page.setViewportSize({ width: 768, height: 900 });
    await signIn(page);
    await openCalendar(page, propertyId, "en");
    const bar = page
      .locator("[data-bar-key]")
      .filter({ hasText: booking.guestName })
      .first();
    await expect(bar).toHaveAttribute(
      "title",
      messages.en.roomCalendar.dragHintTouch,
    );
    await expect(page.locator("main")).toContainText(
      messages.en.roomCalendar.moveHintTouch,
    );
    await expect(page.locator("main")).not.toContainText(
      messages.en.roomCalendar.moveHint,
    );
  });
});
