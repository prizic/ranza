import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import { EMAIL, signIn } from "./front-desk";

/**
 * Closing the day, as a front desk does it (docs/features/close-the-day).
 *
 * Every test brings a Property of its own and archives it afterwards. A close
 * can never be deleted, so the shared test Property would have its yesterday
 * closed by the first run of the day and offer nothing to close to the second;
 * and an archived Property leaves the switcher, so the runs do not pile up in
 * front of the person who opens the workspace next.
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-26");

const made: string[] = [];

test.afterAll(() => {
  if (made.length === 0) return;
  psql(
    `update public.properties set status = 'archived', updated_at = now()
      where id in (${made.map((id) => `'${id}'`).join(",")})`,
  );
});

/**
 * A new Property in the seeded Staff Member's Organization, with the front
 * desk on and the Staff Member assigned — the way the workspace will reach it.
 */
function aProperty(): string {
  const name = `E2E Close ${randomUUID().slice(0, 8)}`;
  const propertyId = psql(
    `with member as (
       select id from public.users where lower(email) = lower('${EMAIL}')
     ), home as (
       select property.organization_id as id
       from public.properties as property
       join public.property_assignments as assignment
         on assignment.property_id = property.id
        and assignment.user_id = (select id from member)
       order by property.name
       limit 1
     ), created as (
       insert into public.properties (organization_id, name)
       select id, '${name}' from home
       returning id, organization_id
     ), capability as (
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select created.id, created.organization_id, wanted.key, true
       from created,
            (values ('today'), ('front_desk'), ('finance')) as wanted (key)
     ), assignment as (
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select id, organization_id, (select id from member) from created
     )
     select id from created`,
  );
  expect(
    propertyId,
    "no seeded Organization to put a Property in — run pnpm db:seed:dev",
  ).not.toBe("");
  made.push(propertyId);
  return propertyId;
}

/** Somebody booked for last night who never came. */
function aNoShow(propertyId: string): string {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test Absent ${tag}`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'E2E-C-${tag}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id,
        guest_id, stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id,
            guest.id, 'guest', 'confirmed',
            app.property_today(unit.property_id) - 1,
            app.property_today(unit.property_id) + 2
     from unit, guest`,
  );
  return guestName;
}

