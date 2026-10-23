import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./hydration";

import { messages } from "../../apps/operator-workspace/src/messages";
import { aFreshProperty } from "./fresh-property";
import {
  anArrivalToday,
  aStaffMember,
  aStaffMemberHolding,
  signIn,
} from "./front-desk";
import { psql } from "./local-database";

/**
 * The rows of Arrivals and Departures, as a front desk reads them (RANZ-23):
 * "the row carries what the mockup shows (an expected time, a balance, Unit
 * readiness and a row menu), and every action still refuses what it should."
 *
 * Each test brings a Property of its own with the front desk, finance and
 * housekeeping on, and a Manager who reaches only it, so the rows asserted
 * here are the only ones there and a figure on them is this run's.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-23");
const words = messages.en;

function aDesk() {
  return aFreshProperty("desk", {
    capabilities: ["today", "front_desk", "finance", "housekeeping"],
  });
}

async function openArrivals(
  page: Page,
  propertyId: string,
  guestName: string,
  locale = "en",
): Promise<Locator> {
  await page.goto(`/${locale}/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toBeVisible();
  return row;
}

async function openMenu(page: Page, row: Locator): Promise<Locator> {
  await row.locator('button[aria-haspopup="menu"]').click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

function chargeTheStayOf(guestName: string, amountMinor: number): void {
  psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description, amount_minor)
     select folio.organization_id, folio.property_id, folio.id,
            'charge', 'Minibar', ${amountMinor}
     from public.folios as folio
     join public.stays as stay on stay.id = folio.stay_id
     join public.reservations as reservation on reservation.id = stay.reservation_id
     join public.guests as guest on guest.id = reservation.guest_id
     where guest.full_name = '${guestName}' and stay.status = 'in_house'`,
  );
}

function reservationStatusOf(guestName: string): string {
  return psql(
    `select reservation.status from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guestName}'`,
  );
}

function unitOf(guestName: string): string {
  return psql(
    `select reservation.accommodation_unit_id from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guestName}'`,
  );
}

/**
 * The row's menu is part of the row, so it has to be reachable without moving
 * the table sideways. Measured at 1440 pixels, the width the housekeeping spec
 * already calls a desk's usual one: at 1280 the Departures table is 51 pixels
 * wider than the room it has and its menu is scrolled out of view.
 */
async function expectTheWholeRowToBeInView(page: Page): Promise<void> {
  await expect(page.getByRole("table")).toBeVisible();
  expect(
    await page
      .getByRole("table")
      .evaluate(
        (element) =>
          element.parentElement!.scrollWidth -
          element.parentElement!.clientWidth,
      ),
  ).toBeLessThanOrEqual(0);
}

test("an arrival row carries an expected time, the Unit's readiness, a balance and a menu of actions, and follows the Guest in", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const guestName = anArrivalToday(desk.propertyId, "23:30");
  const { email } = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);
  const row = await openArrivals(page, desk.propertyId, guestName);
  await expectTheWholeRowToBeInView(page);

  // All four on the one row, before the Guest is in.
  await expect(row).toContainText("Expected 23:30");
  await expect(row).toContainText(words.ready);
  // Before check-in there is no bill: no Balance column at all, rather than a
  // zero that would claim there is one or a constant "No Folio" on every row.
  await expect(page.getByRole("columnheader", { name: "Balance" })).toHaveCount(
    0,
  );
  await expect(row.getByRole("button", { name: "Check in" })).toBeVisible();

  const menu = await openMenu(page, row);
  await expect(menu.getByRole("menuitem")).toHaveText([
    words.showOnRoomMap,
    words.changeBooking,
    words.markNoShow,
    words.cancelBooking,
  ]);
  await expect(
    menu.getByRole("menuitem", { name: words.openFolio }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "01-arrival-row-and-menu.png"),
  });
  await page.keyboard.press("Escape");

  // In: the time is moot and says nothing, the readiness is the Guest's being
  // in, and the balance is a real one, which a charge then moves.
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText(words.checkedIn)).toBeVisible();
  await expect(row).not.toContainText("Expected");
  await expect(row).toContainText("TRY 0.00");
  const inMenu = await openMenu(page, row);
  await expect(inMenu.getByRole("menuitem")).toHaveText([
    words.openFolio,
    words.showOnRoomMap,
  ]);
  await page.keyboard.press("Escape");

  chargeTheStayOf(guestName, 4500);
  await page.reload();
  await page.getByRole("searchbox").fill(guestName);
  await expect(row).toContainText("TRY 45.00");
  const owing = await openMenu(page, row);
  await expect(
    owing.getByRole("menuitem", { name: words.openFolio }),
  ).toHaveAttribute("href", /finance\?property=.+&folio=[0-9a-f-]+/);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: path.join(EVIDENCE, "02-arrival-row-checked-in-with-balance.png"),
  });
});

