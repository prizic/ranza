import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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
  await expect(
    page.getByText(/posted here once rooms have rates/),
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
    page.getByText("2 days are waiting to be closed; the oldest comes first."),
  ).toBeVisible();
  await expect(page.getByText("Nothing left open.").first()).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Automatically" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Close / }).click();
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

  // Read first, then the screen catches up: the day is closed, and by nobody.
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/ is still open$/)).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Automatically" }),
  ).toBeVisible();
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
