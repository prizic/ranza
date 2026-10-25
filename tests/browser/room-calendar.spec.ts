import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { psql } from "./local-database";
import { PASSWORD, pickUnit, signIn, testProperty } from "./front-desk";

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
  await expect(drawer.getByText(fixture.inHouse).first()).toBeVisible();
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
  await page.getByRole("button", { name: "Next 7 days" }).click();
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
  // The shell settles into its 900px layout (the sidebar folds) after the
  // first paint, so the column is measured once two reads agree.
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const x = (await label.boundingBox())!.x;
      const settled = x === last;
      last = x;
      return settled;
    })
    .toBe(true);
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

test("RC-S1-06 and RC-S1-60: a range chosen in the calendar opens from its start, in the shortest length that shows it all, and half a range reaches nothing", async ({
  page,
}) => {
  const fixture = aRoomWithAnOverlap();
  await signIn(page);
  await openCalendar(page, "en", fixture);

  const start = propertyDay(fixture.propertyId, 20);
  // Ten days, which no length on offer is: 14 is the next one up.
  const end = propertyDay(fixture.propertyId, 29);

  const from = page.getByRole("button", { name: /^From:/ });
  await whenHydrated(from);
  await from.click();
  await pickDay(page, start);

  // The end is still to be chosen, so the window under the calendar stays.
  await expect(
    page.getByRole("button", { name: /^To: Add date/ }),
  ).toBeVisible();
  expect(page.url()).not.toContain(`from=${start}`);

  await pickDay(page, end);
  await expect(page).toHaveURL(new RegExp(`from=${start}`));
  // 14 is the default length, so it is the one a URL leaves out.
  expect(page.url()).not.toMatch(/days=/);
});

/** Presses a day in the open date-range calendar, turning months as needed. */
async function pickDay(page: Page, iso: string): Promise<void> {
  const day = page.locator(`td:not([data-outside]) [data-day="${iso}"]`);
  for (let turns = 0; turns < 12 && !(await day.isVisible()); turns++) {
    await page.getByRole("button", { name: /next month/i }).click();
  }
  await day.click();
}

/**
 * Moving a bar (RC-S3-*). The unit suite proves what a drag proposes and what
 * the calendar already knows against it; the integration suite proves the
 * commands agree. This proves what only a browser can: that a real pointer
 * drag opens the preview, writes nothing, and saves through the command.
 */

interface Room {
  id: string;
  name: string;
}

interface Rooms {
  propertyId: string;
  tag: string;
  rooms: Record<string, Room>;
}

/** Rooms of this run's own, named `<tag>-<suffix>`, so a search finds exactly them. */
function aSetOfRooms(
  suffixes: readonly (
    string | { suffix: string; type?: string; status?: string }
  )[],
): Rooms {
  const propertyId = testProperty();
  const tag = `MV-${randomUUID().slice(0, 6)}`;
  const specs = suffixes.map((entry) =>
    typeof entry === "string" ? { suffix: entry } : entry,
  );
  const values = specs
    .map(
      (spec) =>
        `('${tag}-${spec.suffix}', '${spec.type ?? "room"}', '${spec.status ?? "available"}')`,
    )
    .join(", ");
  const found = psql(
    `with created as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, status,
          status_reason, capacity)
       select property.id, property.organization_id, spec.name,
              spec.unit_type, spec.status,
              case when spec.status = 'blocked' then 'E2E fixture' end,
              2
         from public.properties as property,
              (values ${values}) as spec(name, unit_type, status)
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

/** A confirmed booking over nights counted from the Property's today. */
function aBookingOn(
  room: Room,
  guest: string,
  nights: { from: number; to: number },
  status: "confirmed" | "requested" = "confirmed",
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
            'guest', '${status}',
            app.property_today(unit.property_id) + ${nights.from},
            app.property_today(unit.property_id) + ${nights.to}
       from public.accommodation_units as unit, guest
      where unit.id = '${room.id}'
     returning id`,
  );
}

