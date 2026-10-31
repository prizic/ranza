import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { OWNER_EMAIL, PASSWORD } from "./front-desk";
import { psql } from "./local-database";
import { aPropertyWithRooms } from "./ux-rooms";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/housekeeping/stayover",
);

/**
 * Cleaning of rooms somebody is staying in (RANZ-83, ADR 0063, HK-S4-*).
 *
 * A Property of the spec's own each time: a mark is history that is never
 * deleted, and the figures asserted here are exact.
 */

interface Occupied {
  name: string;
  building: string;
  floor: number;
  /** Days ago the occupant arrived; the Property's own today minus this. */
  arrivedDaysAgo: number;
}

/** A Property with these rooms, each with somebody in it. */
function aPropertyWithOccupiedRooms(
  label: string,
  model: "hotel" | "dormitory",
  rooms: readonly Occupied[],
): string {
  const { propertyId } = aPropertyWithRooms(label, []);
  psql(
    `update public.properties set operating_model = '${model}'
      where id = '${propertyId}'`,
  );
  const values = rooms
    .map(
      (room) =>
        `('${room.name}', '${room.building}', ${room.floor}, ${room.arrivedDaysAgo})`,
    )
    .join(", ");
  psql(
    `with property as (
       select id, organization_id from public.properties
        where id = '${propertyId}'
     ), wanted (name, building, floor, ago) as (values ${values}),
     unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, building, floor)
       select property.id, property.organization_id, wanted.name, 'room', 2,
              wanted.building, wanted.floor
       from property, wanted
       returning id, name, property_id, organization_id
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type, status,
        starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, 'guest',
            'in_house',
            app.property_today(unit.property_id) - wanted.ago,
            app.property_today(unit.property_id) + 30
     from unit join wanted on wanted.name = unit.name`,
  );
  return propertyId;
}

