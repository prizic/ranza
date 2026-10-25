import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { DESK_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import { aPropertyWithRooms } from "./ux-rooms";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-62",
);

/**
 * Rooms & beds, as the 2026-10-11 audit found it (RANZ-62): who is offered
 * Add rooms, what an add says it will create, what a refusal says and in which
 * language, and finding a room on a Property with hundreds.
 *
 * Each test brings a Property of its own: a room is never deleted, so a figure
 * or a refusal asserted against a Property shared with other runs would depend
 * on them.
 */

test("a front desk colleague is not offered Add rooms, and a manager sees what an add will create before pressing it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { propertyId } = aPropertyWithRooms("rooms ux", [
    { name: "101" },
    { name: "102" },
    { name: "103" },
  ]);

  // ROOMS-01: the Front desk role does not carry accommodation.configure
  // (RB-S2-03), so the button that could only refuse is not there.
  await signIn(page, DESK_EMAIL);
  await page.goto(`/en/rooms?property=${propertyId}`);
  await expect(page.getByText("101", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add rooms" })).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page);
  await page.goto(`/en/rooms?property=${propertyId}`);
  await page.getByRole("button", { name: "Add rooms" }).click();
  const dialog = page.getByRole("dialog", { name: "Add rooms" });

  // ROOMS-06: the dialog describes itself, not the page, and the type is a
  // room type.
  await expect(
    dialog.getByText("Create rooms in one go. They are numbered in sequence."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("radiogroup", { name: "What are they?" }),
  ).toBeVisible();

  // ROOMS-02: a line says what one press creates.
  await dialog.getByLabel("Building (optional)").fill("Block A");
  await dialog.getByLabel("Floor (optional)").fill("3");
  await dialog.getByLabel("First room number").fill("301");
  await dialog.getByLabel("Number of rooms").fill("40");
  await expect(dialog.getByTestId("add-rooms-preview")).toHaveText(
    "Adds 40 rooms: 301 to 340, floor 3, Block A, sleeps 2",
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "add-rooms-says-what-it-creates.png"),
  });

  // CALENDAR-11: forty at once is asked about once, naming the range.
  await dialog.getByRole("button", { name: "Add 40 rooms" }).click();
  await expect(dialog.getByTestId("add-rooms-preview")).toContainText(
    "301 to 340",
  );
  await dialog.getByRole("button", { name: "Yes, add 40 rooms" }).click();
  await expect(dialog).toBeHidden();
  // ROOMS-05: success says what was written, naming the range.
  await expect(page.getByRole("status")).toContainText(
    "Added 40 rooms: 301 to 340.",
  );

  // ROOMS-09: and a room of the forty is found by its number.
  await page.getByRole("searchbox").fill("340");
  await expect(page.getByText("340", { exact: true })).toBeVisible();
  await expect(page.getByText("101", { exact: true })).toHaveCount(0);
});