/** A Guest in house: a checked-in booking and its Stay, from yesterday by default. */
function anInHouseGuestIn(
  room: Room,
  guest: string,
  nights: { from: number; to: number } = { from: -1, to: 3 },
): string {
  return psql(
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
       returning id
     )
     select id from stay`,
  );
}

function propertyDay(propertyId: string, days: number): string {
  return psql(
    `select to_char(app.property_today('${propertyId}') + ${days}, 'YYYY-MM-DD')`,
  );
}

async function openRooms(
  page: Page,
  locale: "en" | "ar",
  fixture: Rooms,
): Promise<void> {
  await page.goto(
    `/${locale}/room-calendar?property=${fixture.propertyId}&q=${fixture.tag}`,
  );
  await expect(page.locator("[data-unit-id]").first()).toBeVisible();
}

/** The middle of a Unit's cell for a day, where a pointer can be put. */
async function cellCentre(
  page: Page,
  room: Room,
  day: string,
): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(`[data-unit-id="${room.id}"] [data-day="${day}"]`)
    .boundingBox();
  if (!box) throw new Error(`no cell for ${room.name} on ${day}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A real pointer drag: press inside the bar over `grab.day`, travel to the
 * cell of `drop.day` in `drop.room`'s row, and either release or leave the
 * button down.
 */
async function dragBar(
  page: Page,
  grab: { room: Room; day: string },
  drop: { room: Room; day: string },
  release = true,
): Promise<void> {
  const from = await cellCentre(page, grab.room, grab.day);
  const to = await cellCentre(page, drop.room, drop.day);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 2, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (release) await page.mouse.up();
}

/**
 * Takes hold of the grip at the end of the Stay's or booking's bar in `room`,
 * and pulls it to `toDay`.
 */
async function pullEnd(
  page: Page,
  room: Room,
  toDay: string,
  of: "stay" | "reservation" = "reservation",
): Promise<void> {
  const grip = page
    .locator(`[data-unit-id="${room.id}"]`)
    .locator(`[data-end-handle^="${of}:"]`);
  const box = await grip.boundingBox();
  if (!box) throw new Error(`${room.name} has no end grip`);
  const to = await cellCentre(page, room, toDay);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, y, { steps: 3 });
  await page.mouse.move(to.x, y, { steps: 12 });
  await page.mouse.up();
}

function bookingRow(reservationId: string): string {
  return psql(
    `select accommodation_unit_id || '|' || to_char(starts_on, 'YYYY-MM-DD')
            || '|' || coalesce(to_char(ends_on, 'YYYY-MM-DD'), '')
       from public.reservations where id = '${reservationId}'`,
  );
}

function stayEnd(stayId: string): string {
  return psql(
    `select to_char(ends_on, 'YYYY-MM-DD') from public.stays where id = '${stayId}'`,
  );
}

/**
 * Screenshots for the evidence folder, taken only when asked for. A dialog is
 * photographed tall enough to show its buttons; a drag in progress is not
 * resized, so the pointer stays where it is.
 */
async function evidence(
  page: Page,
  name: string,
  { tall = true }: { tall?: boolean } = {},
): Promise<void> {
  if (!process.env.RANZA_EVIDENCE) return;
  const size = page.viewportSize();
  if (tall) await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: `docs/evidence/m1/RANZ-25/${name}.png` });
  if (tall && size) await page.setViewportSize(size);
}

