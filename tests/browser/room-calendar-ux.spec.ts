import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { pickDay, propertyDay, signIn, testProperty } from "./front-desk";
import { aDeskProperty, archiveMadeProperties } from "./ux-fixtures";

/**
 * The room calendar, as the UX audit of 2026-10-11 found it (RANZ-59, with the
 * overdue Guest of RANZ-51): the checks only a browser can make, on rooms each
 * run brings with it and a search that finds exactly them.
 */

interface Room {
  id: string;
  name: string;
}

interface Scene {
  propertyId: string;
  tag: string;
  rooms: Record<string, Room>;
}

function aSetOfRooms(
  suffixes: readonly string[],
  propertyId = testProperty(),
): Scene {
  const tag = `UX-${randomUUID().slice(0, 6)}`;
  const values = suffixes.map((suffix) => `('${tag}-${suffix}')`).join(", ");
  const found = psql(
    `with created as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select property.id, property.organization_id, spec.name, 'room', 2
         from public.properties as property,
              (values ${values}) as spec(name)
        where property.id = '${propertyId}'
       returning id, name
     )
     select name || '|' || id from created`,
  );
  const rooms: Record<string, Room> = {};
  for (const line of found.split("\n")) {
    const [name, id] = line.split("|") as [string, string];
    rooms[name.slice(tag.length + 1)] = { id, name };
  }
  return { propertyId, tag, rooms };
}

function aBooking(
  room: Room,
  guest: string,
  nights: { from: number; to: number },
): string {
  return psql(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guest}'
         from public.accommodation_units where id = '${room.id}'
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'confirmed',
            app.property_today(unit.property_id) + ${nights.from},
            app.property_today(unit.property_id) + ${nights.to}
       from public.accommodation_units as unit, guest
      where unit.id = '${room.id}'
     returning id`,
  );
}

/** A Guest in house, with a Folio holding one charge when `owedMinor` is given. */
function anInHouseGuest(
  room: Room,
  guest: string,
  nights: { from: number; to: number },
  owedMinor = 0,
): void {
  psql(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guest}'
         from public.accommodation_units where id = '${room.id}'
       returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select unit.organization_id, unit.property_id, unit.id, guest.id,
              'guest', 'checked_in',
              app.property_today(unit.property_id) + ${nights.from},
              app.property_today(unit.property_id) + ${nights.to}
         from public.accommodation_units as unit, guest
        where unit.id = '${room.id}'
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'guest', 'in_house', starts_on, ends_on
         from arrived
       returning id, organization_id, property_id
     ), folio as (
       insert into public.folios (organization_id, property_id, stay_id, currency)
       select organization_id, property_id, id, 'TRY' from stay
       returning id, organization_id, property_id
     )
     insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor)
     select organization_id, property_id, id, 'charge', 'Minibar', ${owedMinor}
       from folio where ${owedMinor} > 0`,
  );
}

function markRoom(room: Room, status: "dirty" | "clean" | "inspected"): void {
  psql(
    `insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     select id, property_id, organization_id, '${status}'
       from public.accommodation_units where id = '${room.id}'
     on conflict (accommodation_unit_id) do update set status = excluded.status`,
  );
}

async function open(
  page: Page,
  scene: Scene,
  options: { locale?: "en" | "ar" | "tr"; days?: number; from?: string } = {},
): Promise<void> {
  const { locale = "en", days = 14, from } = options;
  const window = `days=${days}${from ? `&from=${from}` : ""}`;
  await page.goto(
    `/${locale}/room-calendar?property=${scene.propertyId}&q=${scene.tag}&${window}`,
  );
  await expect(page.locator("[data-unit-id]").first()).toBeVisible();
}

function bar(page: Page, name: string | RegExp) {
  return page.locator("[data-bar-key]").filter({ hasText: name }).first();
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `docs/evidence/ux-audit/RANZ-59/${name}.png`,
    animations: "disabled",
    caret: "initial",
  });
}

test.afterAll(archiveMadeProperties);

