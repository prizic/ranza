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
 * No state chip of the Rooms card is cut off, spills out of its own cell, or
 * runs into the count beside it, in the language the page is drawn in.
 */
async function expectNoChipClipped(page: Page, card: string): Promise<void> {
  const cramped = await page
    .getByRole("region", { name: card, exact: true })
    .locator("ul li")
    .evaluateAll((cells) =>
      cells.flatMap((cell) => {
        const chip = cell.firstElementChild;
        const count = cell.lastElementChild;
        if (!chip || !count) return [cell.textContent];
        const room = cell.getBoundingClientRect();
        const label = chip.getBoundingClientRect();
        const number = count.getBoundingClientRect();
        const cut = chip.scrollWidth > chip.clientWidth;
        const outside =
          label.left < room.left - 1 || label.right > room.right + 1;
        const touching = label.left < number.right && number.left < label.right;
        return cut || outside || touching ? [chip.textContent] : [];
      }),
    );
  expect(cramped).toEqual([]);
}

/**
 * Two blocks let by the bed, no arrival or departure today: a Student in one of
 * Block A's two beds, two requests (one urgent) and one maintenance request.
 */
function aQuietYurt(extraCapabilities: readonly string[] = []): string {
  const { propertyId } = aFreshProperty("dormitory today", {
    capabilities: [
      "today",
      "front_desk",
      "housekeeping",
      "guest_experience",
      "maintenance",
      ...extraCapabilities,
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
  await expectNoChipClipped(page, "Rooms");
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
  await expectNoChipClipped(page, "Odalar");
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
  await expectNoChipClipped(page, "الغرف");
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
      "finance",
      "attendance",
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
  // Finance and a roll call are on here, and there is no plan and nobody in
  // house to call: the Residents' cards draw only where their data exists.
  await expect(
    page.getByRole("region", { name: "Instalments overdue" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Tonight's roll call" }),
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

/**
 * The yurt above with finance and a roll call on and three Students in house:
 * Elif (a plan with two instalments past their date, marked missing tonight),
 * Burak (on leave tonight) and Cem (nobody has called him yet).
 */
function aYurtWithStanding(): string {
  const yurt = aQuietYurt(["finance", "attendance"]);
  const owner = userIdOf(OWNER_EMAIL);
  const student = (bed: string, name: string) =>
    psql(
      `with unit as (
         select id, property_id, organization_id
           from public.accommodation_units
          where property_id = '${yurt}' and name = '${bed}'
       ), guest as (
         insert into public.guests (organization_id, full_name, gender)
         select organization_id, '${name}', 'male' from unit
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
  student("B-1-a", "Burak Yurt");
  student("B-1-b", "Cem Yurt");

  psql(
    `select set_config('app.user_id', '${owner}', false);
     with plan as (
       insert into public.payment_plans
         (organization_id, property_id, reservation_id, currency, created_by)
       select reservation.organization_id, reservation.property_id,
              reservation.id, 'TRY', '${owner}'
         from public.reservations as reservation
         join public.guests as guest on guest.id = reservation.guest_id
        where reservation.property_id = '${yurt}'
          and guest.full_name = 'Elif Yurt'
       returning id, organization_id, property_id
     )
     insert into public.plan_instalments
       (organization_id, property_id, plan_id, ordinal, amount_minor,
        due_on, revision)
     select plan.organization_id, plan.property_id, plan.id, due.ordinal,
            400000, app.property_today(plan.property_id) - due.days, 1
       from plan
      cross join (values (1, 40), (2, 10)) as due (ordinal, days)`,
  );

  psql(
    `select set_config('app.user_id', '${owner}', false);
     insert into public.attendance_marks
       (organization_id, property_id, stay_id, night, status, marked_by)
     select stay.organization_id, stay.property_id, stay.id,
            app.property_today(stay.property_id), 'absent', '${owner}'
       from public.stays as stay
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
      where stay.property_id = '${yurt}' and guest.full_name = 'Elif Yurt'`,
  );
  psql(
    `select set_config('app.user_id', '${owner}', false);
     with leave as (
       insert into public.attendance_leaves
         (organization_id, property_id, stay_id, from_night, to_night,
          planned_to_night, granted_by)
       select stay.organization_id, stay.property_id, stay.id,
              app.property_today(stay.property_id),
              app.property_today(stay.property_id) + 2,
              app.property_today(stay.property_id) + 2, '${owner}'
         from public.stays as stay
         join public.reservations as reservation on reservation.id = stay.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where stay.property_id = '${yurt}' and guest.full_name = 'Burak Yurt'
       returning id, organization_id, property_id
     )
     insert into public.attendance_leave_reasons
       (leave_id, organization_id, property_id, reason)
     select id, organization_id, property_id, 'Family visit' from leave`,
  );
  return yurt;
}

test("the Residents' standing: tonight's roll call and the instalments overdue, each opening what it counts", async ({
  page,
}) => {
  const yurt = aYurtWithStanding();
  await signIn(page, OWNER_EMAIL);
  await drawTodayAs(page, "timeline");
  await page.goto(`/en/today?property=${yurt}`);

  const rollCall = page.getByRole("region", { name: "Tonight's roll call" });
  for (const name of ["On leave: 1", "Missing: 1", "Not yet called: 1"]) {
    await expect(rollCall.getByRole("link", { name })).toHaveAttribute(
      "href",
      new RegExp(`/en/roll-call\\?property=${yurt}$`),
    );
  }
  await expect(rollCall).toContainText("3 students are in house");
  await expectNoChipClipped(page, "Rooms");

  const overdue = page.getByRole("region", { name: "Instalments overdue" });
  const figure = overdue.getByRole("link", {
    name: /^1 student with an overdue instalment, /,
  });
  await expect(figure).toContainText("2 instalments");
  await expect(figure).toContainText(/8[.,]000/);
  await page.screenshot({
    path: path.join(EVIDENCE, "standing-timeline-en.png"),
    fullPage: true,
  });

  // The figure opens the Students it counts, and the list says the same number.
  await figure.click();
  await expect(page).toHaveURL(
    new RegExp(`/en/finance\\?property=${yurt}&show=overdue$`),
  );
  await expect(page.getByTestId("overdue-notice")).toContainText(
    "1 student has an instalment past its date",
  );
  await expect(page.getByText("Cem Yurt")).toHaveCount(0);

  // A name opens that Student's booking, where the plan and the Folio are.
  await page.getByRole("link", { name: "Elif Yurt" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/reservations\\?property=${yurt}&open=[0-9a-f-]{36}$`),
  );
  const booking = page.getByRole("dialog");
  await expect(booking).toContainText("Elif Yurt");
  await expect(
    booking.getByRole("heading", { name: "Payment plan" }),
  ).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/finance\\?property=${yurt}$`));

  // A roll call figure opens the roll call at the same Property.
  await page.goto(`/en/today?property=${yurt}`);
  await page
    .getByRole("region", { name: "Tonight's roll call" })
    .getByRole("link", { name: "Missing: 1" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/en/roll-call\\?property=${yurt}$`));
  await expect(
    page.getByRole("region", { name: "Tonight's figures" }),
  ).toBeVisible();
});

test("the Residents' standing reads in Turkish and Arabic, mirrored, on the overview too", async ({
  page,
}) => {
  const yurt = aYurtWithStanding();
  await signIn(page, OWNER_EMAIL);
  await drawTodayAs(page, "timeline");

  await page.goto(`/tr/today?property=${yurt}`);
  // Staying, not "inside": a Student on leave is counted here and is out.
  await expect(
    page.getByRole("region", { name: "Bu geceki yoklama" }),
  ).toContainText("3 öğrenci konaklıyor");
  await expect(
    page.getByRole("region", { name: "Geciken taksitler" }),
  ).toBeVisible();
  await expectNoChipClipped(page, "Odalar");
  await page.screenshot({
    path: path.join(EVIDENCE, "standing-timeline-tr.png"),
    fullPage: true,
  });

  await page.goto(`/ar/today?property=${yurt}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("region", { name: "كشف الحضور الليلة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "أقساط متأخرة" }),
  ).toBeVisible();
  await expectNoChipClipped(page, "الغرف");
  await page.screenshot({
    path: path.join(EVIDENCE, "standing-timeline-ar.png"),
    fullPage: true,
  });

  await drawTodayAs(page, "overview");
  await page.goto(`/en/today?property=${yurt}`);
  await expect(
    page.getByRole("region", { name: "Tonight's roll call" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Instalments overdue" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE, "standing-overview-en.png"),
    fullPage: true,
  });
});