test("RC-S3-01: a booking dragged to a free room is previewed, writes nothing, and is moved on confirming", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Mover ${tag}`;
  const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });
  await expect(
    page.getByRole("button", { name: new RegExp(`^${guest}, Confirmed`) }),
  ).toBeVisible();

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 4) },
  );

  const dialog = page.getByRole("dialog", { name: "Move booking" });
  const summary = dialog.locator("[data-move-summary]");
  await expect(summary).toContainText(rooms.A!.name);
  await expect(summary).toContainText(rooms.B!.name);
  // From two nights to two nights, a day later: the length is kept.
  await expect(summary).toContainText("2 nights");
  const confirm = dialog.getByRole("button", { name: "Move booking" });
  await expect(confirm).toBeEnabled();
  await evidence(page, "move-preview");

  // Nothing is written by a drop.
  expect(bookingRow(reservationId)).toBe(
    `${rooms.A!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );

  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .locator(`[data-unit-id="${rooms.B!.id}"]`)
      .getByRole("button", { name: new RegExp(`^${guest}, Confirmed`) }),
  ).toBeVisible();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.B!.id}|${propertyDay(propertyId, 3)}|${propertyDay(propertyId, 5)}`,
  );

  await page.goto(`/en/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guest);
  await expect(
    page.getByRole("row", { name: new RegExp(guest) }).getByText(rooms.B!.name),
  ).toBeVisible();
});

test("RC-S3-04: dropped on a room that is booked for those nights, the preview names the booking and cannot be confirmed", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "C"]);
  const guest = `Mover ${tag}`;
  const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  aBookingOn(rooms.C!, `Holder ${tag}`, { from: 3, to: 6 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.C!, day: propertyDay(propertyId, 3) },
    false,
  );
  // While the button is down the outline is already marked as one that
  // cannot go there.
  await expect(page.locator("[data-drop-ghost]")).toHaveAttribute(
    "data-blocked",
    "true",
  );
  await evidence(page, "move-drag-blocked", { tall: false });
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "Move booking" });
  await expect(
    dialog.getByText(
      new RegExp(
        `Holder ${tag} has booked some of those nights \\(.+ to .+\\)\\.`,
      ),
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Move booking" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep as it was" }).click();
  await expect(dialog).toBeHidden();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.A!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );
});