/** A Guest who left two days ago with a bill still open. */
function aFolioLeftOpen(propertyId: string): void {
  const tag = randomUUID().slice(0, 8);
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'E2E-F-${tag}', 'room', 2 from target
       returning id, property_id, organization_id
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type,
          status, starts_on, ends_on)
       select organization_id, property_id, id, 'guest', 'departed',
              app.property_today(property_id) - 4,
              app.property_today(property_id) - 2
       from unit
       returning id, property_id, organization_id
     ), folio as (
       insert into public.folios (organization_id, property_id, stay_id, currency)
       select organization_id, property_id, id, 'TRY' from stay
       returning id, property_id, organization_id
     )
     insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description, amount_minor)
     select organization_id, property_id, id, 'charge', 'Minibar', 4500 from folio`,
  );
}

test("a day with items open asks for a reason, and what it promises is built", async ({
  page,
}) => {
  const propertyId = aProperty();
  const guestName = aNoShow(propertyId);
  aFolioLeftOpen(propertyId);
  await signIn(page);

  await page.goto(`/en/close-day?property=${propertyId}`);
  await expect(page.getByText(/is ready to close/)).toBeVisible();

  // Open items offer what resolves them, and the Folio is listed, not blocking.
  const absent = page.getByRole("listitem").filter({ hasText: guestName });
  await expect(
    absent.getByRole("link", { name: "Open arrivals" }),
  ).toBeVisible();
  await absent.getByRole("button", { name: /More actions/ }).click();
  await expect(
    page.getByRole("menuitem", { name: "Mark as no-show" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Cancel booking" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Folios left open")).toBeVisible();
  await expect(page.getByText("Does not hold up the close")).toBeVisible();
  // Room nights are charged by the close and never hold it up (ADR 0038).
  await expect(
    page.getByText(/charges every Guest in house that night/),
  ).toBeVisible();
  // One sentence says which things need a reason and which never do.
  await expect(
    page.getByText(/Nothing here stops a close\. Arrivals and departures/),
  ).toBeVisible();

  // Nothing the product cannot do.
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(/Accounting|cannot be undone/i);

  await page.getByRole("button", { name: /^Close / }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/1 item is still open/)).toBeVisible();
  await expect(dialog.getByText(/not available yet/)).toBeVisible();
  // Required: the browser holds the close back until a reason is written.
  await dialog.getByRole("button", { name: /^Close / }).click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Reason")
    .fill("Guest rang, arriving tonight instead");
  await dialog.getByRole("button", { name: /^Close / }).click();

  await expect(page.getByText(/ is still open$/)).toBeVisible();
  await expect(page.getByText(/can be closed after 04:00/)).toBeVisible();
  const recent = page.getByRole("row").filter({ hasText: EMAIL });
  await expect(recent).toBeVisible();
});

test("a quiet day closes without a reason, and a backlog names how many wait", async ({
  page,
}) => {
  const propertyId = aProperty();
  // Three days ago closed by a job, so two are waiting.
  psql(
    `set session_replication_role = replica;
     insert into public.business_day_closes
       (organization_id, property_id, business_date, closed_by_job)
     select organization_id, id, app.property_today(id) - 3, 'test.fixture'
     from public.properties where id = '${propertyId}';`,
  );
  await signIn(page);

  await page.goto(`/en/close-day?property=${propertyId}`);
  await expect(
    page.getByText(/2 days are waiting to be closed, .* to .*\./),
  ).toBeVisible();
  await expect(page.getByText("Nothing left open.").first()).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Automatically" }),
  ).toBeVisible();

  // Two days wait and nothing holds either, so both ways to close are offered.
  await page.getByRole("button", { name: /^Close only / }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Nothing is left open/)).toBeVisible();
  await expect(dialog.getByLabel("Reason")).toHaveCount(0);
  await dialog.getByRole("button", { name: /^Close / }).click();

  await expect(page.getByText("1 day waiting", { exact: true })).toBeVisible();
});

test("a close already made elsewhere says so", async ({ page }) => {
  const propertyId = aProperty();
  await signIn(page);

  await page.goto(`/en/close-day?property=${propertyId}`);
  await page.getByRole("button", { name: /^Close / }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Closed behind the desk's back, the way the worker would.
  psql(
    `begin;
     select app.set_worker_context(organization_id, 'business_day.close')
       from public.properties where id = '${propertyId}';
     insert into public.business_day_closes (organization_id, property_id, business_date)
     select organization_id, id, app.property_today(id) - 1
     from public.properties where id = '${propertyId}';
     commit;`,
  );

  await dialog.getByRole("button", { name: /^Close / }).click();
  await expect(
    dialog.getByText(/already been closed, by another desk or automatically/),
  ).toBeVisible();

  // Pressing it again could only be refused again: the confirm is gone, and
  // Done is what is left (CD-S3-07).
  await expect(dialog.getByRole("button", { name: /^Close / })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Not now" })).toHaveCount(0);

  // Read first, then the screen catches up: the day is closed, and by nobody.
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/ is still open$/)).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Automatically" }),
  ).toBeVisible();
});

/**
 * Guests in house in two of a Property's three rooms since yesterday, each
 * booked at a price: the nights the close of yesterday has to charge, one per
 * occupied room and none for the empty one. Written by the owner connection
 * with the triggers lifted, because the close is what is under test and not how
 * a Guest came to be in house at a price: the stamp that prices a booking
 * answers to a Staff Member's reach, which a fixture has none of. The reference
 * the lifted trigger would have given is made the way it makes one, because
 * `reservation_lifecycle.test.sql` reads every Reservation's.
 */
function twoRoomsInHouse(propertyId: string): string[] {
  const guests = [0, 1].map(() => `Test Occupant ${randomUUID().slice(0, 8)}`);
  for (const guestName of guests) {
    psql(
      `set session_replication_role = replica;
       with target as (
         select id, organization_id from public.properties where id = '${propertyId}'
       ), unit as (
         insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity)
         select id, organization_id, 'E2E-N-' || left('${guestName}', 24), 'room', 2
           from target
         returning id, property_id, organization_id
       ), guest as (
         insert into public.guests (organization_id, full_name)
         select organization_id, '${guestName}' from target
         returning id
       ), booking as (
         insert into public.reservations
           (organization_id, property_id, accommodation_unit_id, guest_id,
            stay_type, status, starts_on, ends_on,
            nightly_rate_minor, rate_currency, reference)
         select unit.organization_id, unit.property_id, unit.id, guest.id,
                'guest', 'checked_in',
                app.property_today(unit.property_id) - 1,
                app.property_today(unit.property_id) + 2,
                ${ROOM_NIGHT_MINOR}, 'TRY',
                app.reservation_reference(
                  nextval('public.reservation_reference_seq'))
           from unit, guest
         returning id, organization_id, property_id, accommodation_unit_id
       ), stay as (
         insert into public.stays
           (organization_id, property_id, accommodation_unit_id, reservation_id,
            stay_type, status, starts_on, ends_on)
         select booking.organization_id, booking.property_id,
                booking.accommodation_unit_id, booking.id, 'guest', 'in_house',
                app.property_today(booking.property_id) - 1,
                app.property_today(booking.property_id) + 2
           from booking
         returning id, organization_id, property_id
       )
       insert into public.folios (organization_id, property_id, stay_id, currency)
       select organization_id, property_id, id, 'TRY' from stay`,
    );
  }
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'E2E-N-empty', 'room', 2
       from public.properties where id = '${propertyId}'`,
  );
  return guests;
}

