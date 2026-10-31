import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  layoutCookieName,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";

/**
 * A dormitory's Today for the person who runs it: how many beds are empty in
 * each block for women and for men, what is still open, nothing drawn for a
 * day with nobody arriving or leaving, and the rail in the order the work goes
 * (RANZ-108, TD-S10-01 to TD-S10-09).
 *
 * The unit suites prove the counts, the order and the words. This proves the
 * walk only the running workspace has: the figures read from the rows the
 * desk's day leaves, each opening the list it counts with the same number, the
 * Arabic page mirrored, and a hotel keeping the Today it had.
 *
 * Properties of the spec's own: a Stay is never deleted, so a reused one would
 * carry the last run's students into this run's figures.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/yurt-dormitory-today",
);

function userIdOf(email: string): string {
  return psql(
    `select id from public.users where lower(email) = lower('${email}')`,
  );
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

/**
 * Two blocks let by the bed, no arrival or departure today: a Student in one of
 * Block A's two beds, two requests (one urgent) and one maintenance request.
 */
function aQuietYurt(): string {
  const { propertyId } = aFreshProperty("dormitory today", {
    capabilities: [
      "today",
      "front_desk",
      "housekeeping",
      "guest_experience",
      "maintenance",
    ],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${propertyId}'`,
  );
  for (const [room, block, admits] of [
    ["A-1", "Blok A", "female"],
    ["B-1", "Blok B", "male"],
  ] as const) {
    psql(
      `with room as (
         insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity,
            building, admits)
         select id, organization_id, '${room}', 'room', 2, '${block}',
                '${admits}'
           from public.properties where id = '${propertyId}'
         returning id, property_id, organization_id
       )
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, parent_id,
          building)
       select property_id, organization_id, '${room}-' || bed, 'bed', 1,
              room.id, '${block}'
         from room cross join unnest(array['a', 'b']) as bed`,
    );
  }
  psql(
    `with unit as (
       select id, property_id, organization_id
         from public.accommodation_units
        where property_id = '${propertyId}' and name = 'A-1-a'
     ), guest as (
       insert into public.guests (organization_id, full_name, gender)
       select organization_id, 'Elif Yurt', 'female' from unit
       returning id
     ), booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select unit.organization_id, unit.property_id, unit.id, guest.id,
              'resident', 'checked_in',
              app.property_today(unit.property_id) - 30,
              app.property_today(unit.property_id) + 90
         from unit, guest
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select organization_id, property_id, accommodation_unit_id, id,
            'resident', 'in_house', starts_on, ends_on
       from booked`,
  );
  psql(
    `insert into public.service_requests
       (organization_id, property_id, number, title, category, priority,
        status, reported_by_user_id)
     select property.organization_id, property.id, wanted.number,
            wanted.title, 'other', wanted.priority, 'new',
            '${userIdOf(OWNER_EMAIL)}'
       from public.properties as property,
            (values (1, 'Extra blanket', 'normal'),
                    (2, 'Heater is off', 'urgent')) as wanted
              (number, title, priority)
      where property.id = '${propertyId}'`,
  );
  psql(
    `select set_config('app.user_id', '${userIdOf(OWNER_EMAIL)}', false);
     insert into public.maintenance_requests
       (organization_id, property_id, number, title, priority, status,
        reported_by, accommodation_unit_id)
     select unit.organization_id, unit.property_id, 1, 'Tap leaks', 'this_week',
            'new', '${userIdOf(OWNER_EMAIL)}', unit.id
       from public.accommodation_units as unit
      where unit.property_id = '${propertyId}' and unit.name = 'B-1'`,
  );
  return propertyId;
}

test("a dormitory's Today answers by block, shows what is open, and draws no empty movements", async ({
  page,
}) => {
  const yurt = aQuietYurt();
  await signIn(page, OWNER_EMAIL);
  await drawTodayAs(page, "timeline");
  await page.goto(`/en/today?property=${yurt}`);

  // Nobody arrives or leaves: no figures or flow for them, and the desk's
  // fourth figure is the beds the Rooms screen counts.
  await expect(page.getByRole("link", { name: /In house now/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Checked in/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Checked out/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Today's flow" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Empty beds/ })).toContainText(
    "3/4",
  );

  const beds = page.getByRole("region", { name: "Empty beds tonight" });
  await expect(
    beds.getByRole("link", {
      name: "1 free tonight in Blok A, in rooms for women only",
    }),
  ).toBeVisible();
  await expect(
    beds.getByRole("link", {
      name: "2 free tonight in Blok B, in rooms for men only",
    }),
  ).toBeVisible();
  await expect(
    beds.getByRole("link", {
      name: "3 free tonight in rooms for women only",
    }),
  ).toHaveCount(0);

  const open = page.getByRole("region", { name: "Requests and maintenance" });
  await expect(
    open.getByRole("link", { name: "2 open requests" }),
  ).toBeVisible();
  await expect(open.getByText("1 urgent")).toBeVisible();
  await expect(
    open.getByRole("link", { name: "1 open maintenance request" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "timeline-en.png"),
    fullPage: true,
  });

  // The rail: the beds first, and Close the day among the building's work.
  const rail = await page
    .locator("aside nav a[href]")
    .evaluateAll((links) =>
      links.map(
        (link) => link.getAttribute("href")?.split("?")[0]?.split("/")[2],
      ),
    );
  expect(rail.slice(0, 10)).toEqual([
    "today",
    "rooms",
    "room-calendar",
    "reservations",
    "arrivals",
    "departures",
    "guest-experience",
    "maintenance",
    "housekeeping",
    "close-day",
  ]);

  // A block's figure opens exactly the beds it counts, and says so.
  await beds
    .getByRole("link", {
      name: "2 free tonight in Blok B, in rooms for men only",
    })
    .click();
  await expect(page).toHaveURL(/show=free.*admits=male.*block=Blok\+B/);
  await expect(page.getByTestId("list-filter-notice")).toContainText(
    "2 free tonight in Blok B, in rooms for men only",
  );
  await expect(page.getByText("B-1", { exact: true })).toBeVisible();
  await expect(page.getByText("A-1", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page.getByTestId("list-filter-notice")).toHaveCount(0);
  await expect(page.getByText("A-1", { exact: true })).toBeVisible();

  // The two open figures open their own lists.
  await page.goto(`/en/today?property=${yurt}`);
  await page.getByRole("link", { name: "2 open requests" }).click();
  await expect(page).toHaveURL(/\/en\/guest-experience\?property=/);
  await page.goto(`/en/today?property=${yurt}`);
  await page.getByRole("link", { name: "1 open maintenance request" }).click();
  await expect(page).toHaveURL(/\/en\/maintenance\?property=/);
});

test("the dormitory's Today reads in Turkish and in Arabic, mirrored", async ({
  page,
}) => {
  const yurt = aQuietYurt();
  await signIn(page, OWNER_EMAIL);
  await drawTodayAs(page, "timeline");

  await page.goto(`/tr/today?property=${yurt}`);
  await expect(
    page.getByRole("region", { name: "Bu gece boş yatak" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Blok A içinde yalnızca kadınlara ayrılan odalarda bu gece 1 boş yer",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Talepler ve bakım" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "timeline-tr.png"),
    fullPage: true,
  });

  await page.goto(`/ar/today?property=${yurt}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("region", { name: "أسرّة فارغة الليلة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "الطلبات والصيانة" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "timeline-ar.png"),
    fullPage: true,
  });

  await drawTodayAs(page, "overview");
  await page.goto(`/en/today?property=${yurt}`);
  await expect(
    page.getByRole("region", { name: "Empty beds tonight" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Requests and maintenance" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Checked in\b/ })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "overview-en.png"),
    fullPage: true,
  });
});

test("a hotel keeps the Today and the rail it had", async ({ page }) => {
  const { propertyId } = aFreshProperty("hotel keeps its today", {
    capabilities: [
      "today",
      "front_desk",
      "housekeeping",
      "guest_experience",
      "maintenance",
    ],
  });
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'H-101', 'room', 2
       from public.properties where id = '${propertyId}'`,
  );
  await signIn(page, OWNER_EMAIL);
  await drawTodayAs(page, "timeline");
  await page.goto(`/en/today?property=${propertyId}`);

  // An empty day at a hotel is still drawn in full: the figures at zero and
  // the flow that says nothing is expected.
  await expect(page.getByRole("link", { name: /Checked in/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Checked out/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today's flow" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Rooms ready to sell/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Requests and maintenance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Empty beds tonight" }),
  ).toHaveCount(0);

  const rail = await page
    .locator("aside nav a[href]")
    .evaluateAll((links) =>
      links.map(
        (link) => link.getAttribute("href")?.split("?")[0]?.split("/")[2],
      ),
    );
  expect(rail.slice(0, 7)).toEqual([
    "today",
    "reservations",
    "room-calendar",
    "rooms",
    "arrivals",
    "departures",
    "close-day",
  ]);
});