test("an overdue Guest's bar and details say they are still in the room tonight", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  const guest = `Late ${scene.tag}`;
  anInHouseGuest(scene.rooms.A!, guest, { from: -12, to: -10 }, 7_500);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await open(page, scene);

  // The bar's name is for somebody who cannot see it drawn to tonight.
  await expect(bar(page, guest)).toHaveAttribute(
    "aria-label",
    /in house and overdue.*still in the room tonight/,
  );

  await bar(page, guest).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Was due to leave");
  await expect(
    drawer.getByText("Overdue", { exact: true }).first(),
  ).toBeVisible();
  await expect(drawer).toContainText("10 days");
  // Thirteen nights, the first twelve days ago and tonight the last.
  await expect(drawer).toContainText("Nights through tonight");
  await expect(drawer).toContainText("13 nights");
  await expect(drawer).toContainText("Balance as of the last charge");
  await expect(drawer).toContainText("75.00");
  await expect(drawer).toContainText(
    "Later nights post at the close of the day, or at check-out.",
  );
  await expect(drawer).toContainText(
    /Still in the room: 10 days past their date of/,
  );
  await capture(page, "overdue-guest-details");
});

test("a booking's details give its code and whether its room is ready, and no meaningless type", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A", "B"]);
  const early = `Early ${scene.tag}`;
  const later = `Later ${scene.tag}`;
  aBooking(scene.rooms.A!, early, { from: 0, to: 2 });
  aBooking(scene.rooms.B!, later, { from: 3, to: 5 });
  markRoom(scene.rooms.A!, "dirty");
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await open(page, scene);

  await bar(page, early).click();
  const drawer = page.getByRole("dialog");
  const code = psql(
    `select reference from public.reservations reservation
       join public.guests guest on guest.id = reservation.guest_id
      where guest.full_name = '${early}'`,
  );
  await expect(drawer).toContainText(code);
  await expect(drawer.getByText("Room status")).toBeVisible();
  await expect(drawer).toContainText("Dirty");
  // "Type: Guest" told staff nothing; only a Resident is worth saying.
  await expect(drawer.getByText("Booked as")).toHaveCount(0);
  // The buttons sit apart from the facts above them.
  const lastFact = await drawer
    .getByText("Reservation", { exact: true })
    .boundingBox();
  const firstButton = await drawer
    .getByRole("button", { name: "Move…" })
    .boundingBox();
  expect(firstButton!.y - (lastFact!.y + lastFact!.height)).toBeGreaterThan(24);
  await capture(page, "booking-details-code-and-room");
  await page.keyboard.press("Escape");

  // A booking days away says nothing of the room's state today.
  await bar(page, later).click();
  await expect(drawer.getByText("Room status")).toHaveCount(0);
});

test("a one-night booking names its Guest at once, on hover and on focus", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  const guest = `Mahmoud ${scene.tag}`;
  aBooking(scene.rooms.A!, guest, { from: 1, to: 2 });
  await page.setViewportSize({ width: 1200, height: 900 });
  await signIn(page);
  await open(page, scene, { days: 30 });

  const target = bar(page, /./);
  await target.hover();
  const card = page.locator("[data-bar-card]");
  // No wait for a browser tooltip: the name is on screen as the pointer lands.
  await expect(card).toContainText(guest, { timeout: 1_000 });
  await expect(card).toContainText("Confirmed");
  await capture(page, "short-bar-names-its-guest");
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);

  await page.keyboard.press("Escape");
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(card).toContainText(guest);
});