test("RC-S3-03: a booking may arrive the day another leaves, and leave the day another arrives", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Mover ${tag}`;
  const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  aBookingOn(rooms.B!, `Leaving ${tag}`, { from: 0, to: 2 });
  aBookingOn(rooms.B!, `Arriving ${tag}`, { from: 4, to: 6 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 3) },
  );
  const dialog = page.getByRole("dialog", { name: "Move booking" });
  const confirm = dialog.getByRole("button", { name: "Move booking" });
  await expect(confirm).toBeEnabled();
  await expect(dialog.locator("[data-move-conflicts]")).toHaveCount(0);
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.B!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );
});

test("RC-S3-05 and RC-S3-06: a blocked room, a room let by the bed, a day gone by and a stay that ended are each told", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms([
    "A",
    { suffix: "K", status: "blocked" },
    "D",
  ]);
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, '${tag}-bed', 'bed', 1, id
       from public.accommodation_units where id = '${rooms.D!.id}'`,
  );
  aBookingOn(rooms.A!, `Mover ${tag}`, { from: 2, to: 4 });
  psql(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on)
     select organization_id, property_id, id, 'guest', 'departed',
            app.property_today(property_id) - 3,
            app.property_today(property_id) - 1
       from public.accommodation_units where id = '${rooms.K!.id}'`,
  );
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  const dialog = page.getByRole("dialog", { name: "Move booking" });
  const drop = async (
    onto: { room: Room; day: string },
    words: string | RegExp,
  ) => {
    await dragBar(
      page,
      { room: rooms.A!, day: propertyDay(propertyId, 3) },
      onto,
    );
    await expect(dialog.getByText(words)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Move booking" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Keep as it was" }).click();
    await expect(dialog).toBeHidden();
  };

  await drop(
    { room: rooms.K!, day: propertyDay(propertyId, 3) },
    `${rooms.K!.name} is blocked for some of those nights.`,
  );
  await drop(
    { room: rooms.D!, day: propertyDay(propertyId, 3) },
    `${rooms.D!.name} is let by the bed: choose one of its beds.`,
  );
  await drop(
    { room: rooms.A!, day: propertyDay(propertyId, -1) },
    "The arrival must be today or later.",
  );

  // The Stay that ended in the blocked room has no command to move it: the
  // drop explains, in a preview with nothing to confirm.
  await expect(
    page
      .locator(`[data-unit-id="${rooms.K!.id}"]`)
      .getByRole("button", { name: /^No Guest recorded/ }),
  ).toBeVisible();
  await dragBar(
    page,
    { room: rooms.K!, day: propertyDay(propertyId, -2) },
    { room: rooms.A!, day: propertyDay(propertyId, -2) },
  );
  const refused = page.getByRole("dialog", { name: "This cannot be moved" });
  await expect(
    refused.getByText("A stay that has ended cannot be moved."),
  ).toBeVisible();
  await expect(
    refused.getByRole("button", { name: "Move booking" }),
  ).toBeDisabled();
});

test("RC-S3-09: a room taken while the preview was open is refused on confirming, in words, and nothing changes", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const reservationId = aBookingOn(rooms.A!, `Mover ${tag}`, {
    from: 2,
    to: 4,
  });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 3) },
  );
  const dialog = page.getByRole("dialog", { name: "Move booking" });
  const confirm = dialog.getByRole("button", { name: "Move booking" });
  await expect(confirm).toBeEnabled();

  // Somebody else books the room after the preview was read.
  aBookingOn(rooms.B!, `Quicker ${tag}`, { from: 2, to: 4 });
  await confirm.click();
  await expect(dialog.getByText("That Unit is already booked")).toBeVisible();
  await expect(confirm).toBeDisabled();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.A!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );

  // Closing the dialog reads the calendar again, so the booking that won is drawn.
  await dialog.getByRole("button", { name: "Keep as it was" }).click();
  await expect(
    page
      .locator(`[data-unit-id="${rooms.B!.id}"]`)
      .getByRole("button", { name: new RegExp(`^Quicker ${tag}`) }),
  ).toBeVisible();
});

for (const viewport of [
  { name: "a laptop", width: 1280, height: 720 },
  { name: "a phone", width: 390, height: 844 },
]) {
  test(`RC-S3-04: on ${viewport.name} the Move booking actions are in reach, disabled on a conflict and clickable once it is cleared`, async ({
    page,
  }) => {
    const { propertyId, tag, rooms } = aSetOfRooms(["A", "B", "C"]);
    const guest = `Reach ${tag}`;
    const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
    aBookingOn(rooms.C!, `Holder ${tag}`, { from: 3, to: 6 });
    await page.setViewportSize(viewport);
    await signIn(page);
    await openRooms(page, "en", { propertyId, tag, rooms });

    await page
      .getByRole("button", { name: new RegExp(`^${guest}, Confirmed`) })
      .click();
    await page
      .getByRole("dialog", { name: "Reservation details" })
      .getByRole("button", { name: "Move…" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Move booking" });
    const confirm = dialog.getByRole("button", { name: "Move booking" });

    // The conflict: the reason is told and the confirm is visibly disabled,
    // in the viewport without scrolling for it.
    await pickUnit(dialog, rooms.C!.name, "Booked");
    await expect(
      dialog.getByText(
        new RegExp(
          `Holder ${tag} has booked some of those nights \\(.+ to .+\\)\\.`,
        ),
      ),
    ).toBeVisible();
    await expect(confirm).toBeInViewport();
    await expect(confirm).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Keep as it was" }),
    ).toBeInViewport();
    if (viewport.width === 1280) {
      await evidence(page, "move-conflict", { tall: false });
    }

    // Cleared, the same button is enabled and a click reaches it.
    await pickUnit(dialog, rooms.B!.name, "Free");
    await expect(confirm).toBeEnabled();
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport();
    await confirm.click();
    await expect(dialog).toBeHidden();
    expect(bookingRow(reservationId)).toBe(
      `${rooms.B!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
    );
  });
}