const ROOM_NIGHT_MINOR = 150_000;

test("closing posts one room night per occupied room, and a second close of the day posts none", async ({
  page,
  context,
}) => {
  const propertyId = aProperty();
  const guests = twoRoomsInHouse(propertyId);
  const roomNights = () =>
    psql(
      `select count(*) || '|' || count(distinct line.folio_id) || '|'
              || coalesce(sum(line.amount_minor), 0)
         from public.folio_lines as line
         join public.folios as folio on folio.id = line.folio_id
        where folio.property_id = '${propertyId}'
          and line.source = 'room_night'
          and line.business_date = app.property_today('${propertyId}') - 1`,
    );
  const closeOf = (screen: typeof page) =>
    screen.getByRole("button", { name: /^Close / });
  await signIn(page);

  // The night before the close, said before it is closed: two nights, at the
  // price the bookings were taken at.
  await page.goto(`/en/close-day?property=${propertyId}`);
  await expect(page.getByText(/is ready to close/)).toBeVisible();
  await expect(
    page.getByText("2 nights to charge · TRY 3,000.00"),
  ).toBeVisible();
  expect(roomNights()).toBe("0|0|0");

  // A second desk has the same day open, and presses close after the first.
  const second = await context.newPage();
  await second.goto(`/en/close-day?property=${propertyId}`);
  await closeOf(second).click();
  const secondDialog = second.getByRole("dialog");
  await expect(secondDialog).toBeVisible();

  await closeOf(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Close / }).click();
  await expect(page.getByText(/ is still open$/)).toBeVisible();

  // One room night for each occupied room — a charge on each Guest's Folio at
  // the price — and nothing for the empty one.
  expect(roomNights()).toBe(`2|2|${2 * ROOM_NIGHT_MINOR}`);
  const closed = page.getByRole("row").filter({ hasText: EMAIL });
  await expect(closed).toContainText("2 · TRY 3,000.00");
  await page.locator("#recent-closes").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(EVIDENCE, "closed-with-two-room-nights.png"),
  });

  // The second desk's close of the same day is refused, and charges nothing.
  await secondDialog.getByRole("button", { name: /^Close / }).click();
  await expect(
    secondDialog.getByText(
      /already been closed, by another desk or automatically/,
    ),
  ).toBeVisible();
  expect(roomNights()).toBe(`2|2|${2 * ROOM_NIGHT_MINOR}`);
  // The refused desk is not offered the same close again, only Done.
  await expect(
    secondDialog.getByRole("button", { name: /^Close / }),
  ).toHaveCount(0);
  await second.screenshot({
    path: path.join(EVIDENCE, "second-close-refused.png"),
  });

  // Done dismisses it and the screen shows the day as closed, by the desk
  // that closed it.
  await secondDialog.getByRole("button", { name: "Done" }).click();
  await expect(secondDialog).toBeHidden();
  await expect(
    second.getByRole("row").filter({ hasText: EMAIL }),
  ).toContainText("2 · TRY 3,000.00");
  await second.close();

  // The charge is on each Guest's own bill, where the desk reads it.
  const folioId = psql(
    `select folio.id from public.folios as folio
       join public.stays as stay on stay.id = folio.stay_id
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guests[0]}'`,
  );
  await page.goto(`/en/finance?property=${propertyId}&folio=${folioId}`);
  await expect(page.getByText(/^Room night · /)).toBeVisible();
  await expect(page.getByText("TRY 1,500.00").first()).toBeVisible();
});

test("the close the day screen is in the rail, and mirrors in Arabic", async ({
  page,
}) => {
  const propertyId = aProperty();
  await signIn(page);

  await page.goto(`/en/close-day?property=${propertyId}`);
  await expect(
    page.getByRole("link", { name: "Close the day" }).first(),
  ).toBeVisible();

  await page.goto(`/ar/close-day?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText(/جاهز للإغلاق/)).toBeVisible();
});
