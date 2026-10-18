import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect } from "@playwright/test";
import { test } from "./hydration";

import { psql } from "./local-database";
import {
  aPropertyTheViewerDoesNotReach,
  aStaffMember,
  EMAIL,
  propertyWithHousekeepingOff,
  propertyWithTodayOff,
  signIn,
  testProperty,
} from "./front-desk";
import { startWorker } from "./worker";

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-28");

/**
 * Housekeeping through the screens a front desk actually uses (RANZ-28).
 *
 * The pgTAP suite proves the policies and the worker's function, and the
 * integration suite proves the module and the check-in rule. This proves the
 * part neither can see: that the board shows a dirty room as dirty, that the
 * row menu marks it, and that arrivals asks before checking a Guest into a
 * room that is not ready.
 *
 * Each run brings its own rooms, as the arrivals suite does, because a status
 * change and a check-in are history that is never deleted.
 */

// Readiness depends on the inspection setting, and a spec that dies halfway
// through changing it leaves it changed. Every spec here starts from the test
// Property following its Organization, which sets nothing: inspection off.
test.beforeEach(() => {
  psql(
    `update public.housekeeping_settings set inspect_after_cleaning = null
      where property_id = '${testProperty()}'`,
  );
});

/** A room of this run's own, with a Guest arriving today. Dirty unless told. */
function aRoomWithAnArrival(
  propertyId: string,
  status: "dirty" | "clean" | "inspected" = "dirty",
): {
  unitName: string;
  guestName: string;
} {
  const tag = randomUUID().slice(0, 8);
  const unitName = `E2E-HK-${tag}`;
  const guestName = `Test Housekeeping ${tag}`;

  psql(
    `with target as (
       select id, organization_id, timezone
       from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), dirty as (
       insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       select id, property_id, organization_id, '${status}' from unit
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
            app.property_today(target.id),
            app.property_today(target.id) + 2
     from unit, target, guest`,
  );

  return { unitName, guestName };
}

test("a front desk marks a dirty room clean from the board", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { unitName } = aRoomWithAnArrival(propertyId);

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  await page.getByRole("searchbox").fill(unitName);
  const row = page.getByRole("row").filter({ hasText: unitName });
  await expect(row).toContainText("Dirty");

  await row.getByRole("button", { name: `Actions for ${unitName}` }).click();
  await page.getByRole("menuitem", { name: "Mark clean" }).click();

  await expect(page.getByText("1 room updated")).toBeVisible();
  await expect(row).toContainText("Clean");
});

const made: string[] = [];

test.afterAll(() => {
  if (made.length === 0) return;
  psql(
    `update public.properties set status = 'archived', updated_at = now()
      where id in (${made.map((id) => `'${id}'`).join(",")})`,
  );
});

/**
 * A Property of this run's own, in the seeded Staff Member's Organization, with
 * housekeeping on and Check rooms after cleaning on. The worker is not
 * selective — it delivers every departure waiting in the database — and a
 * Property of the run's own is where the room it dirties is the only one
 * anybody reads, and where a cleaner can be given reach without joining the
 * shared test Property's roster. Archived afterwards, so runs do not pile up
 * in the switcher.
 */