test("RC-S3-12: Move… on a booking's details does the same without a pointer", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Keyboard ${tag}`;
  const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  const bar = page.getByRole("button", {
    name: new RegExp(`^${guest}, Confirmed`),
  });
  await bar.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Reservation details" });
  await drawer.getByRole("button", { name: "Move…" }).focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Move booking" });
  // Opened on where it is: nothing to move yet.
  await expect(
    dialog.getByText(
      "The dates and the Unit are the same: there is nothing to change.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Move booking" }),
  ).toBeDisabled();

  await pickUnit(dialog, rooms.B!.name, "Free");
  const confirm = dialog.getByRole("button", { name: "Move booking" });
  await expect(confirm).toBeEnabled();
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.B!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );
});

test("RC-S3-07: a Guest in house dragged to another room is moved, with a reason", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `House ${tag}`;
  const stayId = anInHouseGuestIn(rooms.A!, guest);
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  // The day dropped on is not theirs to choose: they arrived yesterday.
  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 1) },
    { room: rooms.B!, day: propertyDay(propertyId, 2) },
  );
  const dialog = page.getByRole("dialog", { name: "Move Guest" });
  const summary = dialog.locator("[data-move-summary]");
  await expect(summary).toContainText(rooms.A!.name);
  await expect(summary).toContainText(rooms.B!.name);
  const confirm = dialog.getByRole("button", { name: "Move Guest" });
  // The command needs a reason, and asks for it here.
  await expect(confirm).toBeDisabled();
  await dialog.getByText("An upgrade", { exact: true }).click();
  await expect(confirm).toBeEnabled();
  await evidence(page, "move-in-house-with-reason");
  await confirm.click();
  await expect(dialog).toBeHidden();

  expect(
    psql(
      `select unit.name || ' ' || change.reason_kind
         from public.stays as stay
         join public.accommodation_units as unit on unit.id = stay.accommodation_unit_id
         join public.reservation_changes as change on change.stay_id = stay.id
        where stay.id = '${stayId}' and change.kind = 'moved'`,
    ),
  ).toBe(`${rooms.B!.name} upgrade`);
  await expect(
    page
      .locator(`[data-unit-id="${rooms.B!.id}"]`)
      .getByRole("button", { name: new RegExp(`^${guest}, In house`) }),
  ).toBeVisible();
});

test("CALENDAR-02: a Guest in house moves into a room whose booking never arrived and has passed", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Past ${tag}`;
  const stayId = anInHouseGuestIn(rooms.A!, guest);
  // Due three days ago, every night of it behind us: nobody can arrive into
  // those nights, so they do not stand between the Guest and the room.
  aBookingOn(rooms.B!, `Never came ${tag}`, { from: -3, to: 0 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 1) },
    { room: rooms.B!, day: propertyDay(propertyId, 2) },
  );
  const dialog = page.getByRole("dialog", { name: "Move Guest" });
  const confirm = dialog.getByRole("button", { name: "Move Guest" });
  await dialog.getByText("An upgrade", { exact: true }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();

  expect(
    psql(
      `select unit.name
         from public.stays as stay
         join public.accommodation_units as unit on unit.id = stay.accommodation_unit_id
        where stay.id = '${stayId}'`,
    ),
  ).toBe(rooms.B!.name);
});

