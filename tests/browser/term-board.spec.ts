import { expect, test, type Locator, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  layoutCookieName,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";

/**
 * A dormitory's room calendar as a term board, with its beds narrowed by block
 * and by whom a room admits (RANZ-109, RC-S7-01 to RC-S7-05, RB-S6-01,
 * RB-S6-02).
 *
 * The unit suites prove the arithmetic and the sabotage runs. This proves what
 * only the running workspace has: a ten-month booking drawn whole on one
 * screen, the same empty-bed number on Today, Rooms and the calendar, and the
 * chips and the address agreeing with each other in all three languages.
 *
 * A Property of the spec's own, because a Stay is never deleted and a reused
 * one would carry the last run's students into this run's figures.
 */

const SHOTS = "docs/evidence/term-board";

function userIdOf(email: string): string {
  return psql(
    `select id from public.users where lower(email) = lower('${email}')`,
  );
}

/**
 * Two blocks, one for women and one for men, with a Resident in house for the
 * term in each: three beds free in Blok A, one in Blok B, none for anyone.
 * The stay runs from the 15th of September of the academic year to the 15th of
 * June, or from three days ago to a month ahead where that is the shorter, so
 * it is in house tonight whenever the spec runs.
 */
function aYurt(): string {
  const { propertyId } = aFreshProperty("term board", {
    capabilities: ["today", "front_desk", "housekeeping"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${propertyId}'`,
  );
  psql(
    `with property as (
       select id, organization_id from public.properties
        where id = '${propertyId}'
     ), room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, building,
          floor, admits)
       select property.id, property.organization_id, wanted.name, 'room', 3,
              wanted.block, 1, wanted.admits
         from property,
              (values ('A-1', 'Blok A', 'female'), ('A-2', 'Blok A', 'female'),
                      ('B-1', 'Blok B', 'male')) as wanted (name, block, admits)
       returning id, property_id, organization_id, name
     )
     insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, bed, 'bed', 1, room.id
       from room
       cross join lateral unnest(
         case room.name when 'A-1' then array['A', 'B', 'C']
                        when 'A-2' then array['A']
                        else array['A', 'B'] end) as bed`,
  );
  for (const [room, guest, gender] of [
    ["A-1", "Elif Yurt", "female"],
    ["B-1", "Mert Yurt", "male"],
  ] as const) {
    psql(
      `with bed as (
         select bed.id, bed.property_id, bed.organization_id
           from public.accommodation_units as bed
           join public.accommodation_units as room on room.id = bed.parent_id
          where room.property_id = '${propertyId}' and room.name = '${room}'
            and bed.name = 'A'
       ), term as (
         select app.property_today('${propertyId}')                 as today,
                make_date(
                  extract(year from app.property_today('${propertyId}'))::int
                  - (extract(month from app.property_today('${propertyId}')) < 7)::int,
                  9, 1)                                             as starts
       ), guest as (
         insert into public.guests (organization_id, full_name, gender)
         select organization_id, '${guest}', '${gender}' from bed
         returning id
       ), arrived as (
         insert into public.reservations
           (organization_id, property_id, accommodation_unit_id, guest_id,
            stay_type, status, starts_on, ends_on)
         select bed.organization_id, bed.property_id, bed.id, guest.id,
                'resident', 'checked_in',
                least(term.today - 3, term.starts + 14),
                greatest(term.starts + 287, term.today + 30)
           from bed, guest, term
         returning id, organization_id, property_id, accommodation_unit_id,
                   starts_on, ends_on
       )
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'resident', 'in_house', starts_on, ends_on
         from arrived`,
    );
  }
  return propertyId;
}

async function drawTodayAs(page: Page, layout: TodayLayout): Promise<void> {
  await page.context().addCookies([
    {
      name: layoutCookieName(userIdOf(OWNER_EMAIL)),
      value: layout,
      domain: "localhost",
      path: "/",
    },
  ]);
}

/** The number a chip carries: its label is the words and then the count. */
async function countOn(chip: Locator): Promise<number> {
  const text = (await chip.textContent()) ?? "";
  return Number(text.match(/(\d+)\s*$/)?.[1]);
}

test("a ten-month booking is drawn whole on a dormitory's term, which it opens on", async ({
  page,
}) => {
  const yurt = aYurt();
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/room-calendar?property=${yurt}`);

  await expect(
    page.getByRole("button", { name: "Term", pressed: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Open a booking to move it or change its departure/),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Sep 20\d\d$/ }),
  ).toBeVisible();
  // No cell a day, and so no grip to drag by: the bar opens instead.
  await expect(page.locator("[data-day]")).toHaveCount(0);
  await expect(page.locator("[data-end-handle]")).toHaveCount(0);

  const scroller = page.locator("[aria-busy]").first();
  const bar = page.getByRole("button", { name: /Elif Yurt/ });
  await expect(bar).toBeVisible();
  const [barBox, scrollBox] = await Promise.all([
    bar.boundingBox(),
    scroller.boundingBox(),
  ]);
  // Whole: from its first night to its departure inside the board, with no
  // scrolling to find either end, and a term's worth of width.
  expect(barBox!.x).toBeGreaterThanOrEqual(scrollBox!.x);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(
    scrollBox!.x + scrollBox!.width + 1,
  );
  expect(barBox!.width).toBeGreaterThan(scrollBox!.width * 0.4);
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/term-en.png`,
  });

  // Opening a bar is the quick action at this scale.
  await bar.click();
  await expect(page.getByRole("dialog")).toContainText("Elif Yurt");
  await page.keyboard.press("Escape");

  // Thirty days is the day scale again, with the bar to be dragged.
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page.locator("[data-day]").first()).toBeAttached();
  await expect(bar).toHaveClass(/cursor-grab/);
  await page.getByRole("button", { name: "Term" }).click();
  await expect(page.locator("[data-day]")).toHaveCount(0);
});