function aPropertyWithInspection(): string {
  const name = `E2E Housekeeping ${randomUUID().slice(0, 8)}`;
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
            (values ('today'), ('front_desk'), ('finance'), ('housekeeping'))
              as wanted (key)
     ), inspection as (
       insert into public.housekeeping_settings
         (organization_id, property_id, inspect_after_cleaning)
       select organization_id, id, true from created
     ), assignment as (
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select id, organization_id, (select id from member) from created
     )
     select id from created`,
  );
  expect(propertyId, "no seeded Organization to put a Property in").not.toBe(
    "",
  );
  made.push(propertyId);
  return propertyId;
}

test("a check-out leaves the room dirty through the worker, and a cleaner takes it to inspected", async ({
  page,
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const propertyId = aPropertyWithInspection();
  // Inspected when the Guest arrives — inspection is on here, so clean would
  // not be ready — so the check-in asks nothing and the only thing that can
  // make the room dirty afterwards is the departure.
  const { unitName, guestName } = aRoomWithAnArrival(propertyId, "inspected");
  const cleaner = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "housekeeping",
  );

  await signIn(page);

  // The desk checks the Guest in and then out, through the real screens.
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const arrival = page.getByRole("row").filter({ hasText: guestName });
  await arrival.getByRole("button", { name: "Check in" }).click();
  await expect(arrival.getByText("Checked in")).toBeVisible();

  await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
  await page.getByRole("searchbox").fill(guestName);
  await page
    .getByRole("row")
    .filter({ hasText: guestName })
    .getByRole("button", { name: /^Check .* out$/ })
    .click();
  const checkOut = page.getByRole("dialog");
  // Three nights early on a booking of two, with nothing owed: the
  // acknowledgement is all the dialog asks.
  await checkOut.getByRole("checkbox").click();
  await checkOut.getByRole("button", { name: "Confirm check-out" }).click();
  await expect(checkOut).toBeHidden();

  const stayId = psql(
    `select stay.id from public.stays as stay
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guestName}'`,
  );
  const stored = () =>
    psql(
      `select held.status || '|' || (held.status_changed_by is null)::text
         from public.housekeeping_unit_status as held
         join public.accommodation_units as unit on unit.id = held.accommodation_unit_id
        where unit.property_id = '${propertyId}' and unit.name = '${unitName}'`,
    );
  const delivered = () =>
    psql(
      `select count(*) from outbox.deliveries as delivery
         join outbox.events as event on event.id = delivery.event_id
        where delivery.consumer = 'housekeeping.markRoomDirtyOnCheckOut'
          and event.payload ->> 'stayId' = '${stayId}'`,
    );

  // Nobody has delivered the departure yet: the stored status is still the
  // inspected the room was given, and the event is waiting. The board reads the
  // room dirty all the same — a Guest has left it since its status was set
  // (HK-S1-22) — so the desk is never told a room is ready that is not.
  expect(stored()).toBe("inspected|true");
  expect(delivered()).toBe("0");
  await page.goto(`/en/housekeeping?property=${propertyId}`);
  await page.getByRole("searchbox").fill(unitName);
  await expect(
    page.getByRole("row").filter({ hasText: unitName }),
  ).toContainText("Dirty");

  // The worker goes round on its own timer. Nobody marks anything: the row the
  // departure leaves behind is written by the worker's handler, stamped with
  // no Staff Member.
  const worker = startWorker();
  try {
    // Under a minute, on purpose: the worker also closes every Property's
    // due business day on a one-minute timer, and a close cannot be undone.
    // A run that outlives it would shut yesterday at the other Properties of
    // the tests, so a worker too slow to deliver this departure in that time
    // fails here instead.
    await expect
      .poll(delivered, {
        message: `the worker said:\n${worker.output()}`,
        timeout: 45_000,
      })
      .toBe("1");
    // This departure's own event, not the process's output: the worker
    // delivers whatever else is waiting in the database too, and an event
    // somebody else's fixture left failing is not this test's to report. It is
    // published in a statement after the delivery commits, so it is awaited
    // before the worker is stopped rather than read once.
    await expect
      .poll(
        () =>
          psql(
            `select (published_at is not null)::text || '|' || coalesce(last_error, '')
               from outbox.events where event_type = 'stay.checked_out'
                and payload ->> 'stayId' = '${stayId}'`,
          ),
        { message: `the worker said:\n${worker.output()}`, timeout: 10_000 },
      )
      .toBe("true|");
  } finally {
    worker.stop();
  }
  expect(stored()).toBe("dirty|true");

  // A cleaner, who reaches this Property and nothing else, finds it dirty.
  const cleanerContext = await browser.newContext({ baseURL: baseURL! });
  const cleanerPage = await cleanerContext.newPage();
  try {
    await signIn(cleanerPage, cleaner.email);
    await cleanerPage.goto(`/en/housekeeping?property=${propertyId}`);
    await cleanerPage.getByRole("searchbox").fill(unitName);
    const row = cleanerPage.getByRole("row").filter({ hasText: unitName });
    await expect(row).toContainText("Dirty");
    await cleanerPage.screenshot({
      path: path.join(EVIDENCE, "cleaner-sees-the-room-dirty.png"),
    });

    // Dirty to clean, which with inspection on is not yet ready to let.
    await row.getByRole("button", { name: `Actions for ${unitName}` }).click();
    await cleanerPage.getByRole("menuitem", { name: "Mark clean" }).click();
    await expect(cleanerPage.getByText("1 room updated")).toBeVisible();
    await expect(row).toContainText("Clean");
    await expect(row).toContainText("Waiting for inspection");

    // Clean to inspected, which is.
    await row.getByRole("button", { name: `Actions for ${unitName}` }).click();
    await cleanerPage.getByRole("menuitem", { name: "Mark inspected" }).click();
    await expect(row).toContainText("Inspected");
    await expect(row).not.toContainText("Waiting for inspection");
    await cleanerPage.screenshot({
      path: path.join(EVIDENCE, "cleaner-marks-the-room-inspected.png"),
    });
  } finally {
    await cleanerContext.close();
  }

  // The last word is the cleaner's, stamped with who pressed the button.
  expect(
    psql(
      `select held.status || '|' || (held.status_changed_by = '${cleaner.userId}')::text
         from public.housekeeping_unit_status as held
         join public.accommodation_units as unit on unit.id = held.accommodation_unit_id
        where unit.property_id = '${propertyId}' and unit.name = '${unitName}'`,
    ),
  ).toBe("inspected|true");
});