test("RC-S3-08: pulling the end of a Guest in house previews the new departure, and a booking in the way blocks it", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A"]);
  const stayId = anInHouseGuestIn(rooms.A!, `Stretch ${tag}`);
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await pullEnd(page, rooms.A!, propertyDay(propertyId, 4), "stay");
  const dialog = page.getByRole("dialog", { name: "Change departure" });
  await expect(dialog.locator("[data-move-summary]")).toContainText("5 nights");
  expect(stayEnd(stayId)).toBe(propertyDay(propertyId, 3));
  const save = dialog.getByRole("button", { name: "Save departure" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toBeHidden();
  expect(stayEnd(stayId)).toBe(propertyDay(propertyId, 4));

  // The next booking now begins where they leave: pulling further runs into it.
  aBookingOn(rooms.A!, `Next ${tag}`, { from: 4, to: 6 });
  await page.reload();
  await expect(page.locator('[data-end-handle^="stay:"]')).toBeVisible();

  // A grip shows while its own bar is hovered, and only that bar's: each of
  // the two in the row is hovered, whichever of them comes first.
  const row = page.locator(`[data-unit-id="${rooms.A!.id}"]`);
  const unpainted = "rgba(0, 0, 0, 0)";
  for (const [hovered, other] of [
    ["stay", "reservation"],
    ["reservation", "stay"],
  ]) {
    await row.locator(`[data-bar-key^="${hovered}:"]`).hover();
    await expect(row.locator(`[data-end-handle^="${hovered}:"]`)).not.toHaveCSS(
      "background-color",
      unpainted,
    );
    await expect(row.locator(`[data-end-handle^="${other}:"]`)).toHaveCSS(
      "background-color",
      unpainted,
    );
  }

  await pullEnd(page, rooms.A!, propertyDay(propertyId, 5), "stay");
  const blocked = page.getByRole("dialog", { name: "Change departure" });
  await expect(
    blocked.getByText(
      new RegExp(
        `Next ${tag} has booked some of those nights \\(.+ to .+\\)\\.`,
      ),
    ),
  ).toBeVisible();
  await expect(
    blocked.getByRole("button", { name: "Save departure" }),
  ).toBeDisabled();
});

test("RC-S3-15: pulling the end of a booking shortens it", async ({ page }) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A"]);
  const reservationId = aBookingOn(rooms.A!, `Shorter ${tag}`, {
    from: 2,
    to: 5,
  });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await pullEnd(page, rooms.A!, propertyDay(propertyId, 4));
  const dialog = page.getByRole("dialog", { name: "Move booking" });
  await dialog.getByRole("button", { name: "Move booking" }).click();
  await expect(dialog).toBeHidden();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.A!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );
});

