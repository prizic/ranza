import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * The room calendar in a browser (RANZ-25).
 *
 * The integration suite proves which bars the read returns. This proves what
 * only a browser can: that they are drawn where their dates are, that an
 * overlap is visible as two bars and a word, that the drawer opens from the
 * bar and from the reader's side of the screen, and that Arabic mirrors.
 *
 * Each run brings its own room, an in-house Guest and a booking over their
 * remaining nights, and takes nothing back: Stays and Reservations are
 * operational history.
 */

interface Fixture {
  propertyId: string;
  tag: string;
  inHouse: string;
  promised: string;
}

/**
 * An in-house Guest from yesterday to three days on, and a booking over some
 * of those nights — by default from tomorrow to four days on.
 *
 * unit_holds_one_occupancy refuses that booking now, so it is a row from
 * before the trigger (RC-S1-25), written with the trigger lifted for the one
 * statement. The other way an overlap arises, the day passing (RC-S1-26),
 * would mean moving the shared test Property's timezone under every other
 * spec.
 */
function aRoomWithAnOverlap(promisedNights = { from: 1, to: 4 }): Fixture {
  const propertyId = testProperty();
  const tag = `CAL-${randomUUID().slice(0, 6)}`;
  const inHouse = `Resident ${tag}`;
  const promised = `Promised ${tag}`;
  const room = psql(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${tag}', 'room', 2
         from public.properties where id = '${propertyId}'
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${inHouse}' from room
       returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select room.organization_id, room.property_id, room.id, guest.id,
              'guest', 'checked_in',
              app.property_today(room.property_id) - 1,
              app.property_today(room.property_id) + 3
         from room, guest
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'guest', 'in_house', starts_on, ends_on
         from arrived
     )
     select id from room`,
  );
  psql(
    `begin;
     alter table public.reservations
       disable trigger reservations_unit_holds_one_occupancy;
     with guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${promised}'
         from public.accommodation_units where id = '${room}'
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'confirmed',
            app.property_today(unit.property_id) + ${promisedNights.from},
            app.property_today(unit.property_id) + ${promisedNights.to}
       from public.accommodation_units as unit, guest
      where unit.id = '${room}';
     -- The deferred pair check has to fire before the table can be altered.
     set constraints all immediate;
     alter table public.reservations
       enable trigger reservations_unit_holds_one_occupancy;
     commit;`,
  );
  return { propertyId, tag, inHouse, promised };
}

async function openCalendar(
  page: Page,
  locale: "en" | "ar",
  fixture: Fixture,
): Promise<void> {
  await page.goto(
    `/${locale}/room-calendar?property=${fixture.propertyId}&q=${fixture.tag}`,
  );
}

/**
 * Until React has hydrated it, a control is the server's copy, which the page
 * moves into place as it streams: focus given to it then is dropped, and so is
 * everything typed after. A warm server answers fast enough for a test to type
 * in that gap, which a person never does. React marks a node it has taken over
 * with a `__reactProps` key, so that is what is waited for, not a delay.
 */
async function whenHydrated(control: Locator): Promise<void> {
  await expect
    .poll(() =>
      control.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

test("RC-S1-25: an overlap is two bars, each marked, and a count", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "en", fixture);

  const inHouse = page.getByRole("button", {
    name: new RegExp(`^${fixture.inHouse}, In house`),
  });
  const promised = page.getByRole("button", {
    name: new RegExp(`^${fixture.promised}, Confirmed`),
  });
  await expect(inHouse).toBeVisible();
  await expect(promised).toBeVisible();
  // Each keeps its own state, told apart by more than a fill (RC-S1-59).
  await expect(inHouse).toHaveAttribute("data-look", "inHouse");
  await expect(promised).toHaveAttribute("data-look", "confirmed");
  // Written on the bar, not only in its accessible name (RC-S1-25).
  await expect(inHouse.getByText("Overlap")).toBeVisible();
  await expect(promised.getByText("Overlap")).toBeVisible();
  // Stacked, not drawn over each other.
  const [top, below] = [
    await inHouse.boundingBox(),
    await promised.boundingBox(),
  ];
  expect(below!.y).toBeGreaterThan(top!.y);
  await expect(
    page.getByRole("button", { name: /\d+ overlaps?/ }),
  ).toBeVisible();
});

test("RC-S1-58 and RC-S1-64: a bar opens its drawer, which points to where the command lives", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "en", fixture);

  const bar = page.getByRole("button", {
    name: new RegExp(`^${fixture.inHouse}, In house`),
  });
  await bar.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", { name: fixture.inHouse }),
  ).toBeVisible();
  await expect(
    drawer.getByText("Another booking holds some of these nights"),
  ).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Open in Departures" }),
  ).toHaveAttribute("href", `/en/departures?property=${fixture.propertyId}`);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(bar).toBeFocused();
});

test("RC-S1-60: the next week is a link that opens the same week", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "en", fixture);

  const today = psql(
    `select to_char(app.property_today('${fixture.propertyId}'), 'YYYY-MM-DD')`,
  );
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  const from = new URL(page.url()).searchParams.get("from")!;
  // The default window starts three days before today; a week on is four after.
  const expected = new Date(`${today}T00:00:00Z`);
  expected.setUTCDate(expected.getUTCDate() + 4);
  expect(from).toBe(expected.toISOString().slice(0, 10));

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`from=${from}`));
  // The room is still listed, and the booking is not: it leaves on the day
  // this week begins, and a window is half-open (RC-S1-03).
  await expect(
    page.getByRole("rowheader", { name: fixture.tag }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${fixture.promised}`) }),
  ).toHaveCount(0);
});