test("arrivals asks before checking a Guest into a room that is not ready", async ({
  page,
}) => {
  const propertyId = testProperty();
  const { guestName } = aRoomWithAnArrival(propertyId);

  const ready = aRoomWithAnArrival(propertyId, "clean");

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);

  // A room marked clean reads ready, as a word (HK-S2-18).
  await page.getByRole("searchbox").fill(ready.guestName);
  await expect(
    page.getByRole("row").filter({ hasText: ready.guestName }),
  ).toContainText("Ready");

  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row).toContainText("Not ready");

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row).toContainText("isn't ready yet");

  // The whole warning, inside its cell, at a desk's usual width: the reason
  // is the part that was once cut off, after "it hasn't been clean".
  await page.setViewportSize({ width: 1440, height: 900 });
  const warning = row.getByText("isn't ready yet");
  await expect(warning).toContainText("waiting for inspection");
  expect(
    await warning.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBe(0);
  const table = page.getByRole("table");
  expect(
    await table.evaluate(
      (element) =>
        element.parentElement!.scrollWidth - element.parentElement!.clientWidth,
    ),
  ).toBe(0);

  await row.getByRole("button", { name: "Check in anyway" }).click();
  await expect(row).toContainText("Checked in");
});

test("a manager switches inspection on for one Property and sees what it means", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${propertyId}`);

  const flow = page.getByTestId("flow");
  await page.getByRole("combobox", { name: "For this Property" }).click();
  await page.getByRole("option", { name: "On", exact: true }).click();

  await expect(page.getByText("Saved")).toBeVisible();
  await expect(flow).toContainText("Inspected");

  await page.getByRole("combobox", { name: "For this Property" }).click();
  await page
    .getByRole("option", { name: /Use the Organization's setting/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "For this Property" }),
  ).toContainText("Use the Organization's setting");
});

test("a Property with housekeeping switched off shows the empty state, not another Property's rooms", async ({
  page,
}) => {
  const switchedOff = propertyWithHousekeepingOff();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${switchedOff}`);

  // HK-S1-24: the board of the first Property with housekeeping, under this
  // one's name in the switcher, is what this once showed.
  await expect(page.getByText(/Which rooms need cleaning at/)).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
  // Reached, and off there — not a Property the viewer cannot reach at all.
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    "(housekeeping off)",
  );
});

/** A capability a test switched off on a Property it does not own, restored. */
let switchedOffForTheTest: string | undefined;

test.afterEach(() => {
  if (!switchedOffForTheTest) return;
  psql(
    `update public.property_capabilities set enabled = true
      where property_id = '${switchedOffForTheTest}'
        and capability_key = 'housekeeping'`,
  );
  switchedOffForTheTest = undefined;
});

