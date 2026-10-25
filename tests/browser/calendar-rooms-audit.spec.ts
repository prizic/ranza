import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { DESK_EMAIL, propertyDay, signIn } from "./front-desk";
import { aPropertyWithRooms } from "./ux-rooms";
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

const EVIDENCE = "docs/evidence/ux-audit-2026-10-24/calendar-rooms";

/** The words of a message before its first `{placeholder}`. */
const before = (message: string) => message.split("{")[0]!.trim();

function unitId(propertyId: string, name: string): string {
  return psql(
    `select id from public.accommodation_units
      where property_id = '${propertyId}' and name = '${name}'`,
  );
}

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

for (const locale of LOCALES) {
  const words = messages[locale];
  const rooms = words.roomsPage;

  test.describe(`the Rooms page in ${locale}`, () => {
    test(`a Front desk colleague is told why a room cannot be blocked, not handed a form that refuses (${locale})`, async ({
      page,
    }) => {
      const { propertyId } = aPropertyWithRooms(`calrooms desk ${locale}`, [
        { name: "101" },
        { name: "102" },
      ]);
      await signIn(page, DESK_EMAIL);
      await page.goto(`/${locale}/rooms?property=${propertyId}`);
      const tile = page.locator(`#unit-${unitId(propertyId, "101")}`);
      // CALENDAR-08: the tile says what pressing it opens.
      await expect(tile).toContainText(rooms.roomDetails);
      await tile.click();

      const dialog = page.getByRole("dialog");
      // CALENDAR-09: no form, no Block room, and the reason is named.
      await expect(dialog).toContainText(
        words.staff.permissions.configureAccommodation,
      );
      await expect(
        dialog.getByRole("button", { name: words.blockRoom }),
      ).toHaveCount(0);
      await expect(dialog.locator("form")).toHaveCount(0);
      // CALENDAR-10: and the room can be found on the calendar from here.
      const calendar = dialog.getByRole("link", { name: rooms.showOnCalendar });
      await expect(calendar).toHaveAttribute("href", /room-calendar.*q=101/);
      if (locale === "en") {
        await page.screenshot({
          path: `${EVIDENCE}/rooms-front-desk-dialog.png`,
        });
      }
      await calendar.click();
      await expect(page).toHaveURL(/room-calendar.*q=101/);
    });

    test(`a manager is offered Block only for a room nobody is in, and every tile says what it opens (${locale})`, async ({
      page,
    }) => {
      const { propertyId } = aPropertyWithRooms(`calrooms mgr ${locale}`, [
        { name: "101" },
      ]);
      const housed = anOverdueGuest(propertyId, { daysOverdue: 1 });
      const late = aBooking(propertyId, {
        startsIn: -2,
        nights: 4,
        label: "Late",
      });
      await signIn(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${locale}/rooms?property=${propertyId}`);

      const free = page.locator(`#unit-${unitId(propertyId, "101")}`);
      await expect(free).toContainText(words.manageUnit);
      const inHouse = page.locator(
        `#unit-${unitId(propertyId, housed.unitName)}`,
      );
      await expect(inHouse).toContainText(rooms.roomDetails);
      // CALENDAR-03: a booking whose arrival has passed is not "reserved tonight".
      const lateTile = page.locator(
        `#unit-${unitId(propertyId, late.unitName)}`,
      );
      await expect(lateTile).toContainText(before(rooms.reservedLateBadge));
      await expect(lateTile).not.toContainText(words.reservedTonight);
      if (locale === "en") {
        await page.screenshot({
          path: `${EVIDENCE}/rooms-tiles-say-what-they-open.png`,
        });
      }

      await inHouse.click();
      const details = page.getByRole("dialog");
      await expect(details).toContainText(rooms.occupiedCannotBlock);
      await expect(
        details.getByRole("button", { name: words.blockRoom }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      await lateTile.click();
      await expect(page.getByRole("dialog")).toContainText(
        before(rooms.unitStateReservedLate),
      );
      await page.keyboard.press("Escape");

      await free.click();
      await expect(
        page.getByRole("dialog").getByRole("button", { name: words.blockRoom }),
      ).toBeVisible();
    });

    test(`housekeeping's readiness is on the room, and one chip narrows to the rooms that can be let now (${locale})`, async ({
      page,
    }) => {
      const { propertyId } = aPropertyWithRooms(`calrooms ready ${locale}`, [
        { name: "101", status: "dirty" },
        { name: "102", status: "inspected" },
      ]);
      await signIn(page);
      await page.goto(`/${locale}/rooms?property=${propertyId}`);
      const ready = words.roomCalendar.roomReadiness;
      await expect(
        page
          .locator(`#unit-${unitId(propertyId, "101")}`)
          .locator("..")
          .getByText(ready.dirty),
      ).toBeVisible();
      await page
        .getByRole("button", { name: ready.ready, exact: true })
        .click();
      await expect(page.getByText("101", { exact: true })).toHaveCount(0);
      await expect(page.getByText("102", { exact: true })).toBeVisible();
      if (locale === "en") {
        await page.screenshot({ path: `${EVIDENCE}/rooms-ready-chip.png` });
      }
    });

    test(`Add rooms says what is in the way before the press, asks once for a big batch and never raises the browser's own prompts (${locale})`, async ({
      page,
    }) => {
      const { propertyId } = aPropertyWithRooms(`calrooms add ${locale}`, [
        { name: "101" },
        { name: "102" },
      ]);
      let browserAsked = false;
      page.on("dialog", async (native) => {
        browserAsked = true;
        await native.dismiss();
      });
      await signIn(page);
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`/${locale}/rooms?property=${propertyId}`);
      await page.getByTestId("add-rooms-open").click();
      const dialog = page.getByRole("dialog").first();
      const preview = dialog.getByTestId("add-rooms-preview");
      const submit = dialog.locator("button[type=submit]");

      // CALENDAR-11: numbers already in use are named and the press withheld,
      // with the line in view on a phone.
      await dialog.locator("#firstNumber").fill("101");
      await dialog.locator("#count").fill("3");
      await expect(preview).toContainText(before(rooms.alreadyInUse));
      await expect(preview).toContainText("101");
      await expect(preview).toBeInViewport();
      await expect(submit).toBeDisabled();
      if (locale === "en") {
        await page.screenshot({ path: `${EVIDENCE}/add-rooms-clash.png` });
      }

      // CALENDAR-13: letters are refused beside the field, in this language.
      await dialog.locator("#firstNumber").fill("4O1");
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(
        await dialog
          .locator("#firstNumber")
          .evaluate((input: HTMLInputElement) => input.validationMessage),
      ).toBe("");

      // CALENDAR-11: forty at once is asked about once.
      await dialog.locator("#firstNumber").fill("501");
      await dialog.locator("#count").fill("40");
      await submit.click();
      await expect(dialog).toBeVisible();
      await expect(preview).toContainText("540");
      await expect(preview).toBeInViewport();

      // CALENDAR-14: Escape on a typed batch asks in the app's own dialog.
      await page.keyboard.press("Escape");
      const asking = page
        .getByRole("dialog")
        .filter({ hasText: rooms.discardDraft });
      await expect(asking).toBeVisible();
      await asking.getByRole("button", { name: rooms.discardKeep }).click();
      await expect(dialog.locator("#firstNumber")).toHaveValue("501");
      expect(browserAsked).toBe(false);
    });
  });
}