test("a Latin name in an Arabic calendar keeps its own direction, so it is cut at its end", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  const guest = `Noor ${scene.tag}`;
  aBooking(scene.rooms.A!, guest, { from: 1, to: 2 });
  await signIn(page);
  await open(page, scene, { locale: "ar", days: 30 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(bar(page, guest).locator("span[dir=auto]")).toHaveText(guest);
});

test("the day headings tell the days apart, mark the month, and tint the weekend", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  aBooking(scene.rooms.A!, `Any ${scene.tag}`, { from: 1, to: 2 });
  await page.setViewportSize({ width: 1400, height: 900 });
  await signIn(page);

  for (const locale of ["en", "tr", "ar"] as const) {
    await open(page, scene, { locale, days: 30 });
    const headings = page.getByRole("columnheader").filter({
      has: page.locator("span"),
    });
    const weekdays = await headings.evaluateAll((cells) =>
      cells.map((cell) => cell.querySelectorAll("span")[1]?.textContent ?? ""),
    );
    // Seven consecutive days, seven different words: "T F S S M T W" and
    // Turkish "P C C P" are what this replaces.
    expect(weekdays.length).toBe(30);
    expect(new Set(weekdays.slice(0, 7)).size, locale).toBe(7);

    // A 1st is labelled with its month; so is the first column.
    const months = await headings.evaluateAll((cells) =>
      cells.map((cell) => cell.querySelectorAll("span")[0]?.textContent ?? ""),
    );
    expect(months[0], locale).not.toBe("");
    expect(months.slice(1).filter(Boolean).length, locale).toBeGreaterThan(0);

    // Saturday and Sunday are tinted: two in every seven.
    const tinted = await headings.evaluateAll(
      (cells) =>
        cells.filter((cell) => cell.className.includes("bg-muted")).length,
    );
    // Today is tinted as today, so a month of weekends is seven or eight.
    expect(tinted, locale).toBeGreaterThanOrEqual(7);
    expect(tinted, locale).toBeLessThanOrEqual(9);
    if (locale === "tr") await capture(page, "day-headings-turkish-30-days");
  }
});