test("RC-S1-55: in Arabic the days run right to left and the drawer opens from the left", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "ar", fixture);

  const inHouse = page.getByRole("button", {
    name: new RegExp(`^${fixture.inHouse}`),
  });
  const promised = page.getByRole("button", {
    name: new RegExp(`^${fixture.promised}`),
  });
  await expect(promised).toBeVisible();
  const [earlier, later] = [
    await inHouse.boundingBox(),
    await promised.boundingBox(),
  ];
  // The booking starts two days after the Stay, so in Arabic it sits further
  // left, and both end further left than they begin.
  expect(later!.x + later!.width).toBeLessThan(earlier!.x + earlier!.width);

  await inHouse.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box!.x).toBeLessThan(page.viewportSize()!.width / 2);
});

test("RC-S1-25 at 30 days: the word is shown only where it can be read", async ({
  page,
}) => {
  // One night of overlap: the booking holds only the night after tomorrow.
  const fixture = aRoomWithAnOverlap({ from: 2, to: 3 });
  await signIn(page);
  await page.goto(
    `/en/room-calendar?property=${fixture.propertyId}&q=${fixture.tag}&days=30`,
  );

  const wide = page.getByRole("button", {
    name: new RegExp(`^${fixture.inHouse}`),
  });
  const narrow = page.getByRole("button", {
    name: new RegExp(`^${fixture.promised}`),
  });
  await expect(narrow).toHaveAccessibleName(/Overlap/);
  // Too narrow for the word: the icons carry it, and they fit the bar
  // rather than being cut by it.
  await expect(narrow.getByText("Overlap")).toHaveCount(0);
  expect(
    await narrow.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  // Wide enough: the word is there and fits inside the bar, not cut by it.
  const word = wide.getByText("Overlap");
  await expect(word).toBeVisible();
  const [wordBox, barBox] = [
    await word.boundingBox(),
    await wide.boundingBox(),
  ];
  expect(wordBox!.x).toBeGreaterThanOrEqual(barBox!.x);
  expect(wordBox!.x + wordBox!.width).toBeLessThanOrEqual(
    barBox!.x + barBox!.width,
  );
  expect(
    await word.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("RC-S1-57: the room column stays pinned while the days scroll", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(
    `/en/room-calendar?property=${fixture.propertyId}&q=${fixture.tag}&days=30`,
  );
  const label = page.getByRole("rowheader", { name: fixture.tag });
  await expect(label).toBeVisible();
  const firstDay = page.getByRole("columnheader").nth(1);
  const before = await label.boundingBox();
  const dayBefore = await firstDay.boundingBox();
  const scrolled = await page.getByRole("table").evaluate((grid) => {
    grid.parentElement!.scrollLeft = 600;
    return grid.parentElement!.scrollLeft;
  });
  // The scroll happened — the days moved — and the room names did not.
  expect(scrolled).toBeGreaterThan(0);
  expect((await firstDay.boundingBox())!.x).toBeLessThan(dayBefore!.x);
  expect((await label.boundingBox())!.x).toBe(before!.x);
});

test("RC-S1-60: a date typed from the keyboard opens that week, and nothing half typed reaches the URL", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "en", fixture);

  // Every URL the page takes on while the date is typed.
  const seen: string[] = [];
  page.on("framenavigated", (frame) => seen.push(frame.url()));
  await page.exposeFunction("recordUrl", (url: string) => seen.push(url));
  await page.evaluate(() => {
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace(...args);
      (window as unknown as { recordUrl: (u: string) => void }).recordUrl(
        location.href,
      );
    };
  });

  const input = page.getByLabel("Go to a date");
  await whenHydrated(input);
  // Focus rather than click: a click lands mid-field, on a later part or the
  // picker button. The order of the parts is the browser's own, so the date
  // is read back rather than assumed; the year passes through 0002, 0020 and
  // 0202 on its way to 2026 whatever the order.
  await input.focus();
  await input.pressSequentially("10152026");
  const typed = await input.inputValue();
  expect(typed).toMatch(/^2026-\d{2}-\d{2}$/);

  const opened = new Date(`${typed}T00:00:00Z`);
  opened.setUTCDate(opened.getUTCDate() - 3);
  const from = opened.toISOString().slice(0, 10);
  await expect(page).toHaveURL(new RegExp(`from=${from}`));
  expect(seen.filter((url) => /from=0/.test(url))).toEqual([]);
});