/**
 * Signs in and stops there. The shared `signIn` waits fifteen seconds for the
 * Today page it lands on, and Today on a Property with eighty residents in
 * house takes longer than that on a busy machine; this spec is not about Today.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 90_000 });
}

const liveCleanings = (propertyId: string): number =>
  Number(
    psql(
      `select count(*) from public.housekeeping_stayover_cleanings
        where property_id = '${propertyId}' and undone_at is null`,
    ),
  );

const stayoverUrl = (propertyId: string, locale = "en") =>
  `/${locale}/housekeeping?property=${propertyId}&view=stayover`;

const cards = (page: Page) => page.getByTestId("stayover-card");

const YURT: readonly Occupied[] = [
  { name: "A-101", building: "Blok A", floor: 1, arrivedDaysAgo: 20 },
  { name: "A-201", building: "Blok A", floor: 2, arrivedDaysAgo: 20 },
  { name: "B-101", building: "Blok B", floor: 1, arrivedDaysAgo: 20 },
  // Arrived today: not due on any schedule that is not "every day".
  { name: "B-102", building: "Blok B", floor: 1, arrivedDaysAgo: 0 },
];

test("a dormitory cleans rooms in use weekly: the due rooms show, filter by block and floor, and are marked in one press with undo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = aPropertyWithOccupiedRooms(
    "stayover yurt",
    "dormitory",
    YURT,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(stayoverUrl(propertyId));

  // HK-S4-22: the dormitory's staff read Cleaning in the rail and the page bar.
  await expect(
    page.getByRole("link", { name: "Cleaning", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cleaning");

  // HK-S4-01/05: the dormitory's default is once a week; three rooms are due,
  // and the one that arrived today is not.
  await expect(
    page.getByRole("tab", { name: /Stayover due · 3/ }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByText("Every week on Monday").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "B-102" })).toHaveCount(0);

  // HK-S4-09: block and floor narrow the list, with the counts on the chips.
  const block = page.getByRole("group", { name: "Block" });
  await block.getByRole("button", { name: /^Blok B/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("B-101");
  await block.getByRole("button", { name: /^All blocks/ }).click();
  const floor = page.getByRole("group", { name: "Floor" });
  await floor.getByRole("button", { name: /^Floor 2/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("A-201");
  await floor.getByRole("button", { name: /^All floors/ }).click();

  // HK-S4-10: one press marks the room, and the card answers where the button
  // was; the database holds one live row.
  const mark = page.getByRole("button", { name: "Mark A-101 cleaned" });
  await expect(mark).toBeVisible();
  await mark.click();
  const undo = page.getByRole("button", { name: "Undo cleaning of A-101" });
  await expect(undo).toBeVisible();
  await expect.poll(() => liveCleanings(propertyId)).toBe(1);
  await expect(cards(page)).toHaveCount(3);
  await page.screenshot({
    path: path.join(EVIDENCE, "en-marked.png"),
    fullPage: true,
  });

  // HK-S4-11: undo is one press, and the room is due again.
  await undo.click();
  await expect(
    page.getByRole("button", { name: "Mark A-101 cleaned" }),
  ).toBeVisible();
  await expect.poll(() => liveCleanings(propertyId)).toBe(0);
});

test("the hotel's turnover flow is unchanged by the stayover schedule", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = aPropertyWithOccupiedRooms("stayover hotel", "hotel", [
    { name: "101", building: "Main", floor: 1, arrivedDaysAgo: 3 },
  ]);
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, floor)
     select id, organization_id, '102', 'room', 2, 1
       from public.properties where id = '${propertyId}';
     insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     select unit.id, unit.property_id, unit.organization_id, 'dirty'
       from public.accommodation_units as unit
      where unit.property_id = '${propertyId}' and unit.name = '102'`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  // HK-S4-22: and a hotel still says Housekeeping.
  await expect(
    page.getByRole("link", { name: "Housekeeping", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Housekeeping",
  );

  // A hotel follows the daily default, so the tab is there beside Turnover.
  await expect(
    page.getByRole("tab", { name: /Stayover due · 1/ }),
  ).toBeVisible();

  // Turnover as it always was: the dirty vacant room is marked clean from the
  // row, and the room somebody is in is not made dirty or ready by it.
  const row = page.getByRole("row", { name: /102/ });
  await expect(row).toContainText("Dirty");
  await row.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Mark clean/ })
    .first()
    .click();
  await expect(page.getByRole("row", { name: /102/ })).toContainText("Clean");
  expect(
    psql(
      `select marked.status from public.housekeeping_unit_status as marked
         join public.accommodation_units as unit
           on unit.id = marked.accommodation_unit_id
        where unit.property_id = '${propertyId}' and unit.name = '102'`,
    ),
  ).toBe("clean");
  expect(liveCleanings(propertyId)).toBe(0);

  // HK-S4-03: with no schedule at all the board is exactly the turnover board.
  psql(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select id, organization_id, 'configuration', true
       from public.properties where id = '${propertyId}'`,
  );
  await page.goto(`/en/configuration?property=${propertyId}`);
  const card = page.locator("#stayover");
  await card.getByRole("combobox").click();
  await page.getByRole("option", { name: "Never" }).click();
  await card.getByRole("button", { name: "Save schedule" }).click();
  await expect(card.getByTestId("applies")).toContainText("No schedule");
  await page.goto(`/en/housekeeping?property=${propertyId}`);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /102/ })).toBeVisible();
});

test("the stayover list reads in Turkish, English and Arabic, and mirrors in Arabic", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = aPropertyWithOccupiedRooms(
    "stayover locales",
    "dormitory",
    YURT,
  );
  await signIn(page, OWNER_EMAIL);

  for (const [locale, tab, direction] of [
    ["tr", /Dolu oda temizliği · 3/, "ltr"],
    ["en", /Stayover due · 3/, "ltr"],
    ["ar", /3/, "rtl"],
  ] as const) {
    await page.goto(stayoverUrl(propertyId, locale));
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    await page.screenshot({
      path: path.join(EVIDENCE, `${locale}-stayover.png`),
      fullPage: true,
    });
  }
});

test("phone_reaches_stayover_from_a_tile_in_the_counts_row: on a phone the way to the stayover list is a tile in the counts row, and costs the turnover list no height", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = aPropertyWithOccupiedRooms(
    "stayover phone",
    "dormitory",
    YURT,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  // HK-S4-23: no tab bar above the turnover list; a third tile in the counts
  // row says how many rooms in use are due and opens them.
  await expect(page.getByRole("tab", { name: /Turnover/ })).toBeHidden();
  const tile = page.getByRole("button", { name: /Stayover due\s*3/ });
  await expect(tile).toBeVisible();
  const rooms = page.locator("p", { hasText: /^Rooms$/ }).first();
  expect((await tile.boundingBox())!.y).toBeCloseTo(
    (await rooms.locator("xpath=..").boundingBox())!.y,
    0,
  );
  await tile.click();

  // The way back is the tab bar, which the stayover list does have room for.
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("tab", { name: "Turnover" }).click();
  await expect(
    page.getByRole("button", { name: /Stayover due\s*3/ }),
  ).toBeVisible();
});