test("an arrival into a room that is not ready is asked about, and a room that cannot be let has no button, only why", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const dirty = anArrivalToday(desk.propertyId);
  const blocked = anArrivalToday(desk.propertyId);
  psql(
    `insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     select unit.id, unit.property_id, unit.organization_id, 'dirty'
       from public.accommodation_units as unit where unit.id = '${unitOf(dirty)}'`,
  );
  psql(
    `update public.accommodation_units
        set status = 'blocked', status_reason = 'E2E repair'
      where id = '${unitOf(blocked)}'`,
  );
  const { email } = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);

  // Not ready: said on the row, asked about when the button is pressed, and
  // "Not now" leaves the booking as it was.
  const dirtyRow = await openArrivals(page, desk.propertyId, dirty);
  await expect(dirtyRow).toContainText(words.roomDirty);
  await dirtyRow.getByRole("button", { name: "Check in" }).click();
  await expect(dirtyRow).toContainText("has not been cleaned yet");
  await page.screenshot({
    path: path.join(EVIDENCE, "03-arrival-into-a-room-not-ready.png"),
  });
  await dirtyRow.getByRole("button", { name: words.notNow }).click();
  await expect(
    dirtyRow.getByRole("button", { name: "Check in" }),
  ).toBeVisible();
  expect(reservationStatusOf(dirty)).toBe("confirmed");
  await dirtyRow.getByRole("button", { name: "Check in" }).click();
  await dirtyRow.getByRole("button", { name: words.checkInAnyway }).click();
  await expect(dirtyRow.getByText(words.checkedIn)).toBeVisible();
  expect(reservationStatusOf(dirty)).toBe("checked_in");

  // Blocked: no button to press, and the reason where it would be.
  const blockedRow = await openArrivals(page, desk.propertyId, blocked);
  await expect(
    blockedRow.getByRole("button", { name: "Check in" }),
  ).toHaveCount(0);
  await expect(blockedRow).toContainText(words.checkInBlocked.unit_blocked);
  expect(reservationStatusOf(blocked)).toBe("confirmed");
});

test("cancelling needs a reason, a booking that has since arrived cannot be marked a no-show, and Keep the booking keeps it", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const cancelled = anArrivalToday(desk.propertyId);
  const arrived = anArrivalToday(desk.propertyId);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  await signIn(page, email);

  // A reason of spaces is no reason: the dialog stays, says so, and the
  // booking is as it was. Keeping it closes the dialog and changes nothing.
  const row = await openArrivals(page, desk.propertyId, cancelled);
  await (
    await openMenu(page, row)
  )
    .getByRole("menuitem", { name: words.cancelBooking })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("   ");
  await expect(
    dialog.getByRole("button", { name: words.cancelBooking }),
  ).toBeDisabled();
  await expect(dialog).toContainText(words.dialogHintReason);
  expect(reservationStatusOf(cancelled)).toBe("confirmed");
  await dialog.getByRole("button", { name: words.keepBooking }).click();
  await expect(dialog).toBeHidden();
  expect(reservationStatusOf(cancelled)).toBe("confirmed");

  // Somebody else checks the other Guest in while this desk has the no-show
  // dialog open: pressing it is refused, and the Guest stays checked in.
  const stale = await openArrivals(page, desk.propertyId, arrived);
  await (
    await openMenu(page, stale)
  )
    .getByRole("menuitem", { name: words.markNoShow })
    .click();
  const noShow = page.getByRole("dialog");
  await expect(noShow).toBeVisible();
  const other = await page.context().newPage();
  const checkedIn = await openArrivals(other, desk.propertyId, arrived);
  await checkedIn.getByRole("button", { name: "Check in" }).click();
  await expect(checkedIn.getByText(words.checkedIn)).toBeVisible();
  await other.close();

  await noShow.getByRole("button", { name: words.markNoShow }).click();
  await expect(noShow).toContainText(words.refusalAlreadyCheckedIn);
  expect(reservationStatusOf(arrived)).toBe("checked_in");
});