test("a hotel keeps the days it had, and a dormitory is told how to read a term in Turkish and Arabic", async ({
  page,
}) => {
  const yurt = aYurt();
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/tr/room-calendar?property=${yurt}`);
  await expect(
    page.getByRole("button", { name: "Dönem", pressed: true }),
  ).toBeVisible();
  await expect(page.getByText("Blok A").first()).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/term-tr.png`,
  });

  await page.goto(`/ar/room-calendar?property=${yurt}&block=Blok%20A`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: "الفصل", pressed: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/term-ar.png`,
  });

  const hotel = aFreshProperty("hotel keeps days", {
    capabilities: ["today", "front_desk", "housekeeping"],
  }).propertyId;
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'H-101', 'room', 2
       from public.properties where id = '${hotel}'`,
  );
  await page.goto(`/en/room-calendar?property=${hotel}`);
  await expect(
    page.getByRole("button", { name: "14 days", pressed: true }),
  ).toBeVisible();
  // One kind of room and one building: nothing to narrow by.
  await expect(
    page.getByRole("region", { name: "Narrow the beds" }),
  ).toHaveCount(0);
});

test("the empty beds are the same number on Today, Rooms and the calendar, and the chips narrow them", async ({
  page,
}) => {
  const yurt = aYurt();
  await signIn(page, OWNER_EMAIL);

  // Today: the card's figures for women, men and anyone.
  await drawTodayAs(page, "timeline");
  await page.goto(`/en/today?property=${yurt}`);
  const card = page.getByRole("region", { name: "Empty beds tonight" });
  await expect(
    card.getByRole("link", { name: "3 free tonight in rooms for women only" }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "1 free tonight in rooms for men only" }),
  ).toBeVisible();

  // Rooms: the tile, then the chips, then a block from an address as Today's
  // per-block figures will open it.
  await page.goto(`/en/rooms?property=${yurt}`);
  await expect(
    page.getByText("Empty beds tonight", { exact: true }).locator(".."),
  ).toContainText("4");
  const roomBlocks = page.getByRole("group", { name: "Block" });
  expect(
    await countOn(roomBlocks.getByRole("button", { name: /^All blocks/ })),
  ).toBe(4);
  expect(
    await countOn(roomBlocks.getByRole("button", { name: /^Blok A/ })),
  ).toBe(3);
  expect(
    await countOn(roomBlocks.getByRole("button", { name: /^Blok B/ })),
  ).toBe(1);

  await page.goto(
    `/en/rooms?property=${yurt}&show=free&admits=female&block=Blok%20A`,
  );
  await expect(page.getByTestId("list-filter-notice")).toContainText(
    "3 free tonight in Blok A, in rooms for women only",
  );
  await expect(page.getByText("A-1", { exact: true })).toBeVisible();
  await expect(page.getByText("B-1", { exact: true })).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/rooms-en.png`,
  });
  // A block the Property has not got narrows nothing.
  await page.goto(`/en/rooms?property=${yurt}&block=Blok%20Z`);
  await expect(page.getByTestId("list-filter-notice")).toHaveCount(0);
  await expect(page.getByText("B-1", { exact: true })).toBeVisible();

  // The calendar: the same counts from the same definition.
  await page.goto(`/en/room-calendar?property=${yurt}`);
  const calendarBlocks = page.getByRole("group", { name: "Block" });
  expect(
    await countOn(calendarBlocks.getByRole("button", { name: /^All blocks/ })),
  ).toBe(4);
  expect(
    await countOn(calendarBlocks.getByRole("button", { name: /^Blok A/ })),
  ).toBe(3);
  const calendarAdmits = page.getByRole("group", { name: "Rooms for" });
  expect(
    await countOn(calendarAdmits.getByRole("button", { name: /^Men only/ })),
  ).toBe(1);

  await calendarBlocks.getByRole("button", { name: /^Blok B/ }).click();
  await expect(page).toHaveURL(/block=Blok\+B/);
  await expect(page.getByTestId("list-filter-notice")).toContainText(
    "1 room in Blok B",
  );
  await expect(
    page.getByRole("rowheader", { name: "B-1" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "A-1" })).toHaveCount(0);
  // Women in Blok B: none, said before the press.
  expect(
    await countOn(calendarAdmits.getByRole("button", { name: /^Women only/ })),
  ).toBe(0);
  await page.screenshot({
    animations: "disabled",
    path: `${SHOTS}/term-narrowed-en.png`,
  });

  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByTestId("list-filter-notice")).toHaveCount(0);
  await expect(
    page.getByRole("rowheader", { name: "A-1" }).first(),
  ).toBeVisible();
});

test("on a phone the chips fold behind Filters, and a narrowed link still says so", async ({
  page,
}) => {
  const yurt = aYurt();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/en/room-calendar?property=${yurt}`);
  await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  const blocks = page.getByRole("group", { name: "Block" });
  await expect(blocks).toBeHidden();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(blocks).toBeVisible();
  await blocks.getByRole("button", { name: /^Blok B/ }).click();

  // The sentence stays in view with the chips folded, and Filters counts the
  // choice, so a narrowed board is never silent.
  await expect(page.getByTestId("list-filter-notice")).toContainText(
    "1 room in Blok B",
  );
  await page.goto(`/en/room-calendar?property=${yurt}&block=Blok%20B`);
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Block" }).getByRole("button", {
      name: /^Blok B/,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
