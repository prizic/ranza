import { expect, test, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";
import {
  layoutCookieName,
  type TodayLayout,
} from "../../apps/operator-workspace/src/features/today/layouts/model";

/**
 * A dormitory's Today says how many beds are left for women, for men and for
 * anybody, and each figure is the way to them (RANZ-108, RB-S5-20).
 *
 * The unit suites prove the counts, when the card exists and what Rooms does
 * with the address. This proves the walk only the running workspace has: the
 * figures read from the rows the desk's day leaves, on the layout a desk lands
 * on and on the overview, each opening Rooms with the same number in its
 * notice, and a hotel with no gendered room keeping the Today it had.
 *
 * Properties of the spec's own: a Stay is never deleted, so a reused one would
 * carry the last run's students into this run's figures.
 */

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

function aDormitory(): string {
  const { propertyId } = aFreshProperty("empty beds", {
    capabilities: ["today", "front_desk", "housekeeping"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${propertyId}'`,
  );
  psql(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, admits)
       select id, organization_id, 'W-1', 'room', 3, 'female'
         from public.properties where id = '${propertyId}'
       returning id, property_id, organization_id
     )
     insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, bed, 'bed', 1, room.id
       from room cross join unnest(array['A', 'B', 'C']) as bed`,
  );
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, admits)
     select property.id, property.organization_id, wanted.name, 'room', 1,
            wanted.admits
       from public.properties as property,
            (values ('M-1', 'male'), ('X-1', null)) as wanted (name, admits)
      where property.id = '${propertyId}'`,
  );
  // A women's room seats only a Guest recorded as a woman (RB-S5-16).
  for (const [unit, guest, gender] of [
    ["A", "Elif Yurt", "'female'"],
    ["X-1", "Deniz Yurt", "null"],
  ] as const) {
    psql(
      `with unit as (
         select id, property_id, organization_id
           from public.accommodation_units
          where property_id = '${propertyId}' and name = '${unit}'
       ), guest as (
         insert into public.guests (organization_id, full_name, gender)
         select organization_id, '${guest}', ${gender} from unit
         returning id
       ), arrived as (
         insert into public.reservations
           (organization_id, property_id, accommodation_unit_id, guest_id,
            stay_type, status, starts_on, ends_on)
         select unit.organization_id, unit.property_id, unit.id, guest.id,
                'guest', 'checked_in',
                app.property_today(unit.property_id) - 3,
                app.property_today(unit.property_id) + 20
           from unit, guest
         returning id, organization_id, property_id, accommodation_unit_id,
                   starts_on, ends_on
       )
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'guest', 'in_house', starts_on, ends_on
         from arrived`,
    );
  }
  return propertyId;
}

test("a dormitory's Today counts the empty beds for women, men and anybody, and each opens them", async ({
  page,
}) => {
  const yurt = aDormitory();
  await signIn(page, OWNER_EMAIL);

  for (const layout of ["timeline", "overview"] as const) {
    await drawTodayAs(page, layout);
    await page.goto(`/en/today?property=${yurt}`);
    const card = page.getByRole("region", { name: "Empty beds tonight" });
    for (const name of [
      "2 free tonight in rooms for women only",
      "1 free tonight in rooms for men only",
      "0 free tonight in rooms for anyone",
    ]) {
      await expect(card.getByRole("link", { name })).toBeVisible();
    }
  }

  await page
    .getByRole("link", { name: "2 free tonight in rooms for women only" })
    .click();
  await expect(page).toHaveURL(/\/en\/rooms\?.*show=free.*admits=female/);
  await expect(page.getByTestId("list-filter-notice")).toContainText(
    "2 free tonight in rooms for women only",
  );
  await expect(page.getByText("W-1", { exact: true })).toBeVisible();
  await expect(page.getByText("M-1", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page.getByTestId("list-filter-notice")).toHaveCount(0);
  await expect(page.getByText("M-1", { exact: true })).toBeVisible();

  await drawTodayAs(page, "timeline");
  await page.goto(`/ar/today?property=${yurt}`);
  await expect(
    page.getByRole("region", { name: "أسرّة فارغة الليلة" }),
  ).toBeVisible();
});

test("a hotel with no gendered room keeps the Today it had", async ({
  page,
}) => {
  const { propertyId } = aFreshProperty("no empty beds card", {
    capabilities: ["today", "front_desk", "housekeeping"],
  });
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'H-101', 'room', 2
       from public.properties where id = '${propertyId}'`,
  );
  await signIn(page, OWNER_EMAIL);

  // What each layout draws once the day is read, before the card's absence
  // can mean anything.
  for (const [layout, drawn] of [
    ["timeline", page.getByRole("heading", { name: "Today's flow" })],
    ["overview", page.getByText("Checked in").first()],
  ] as const) {
    await drawTodayAs(page, layout);
    await page.goto(`/en/today?property=${propertyId}`);
    await expect(drawn).toBeVisible();
    await expect(page.getByText("Women only")).toHaveCount(0);
    await expect(page.getByText("Free rooms tonight")).toHaveCount(0);
  }
});