test("from a page with no Property named, the rail does not offer Housekeeping where the switcher's Property has it off, and its links carry that Property", async ({
  page,
}) => {
  // Signing in lands on Today with no ?property=, and the switcher names its
  // first Property. Housekeeping is switched off there for this test.
  await signIn(page);
  const switcher = page.getByRole("button", { name: "Properties" });
  await switcher.click();
  const current = page.locator('[role="menuitem"][aria-current="true"]');
  const named = new URL(
    (await current.getAttribute("href"))!,
    page.url(),
  ).searchParams.get("property")!;
  const name = (await current.innerText()).trim();
  await page.keyboard.press("Escape");

  // Only what this test switched off is switched back on afterwards, and it
  // must have been on: restoring a Property that was already off would change
  // a developer's demo data rather than put it back.
  const changed = psql(
    `update public.property_capabilities set enabled = false
      where property_id = '${named}' and capability_key = 'housekeeping'
        and enabled
      returning property_id`,
  );
  expect(changed, "housekeeping was not on at the switcher's Property").toBe(
    named,
  );
  switchedOffForTheTest = named;
  await page.reload();

  // The rail lists what is open at the Property being worked in, so a page
  // that Property has switched off is not offered there (RANZ-53); every link
  // it does offer carries that Property, so none of them opens another one.
  await expect(
    page.locator("aside").getByRole("link", { name: "Housekeeping" }),
  ).toHaveCount(0);
  await expect(
    page.locator("aside").getByRole("link", { name: "Maintenance" }),
  ).toHaveAttribute("href", new RegExp(`property=${named}$`));

  // HK-S1-24 through the typed address: the screen is not on there, and the
  // switcher still names this Property rather than the first that has it.
  await page.goto(`/en/housekeeping?property=${named}`);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(switcher).toContainText(name);

  // The empty state's copy is the server's, and a page reached by in-app
  // navigation is rendered in the default locale — the audit evidence run's
  // F-2, fixed on its own branch — so it is read after a full load.
  await page.reload();
  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
});

test("a Property the viewer does not reach shows the empty state under a switcher naming none", async ({
  page,
}) => {
  const unreached = aPropertyTheViewerDoesNotReach();

  await signIn(page);
  await page.goto(`/en/housekeeping?property=${unreached}`);

  await expect(
    page.getByText("Housekeeping is not on at this Property"),
  ).toBeVisible();
  // Not the viewer's first Property, where housekeeping is on: that would
  // contradict the page beneath it.
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    "Choose a Property",
  );

  // Today is the one page that shows a Property's day rather than an empty
  // state, so it goes back to the day the switcher names instead of showing
  // the first Property's under a switcher naming none.
  await page.goto(`/en/today?property=${unreached}`);
  await expect(page).toHaveURL(/\/en\/today\?property=[0-9a-f-]+$/);
  await expect(
    page.getByRole("button", { name: "Properties" }),
  ).not.toContainText("Choose a Property");
});

// OA-S3-02, scenario A. The Property remembered on this device has
// Housekeeping and not Today, so the shell's default never names it on its
// own; a bare Housekeeping URL once showed its board under another Property's
// name in the switcher, with rail links carrying the other one.
test("a bare URL names one Property: the page writes the remembered one into its URL", async ({
  page,
}) => {
  const remembered = propertyWithTodayOff();

  await signIn(page);
  await page.context().addCookies([
    // Path=/, as the switcher writes it.
    {
      name: "ranza_property",
      value: remembered,
      url: new URL("/", page.url()).href,
    },
  ]);
  await page.goto("/en/housekeeping");

  await expect(page).toHaveURL(
    new RegExp(`/en/housekeeping\\?property=${remembered}$`),
  );
  await expect(page.getByRole("button", { name: "Properties" })).toContainText(
    "(Today off)",
  );
  await expect(
    page.locator("aside").getByRole("link", { name: "Housekeeping" }),
  ).toHaveAttribute("href", new RegExp(`property=${remembered}`));
});
