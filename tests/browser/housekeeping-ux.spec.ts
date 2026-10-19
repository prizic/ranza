import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import {
  aGuestInHouse,
  aPropertyTheViewerDoesNotReach,
  signIn,
} from "./front-desk";
import { anArrivalInto, aPropertyWithRooms } from "./ux-rooms";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-65",
);

/**
 * The Housekeeping board, as the 2026-10-11 audit found it (RANZ-65): what
 * "Ready to let" counts, what the board puts first and why, how a phone says a
 * mark landed, and the sentences around the table.
 *
 * Each test brings a Property of its own, because a Stay and a mark are history
 * that is never deleted and an exact figure needs a Property nobody else wrote.
 */

test("Ready to let does not count a room somebody is in, and the board opens on what to clean first", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { propertyId } = aPropertyWithRooms("housekeeping ux", [
    { name: "101", floor: 1, status: "inspected" },
    { name: "102", floor: 2, status: "dirty" },
    { name: "103", floor: 2, status: "clean" },
  ]);
  const guest = anArrivalInto(propertyId, "102");

  await signIn(page);
  // A Guest checked in to a room of its own: clean, ready, and not to be let.
  await aGuestInHouse(page, propertyId);

  await page.goto(`/en/housekeeping?property=${propertyId}`);
  const tile = (label: string) =>
    page.locator("p", { hasText: new RegExp(`^${label}$`) });

  // HK-06: four rooms, three of them ready (101 inspected, 103 clean, and the
  // one with a Guest in it), and only two of those can be let tonight.
  await expect(tile("Rooms").locator("xpath=following-sibling::p")).toHaveText(
    "4",
  );
  await expect(
    tile("Ready to let").locator("xpath=following-sibling::p"),
  ).toHaveText("2");

  // HK-04: the dirty room a Guest arrives into is first, and says why.
  const rows = page.getByRole("row");
  await expect(rows.nth(1)).toContainText("102");
  await expect(rows.nth(1)).toContainText("Arrival today");
  await expect(rows.nth(1)).toContainText("Dirty");
  expect(guest).toContain("102");
  await page.screenshot({
    path: path.join(EVIDENCE, "board-opens-on-what-to-clean-first.png"),
  });

  // HK-05: a floor is a control, not a deep link.
  await page.getByRole("button", { name: "Floor" }).click();
  await page.getByRole("option", { name: /^Floor 1 / }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /101/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /103/ })).toHaveCount(0);
});

test("a phone says a mark landed where it can be seen, and the stale-link page points at the Property control", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { propertyId } = aPropertyWithRooms("housekeeping phone", [
    { name: "101", status: "dirty" },
    { name: "102", status: "dirty" },
  ]);
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  // HK-03: the first room is on the first screen, not under five tall tiles.
  const first = page.getByRole("row").nth(1);
  await expect(first).toBeVisible();
  expect((await first.boundingBox())!.y).toBeLessThan(812);

  // HK-08: tick, mark, and the confirmation is in the window.
  await page.getByRole("checkbox", { name: "Select row" }).first().click();
  const markClean = page.getByRole("button", { name: "Mark clean" });
  // HK-02: and it is a target a thumb can hit, with Mark dirty set apart.
  expect((await markClean.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await markClean.click();
  const confirmation = page.getByText("1 room updated");
  await expect(confirmation).toBeVisible();
  const box = (await confirmation.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  expect(box.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "confirmation-in-the-window-on-a-phone.png"),
  });

  // HK-12: a link naming a Property the viewer does not reach says what to do.
  await page.goto(
    `/en/housekeeping?property=${aPropertyTheViewerDoesNotReach()}`,
  );
  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
  await expect(
    page.getByText(/choose it from the Property control in the bar above/),
  ).toBeVisible();
});

test("the board carries no sentence heading beside its title, and reads in Arabic", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { propertyId } = aPropertyWithRooms("housekeeping ar", [
    { name: "101", status: "dirty" },
    { name: "102" },
  ]);
  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);
  // HK-13: the page bar's h1 is the one heading; a sentence under it that said
  // the same thing, and was wrong for a list with clean rooms in it, is gone.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Housekeeping",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

  await page.goto(`/ar/housekeeping?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("row", { name: /101/ })).toContainText("متسخة");
  // A room nobody has ever marked says so, rather than "not recorded".
  await expect(page.getByRole("row", { name: /102/ })).toContainText(
    "لم تُعلَّم بعد",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "board-in-arabic.png"),
  });
});