test("the bars are one tab stop, and the arrow keys move between them", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A", "B"]);
  aBooking(scene.rooms.A!, `First ${scene.tag}`, { from: 1, to: 3 });
  aBooking(scene.rooms.A!, `Second ${scene.tag}`, { from: 4, to: 6 });
  aBooking(scene.rooms.B!, `Third ${scene.tag}`, { from: 1, to: 3 });
  await page.setViewportSize({ width: 1400, height: 900 });
  await signIn(page);
  await open(page, scene);

  const bars = page.locator("[data-bar-key]");
  await expect(bars).toHaveCount(3);
  // Three bars, one place in the tab order.
  await expect(page.locator('[data-bar-key][tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('[data-bar-key][tabindex="-1"]')).toHaveCount(2);

  await bar(page, "First").focus();
  await page.keyboard.press("ArrowRight");
  await expect(bar(page, "Second")).toBeFocused();
  await expect(bar(page, "Second")).toHaveAttribute("tabindex", "0");
  await expect(bar(page, "First")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowLeft");
  await expect(bar(page, "First")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(bar(page, "Third")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(bar(page, "First")).toBeFocused();
  await page.keyboard.press("End");
  await expect(bar(page, "Second")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bar(page, "First")).toBeFocused();

  // Tab leaves the grid: it does not walk through every booking.
  await page.keyboard.press("Tab");
  await expect(bars.locator("xpath=.").first()).not.toBeFocused();
  await expect(page.locator("[data-bar-key]:focus")).toHaveCount(0);
});

test("on a phone the filters and the legend fold away, and the grid starts high up", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  aBooking(scene.rooms.A!, `Phone ${scene.tag}`, { from: 1, to: 3 });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await open(page, scene);

  // Folded: the grid is a third of the way down the first screen, where it
  // was three-quarters of the way (heading, description, six filters, legend).
  const grid = page.getByRole("table", { name: "Rooms and beds by night" });
  expect((await grid.boundingBox())!.y).toBeLessThan(500);
  await expect(page.getByLabel("Floor")).toBeHidden();
  await expect(page.getByLabel("Unit type")).toBeHidden();
  await expect(
    page.getByRole("list", { name: "What the marks mean" }),
  ).toBeHidden();
  // The room column keeps to a phone's share of the width.
  const roomColumn = await page
    .getByRole("columnheader", { name: "Room" })
    .boundingBox();
  expect(roomColumn!.width).toBeLessThan(100);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await capture(page, "phone-calendar");

  // One button brings the filters back, and counts those narrowing the grid.
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByLabel("Unit type")).toBeVisible();
  await page.getByRole("searchbox").fill("zzz-nothing");
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
});

test("the toolbar names its steps, keeps its two toggles on one line, and marks the date jumped to", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  aBooking(scene.rooms.A!, `Jump ${scene.tag}`, { from: 1, to: 3 });
  await page.setViewportSize({ width: 1200, height: 900 });
  await signIn(page);
  await open(page, scene, { days: 30 });

  // The arrows step seven days whatever the window is, and say so.
  await expect(
    page.getByRole("button", { name: "Previous 7 days" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next 7 days" })).toBeVisible();

  const requested = await page.getByText("Show requested").boundingBox();
  const departed = await page.getByText("Show departed").boundingBox();
  expect(Math.abs(requested!.y - departed!.y)).toBeLessThan(4);

  // The start of a range chosen in the calendar is marked in its column. The
  // window opens on it, so it is the first day shown.
  const start = propertyDay(scene.propertyId, 9);
  const from = page.getByRole("button", { name: /^From:/ });
  await expect
    .poll(() =>
      from.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
  await from.click();
  await pickDay(page, start);
  await pickDay(page, propertyDay(scene.propertyId, 12));
  const marked = page.locator('[role="columnheader"][data-marked]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("aria-label", /date you chose/i);
  const heads = page.getByRole("columnheader");
  await expect
    .poll(() =>
      heads.evaluateAll((cells) =>
        cells.findIndex((cell) => cell.hasAttribute("data-marked")),
      ),
    )
    .toBe(1);
  await capture(page, "jumped-to-date-marked");

  // Any other move clears the mark.
  await page.getByRole("button", { name: "Next 7 days" }).click();
  await expect(marked).toHaveCount(0);
});

test("a window with nothing booked says so under the grid, so the grid does not jump", async ({
  page,
}) => {
  // The note is about the whole Property's window, and the shared test
  // Property is booked open-endedly by other specs: it needs one of its own.
  const scene = aSetOfRooms(["A"], aDeskProperty());
  aBooking(scene.rooms.A!, `Soon ${scene.tag}`, { from: 1, to: 3 });
  await page.setViewportSize({ width: 1200, height: 900 });
  await signIn(page);
  await open(page, scene);

  const grid = page.getByRole("table", { name: "Rooms and beds by night" });
  const before = (await grid.boundingBox())!.y;
  const empty = psql(
    `select to_char(app.property_today('${scene.propertyId}') + 200, 'YYYY-MM-DD')`,
  );
  await open(page, scene, { from: empty });
  await expect(page.getByText(/^Nothing is booked from/)).toBeVisible();
  const after = (await grid.boundingBox())!.y;
  expect(after).toBe(before);
  const note = (await page.getByText(/^Nothing is booked from/).boundingBox())!;
  const gridBox = (await grid.boundingBox())!;
  expect(note.y).toBeGreaterThan(gridBox.y + gridBox.height - 2);
});

test("a 30-day window that does not fit shows a cue at its edge, until it is scrolled to the end", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  aBooking(scene.rooms.A!, `Wide ${scene.tag}`, { from: 1, to: 3 });
  await page.setViewportSize({ width: 1100, height: 900 });
  await signIn(page);
  await open(page, scene, { days: 30 });

  const cue = page.locator("[data-scroll-cue]");
  await expect(cue).toBeVisible();
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Rooms and beds by night"]',
    )!.parentElement!;
    scroller.scrollLeft = scroller.scrollWidth;
  });
  await expect(cue).toHaveCount(0);

  // Fourteen days fit a laptop with the sidebar open: no cue, no hidden days.
  await page.setViewportSize({ width: 1200, height: 900 });
  await open(page, scene, { days: 14 });
  await expect(cue).toHaveCount(0);
});

test("closing a dialog opened from the details puts focus back on the button that opened it", async ({
  page,
}) => {
  const scene = aSetOfRooms(["A"]);
  const guest = `Focus ${scene.tag}`;
  anInHouseGuest(scene.rooms.A!, guest, { from: -1, to: 3 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await open(page, scene);

  await bar(page, guest).click();
  const drawer = page.getByRole("dialog").first();
  const opener = drawer.getByRole("button", { name: "Move guest" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Move Guest" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  const change = drawer.getByRole("button", { name: "Change departure" });
  await change.click();
  const departure = page.getByRole("dialog", { name: "Change departure" });
  await expect(departure).toBeVisible();
  // The dialog gives its first field focus and keeps it there once the Stay's
  // current dates have been read, rather than drawing the field again under it.
  await expect(departure.getByText("Checking those nights…")).toBeHidden();
  await expect(departure.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(departure).toBeHidden();
  await expect(change).toBeFocused();
});