test("RC-S3-16: Escape drops a drag in progress, and a plain click still opens the drawer", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Escape ${tag}`;
  const reservationId = aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 3) },
    false,
  );
  await expect(page.locator("[data-drop-ghost]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-drop-ghost]")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(bookingRow(reservationId)).toBe(
    `${rooms.A!.id}|${propertyDay(propertyId, 2)}|${propertyDay(propertyId, 4)}`,
  );

  await page
    .getByRole("button", { name: new RegExp(`^${guest}, Confirmed`) })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reservation details" }),
  ).toBeVisible();
});

test("RC-S3-11: in Arabic the drag follows the pointer to the left and the dates are the right ones", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const reservationId = aBookingOn(rooms.A!, `Arabic ${tag}`, {
    from: 2,
    to: 4,
  });
  await signIn(page);
  await openRooms(page, "ar", { propertyId, tag, rooms });

  // Later days are to the left in Arabic.
  const [three, four] = [
    await cellCentre(page, rooms.A!, propertyDay(propertyId, 3)),
    await cellCentre(page, rooms.A!, propertyDay(propertyId, 4)),
  ];
  expect(four.x).toBeLessThan(three.x);

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 4) },
  );
  const dialog = page.getByRole("dialog", { name: "نقل الحجز" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-move-summary]")).toContainText(
    rooms.B!.name,
  );
  await evidence(page, "move-preview-arabic");
  const confirm = dialog.getByRole("button", { name: "نقل الحجز" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  expect(bookingRow(reservationId)).toBe(
    `${rooms.B!.id}|${propertyDay(propertyId, 3)}|${propertyDay(propertyId, 5)}`,
  );
});

/**
 * A Staff Member who reaches the front desk and may not amend: a role of the
 * Organization's own holding only `front_desk.check_in`, which is what the
 * integration suite uses for the same refusal. Made the way seed.setup.ts makes
 * the others, through the application's own sign-up route.
 */
async function aDeskWithoutAmend(
  request: APIRequestContext,
  baseURL: string,
  propertyId: string,
): Promise<string> {
  const email = "e2e-no-amend@example.test";
  const headers = { origin: new URL("/", baseURL).origin };
  const signedUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password: PASSWORD, name: "No amend" },
  });
  if (!signedUp.ok()) {
    const signedIn = await request.post("/api/auth/sign-in/email", {
      headers,
      data: { email, password: PASSWORD },
    });
    expect(signedIn.ok()).toBe(true);
  }
  await request.get("/en/today");
  psql(
    `with home as (
       select organization_id as id from public.properties where id = '${propertyId}'
     ), role as (
       insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       select id, 'e2e_no_amend', id, 'E2E no amend', array['front_desk.check_in']
         from home
       on conflict do nothing
     ), person as (
       select id from public.users where lower(email) = '${email}'
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select home.id, person.id, 'e2e_no_amend', home.id, 'organization_wide'
       from home, person
     on conflict do nothing`,
  );
  return email;
}

test("RC-S3-10: without front_desk.amend a bar has no grip, no end handle, no Move…, and a drag opens nothing", async ({
  page,
  baseURL,
  request,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms(["A", "B"]);
  const guest = `Reader ${tag}`;
  aBookingOn(rooms.A!, guest, { from: 2, to: 4 });
  anInHouseGuestIn(rooms.B!, `Stays ${tag}`);
  const email = await aDeskWithoutAmend(request, baseURL!, propertyId);
  await signIn(page, email);
  await openRooms(page, "en", { propertyId, tag, rooms });

  const bar = page.getByRole("button", {
    name: new RegExp(`^${guest}, Confirmed`),
  });
  await expect(bar).toBeVisible();
  await expect(bar).not.toHaveAttribute("title", /drag/i);
  await expect(page.locator("[data-end-handle]")).toHaveCount(0);
  await expect(page.getByText(/Drag a booking to another room/)).toHaveCount(0);

  await dragBar(
    page,
    { room: rooms.A!, day: propertyDay(propertyId, 3) },
    { room: rooms.B!, day: propertyDay(propertyId, 3) },
  );
  await expect(page.locator("[data-drop-ghost]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The drawer, opened by a click, offers no Move… either.
  await bar.click();
  const drawer = page.getByRole("dialog", { name: "Reservation details" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Move…" })).toHaveCount(0);
});

test("RC-S3-14: the calendar is filtered by the type and the state of its Units", async ({
  page,
}) => {
  const { propertyId, tag, rooms } = aSetOfRooms([
    "A",
    { suffix: "S", type: "suite" },
    { suffix: "K", status: "blocked" },
  ]);
  await signIn(page);
  await openRooms(page, "en", { propertyId, tag, rooms });
  const rowHeaders = page.getByRole("rowheader", { name: new RegExp(tag) });
  await expect(rowHeaders).toHaveCount(3);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Room type" }).click();
  await page.getByRole("option", { name: "Suite" }).click();
  await expect(rowHeaders).toHaveCount(1);
  await expect(rowHeaders.first()).toContainText(rooms.S!.name);
  await expect(page).toHaveURL(/type=suite/);

  await page.getByRole("combobox", { name: "Room type" }).click();
  await page.getByRole("option", { name: "All types" }).click();
  await page.getByRole("combobox", { name: "Room state" }).click();
  await page.getByRole("option", { name: "Blocked" }).click();
  await expect(rowHeaders).toHaveCount(1);
  await expect(rowHeaders.first()).toContainText(rooms.K!.name);
  await expect(page).toHaveURL(/state=blocked/);

  // A shared link opens the same filter.
  await page.reload();
  await expect(rowHeaders).toHaveCount(1);
});