for (const language of [
  {
    code: "en",
    taken: "Room 201 already exists at this Property, so no rooms were added.",
    digits:
      "Use digits only, 1 to 8 of them, for example 101. Letters and dashes are not accepted.",
  },
  {
    code: "ar",
    taken: "الغرفة 201 موجودة بالفعل في هذا العقار، لذلك لم تُضف أي غرفة.",
    digits:
      "استخدم أرقامًا فقط، من 1 إلى 8 خانات، مثل 101. لا تُقبل الحروف ولا الشرطات.",
  },
] as const) {
  test(`a refusal is worded by the screen in ${language.code} and the form keeps what was typed`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { propertyId } = aPropertyWithRooms(
      `rooms refusal ${language.code}`,
      [{ name: "101" }],
    );
    await signIn(page);
    await page.goto(`/${language.code}/rooms?property=${propertyId}`);
    if (language.code === "ar") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }

    await page.getByTestId("add-rooms-open").click();
    const dialog = page.getByRole("dialog");

    // ROOMS-04, CALENDAR-13: "4O1" is refused beside the field in this
    // screen's words, as soon as it is typed and before any press, with no
    // native bubble ("Please match the requested format") behind it.
    await dialog.locator("#firstNumber").fill("4O1");
    await expect(dialog.getByRole("alert")).toContainText(language.digits);
    await expect(dialog.locator("#firstNumber")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      await dialog
        .locator("#firstNumber")
        .evaluate((input: HTMLInputElement) => input.validationMessage),
    ).toBe("");

    // CALENDAR-11: a number the page already knows is taken is named before
    // the press, and the press is withheld.
    await dialog.locator("#firstNumber").fill("101");
    await expect(dialog.getByTestId("add-rooms-preview")).toContainText("101");
    await expect(dialog.locator("button[type=submit]")).toBeDisabled();

    // ROOMS-03: a name another desk took after this page was read is named by
    // the database's refusal, in the screen's language, and nothing typed is
    // lost.
    psql(
      `insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '201', 'room', 2
         from public.properties where id = '${propertyId}'`,
    );
    await dialog.locator("#firstNumber").fill("201");
    await dialog.locator("button[type=submit]").click();
    const refusal = dialog.getByRole("alert");
    await expect(refusal).toContainText(language.taken);
    await expect(dialog.locator("#firstNumber")).toHaveValue("201");
    if (language.code === "en") {
      await page.screenshot({
        path: path.join(EVIDENCE, "refusal-in-the-screens-words.png"),
      });
    }
  });
}

test("Escape on a half-typed batch asks first, and the view survives a reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { propertyId } = aPropertyWithRooms("rooms view", [
    { name: "101" },
    { name: "102" },
  ]);
  await signIn(page);
  await page.goto(`/en/rooms?property=${propertyId}`);

  let browserAsked = false;
  page.on("dialog", async (native) => {
    browserAsked = true;
    await native.dismiss();
  });

  await page.getByRole("button", { name: "Add rooms" }).click();
  const dialog = page.getByRole("dialog", { name: "Add rooms" });
  await dialog.getByLabel("First room number").fill("301");
  await page.keyboard.press("Escape");
  // CALENDAR-14: the question is the app's own dialog, not the browser's.
  const asking = page
    .getByRole("dialog")
    .filter({ hasText: "Discard the rooms you were about to add?" });
  await expect(asking).toBeVisible();
  await asking.getByRole("button", { name: "Keep editing" }).click();
  await expect(asking).toBeHidden();
  await expect(dialog.getByLabel("First room number")).toHaveValue("301");

  await page.keyboard.press("Escape");
  await asking.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
  expect(browserAsked).toBe(false);

  // ROOMS-13: the list is in the URL, so a reload and a link keep it.
  await page.getByRole("button", { name: "Room list" }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.reload();
  await expect(
    page.getByRole("columnheader", { name: "Tonight" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Room list" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // ROOMS-13: a Property with no floors does not head its rooms "No floor set".
  await page.getByRole("button", { name: "Room map" }).click();
  await expect(page.getByText("No floor set")).toHaveCount(0);

  // Rule 5: a search that finds nothing says so and offers every room back.
  await page.getByRole("searchbox").fill("zzz");
  await expect(page.getByText("No rooms match")).toBeVisible();
  await page.getByRole("button", { name: "Show all rooms" }).click();
  await expect(page.getByText("101", { exact: true })).toBeVisible();
});

test("on a phone the figures are a compact strip and the first room is on the first screens", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { propertyId } = aPropertyWithRooms("rooms phone", [
    { name: "101" },
    { name: "102" },
    { name: "103" },
  ]);
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto(`/en/rooms?property=${propertyId}`);

  const firstRoom = page.locator("[id^='room-']").first();
  await expect(firstRoom).toBeVisible();
  // ROOMS-11: the six tiles once took 1.3 screens before the first room.
  const box = (await firstRoom.boundingBox())!;
  expect(box.y).toBeLessThan(812);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(EVIDENCE, "rooms-on-a-phone.png") });
});