test("a departure row carries its balance and a menu, and checking out with money owed needs the reason", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const guestName = anArrivalToday(desk.propertyId);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);

  const arriving = await openArrivals(page, desk.propertyId, guestName);
  await arriving.getByRole("button", { name: "Check in" }).click();
  await expect(arriving.getByText(words.checkedIn)).toBeVisible();
  chargeTheStayOf(guestName, 4500);

  await page.goto(`/en/departures?property=${desk.propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toContainText("TRY 45.00");
  await expectTheWholeRowToBeInView(page);
  const menu = await openMenu(page, row);
  await expect(menu.getByRole("menuitem")).toHaveText([
    words.openFolio,
    words.showOnRoomMap,
    words.changeDeparture,
    words.moveGuest,
  ]);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: path.join(EVIDENCE, "04-departure-row-with-balance.png"),
  });

  await row.getByRole("button", { name: /^Check .* out$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("TRY 45.00").first()).toBeVisible();
  // Acknowledged but with no reason: held back, and the Guest is still in.
  await dialog.getByRole("checkbox").click();
  await expect(
    dialog.getByRole("button", { name: words.checkOut, exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText(words.dialogHintReason);
  expect(
    psql(
      `select stay.status from public.stays as stay
         join public.reservations as reservation on reservation.id = stay.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}'`,
    ),
  ).toBe("in_house");
});

test("a reader who may book and neither check in nor out sees the rows and has none of their actions", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const guestName = anArrivalToday(desk.propertyId);
  const waiting = anArrivalToday(desk.propertyId);
  const manager = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  const reader = await aStaffMemberHolding(request, baseURL!, desk.propertyId, [
    "front_desk.book",
  ]);

  await signIn(page, manager.email);
  const arriving = await openArrivals(page, desk.propertyId, guestName);
  await arriving.getByRole("button", { name: "Check in" }).click();
  await expect(arriving.getByText(words.checkedIn)).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, reader.email);

  const row = await openArrivals(page, desk.propertyId, waiting);
  // The information is there: the time, the readiness, the nothing owed yet.
  await expect(row).toContainText("No time given");
  await expect(row).toContainText(words.ready);
  await expect(row.getByRole("button", { name: "Check in" })).toHaveCount(0);
  const menu = await openMenu(page, row);
  await expect(menu.getByRole("menuitem")).toHaveText([words.showOnRoomMap]);
  await page.keyboard.press("Escape");

  await page.goto(`/en/departures?property=${desk.propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  const leaving = page.getByRole("row").filter({ hasText: guestName });
  await expect(leaving).toContainText("TRY 0.00");
  await expect(
    leaving.getByRole("button", { name: /^Check .* out$/ }),
  ).toHaveCount(0);
  const leavingMenu = await openMenu(page, leaving);
  await expect(leavingMenu.getByRole("menuitem")).toHaveText([
    words.openFolio,
    words.showOnRoomMap,
  ]);
});

test("the arrival row in Arabic carries the same four things and mirrors", async ({
  page,
  request,
  baseURL,
}) => {
  const desk = aDesk();
  const guestName = anArrivalToday(desk.propertyId, "23:30");
  const { email } = await aStaffMember(
    request,
    baseURL!,
    desk.propertyId,
    "manager",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, email);
  const row = await openArrivals(page, desk.propertyId, guestName, "ar");

  const ar = messages.ar;
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(row).toContainText(ar.expectedAt.replace("{time}", "23:30"));
  await expect(row).toContainText(ar.ready);
  await expect(
    page.getByRole("columnheader", { name: ar.balance }),
  ).toHaveCount(0);
  const menu = await openMenu(page, row);
  await expect(menu.getByRole("menuitem")).toHaveText([
    ar.showOnRoomMap,
    ar.changeBooking,
    ar.markNoShow,
    ar.cancelBooking,
  ]);
  await page.screenshot({
    path: path.join(EVIDENCE, "05-arrival-row-arabic.png"),
  });
});
