import { expect, test, type Locator, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, signIn } from "./front-desk";
import { psql } from "./local-database";

/**
 * How full a dormitory's rooms are, read off the room map (RANZ-109, RB-S5-19).
 *
 * The unit suite proves the card's count from a map handed to it. This proves
 * it from the rows the desk's day leaves behind: three students in house in a
 * four-bed room, one bed blocked, one left this morning, and a single room
 * whose one bed is taken. The card says beds taken over beds, the blocked bed
 * is in the total and never empty, the bed somebody left today is empty again,
 * and the tile above the map counts the empty beds — in every language.
 *
 * A dormitory of the spec's own: a Stay is never deleted, so a reused Property
 * would carry the last run's students into this run's figures.
 */

function figure(page: Page, label: string): Locator {
  return page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=preceding-sibling::p")
    .locator("span")
    .first();
}

function card(page: Page, room: string): Locator {
  return page.locator('[data-slot="card"]').filter({
    has: page.getByText(room, { exact: true }),
  });
}

function roomWithBeds(propertyId: string, room: string, beds: string[]): void {
  psql(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${room}', 'room', ${beds.length}
         from public.properties where id = '${propertyId}'
       returning id, property_id, organization_id
     )
     insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, bed, 'bed', 1, room.id
       from room
      cross join unnest(array['${beds.join("','")}']) as bed`,
  );
}

function bedOf(propertyId: string, room: string, bed: string): string {
  return `select bed.id, bed.property_id, bed.organization_id
            from public.accommodation_units as bed
            join public.accommodation_units as room on room.id = bed.parent_id
           where room.property_id = '${propertyId}'
             and room.name = '${room}' and bed.name = '${bed}'`;
}

function aStudentInHouse(
  propertyId: string,
  room: string,
  bed: string,
  name: string,
): void {
  psql(
    `with bed as (${bedOf(propertyId, room, bed)}
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${name}' from bed
       returning id
     ), arrived as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select bed.organization_id, bed.property_id, bed.id, guest.id,
              'guest', 'checked_in',
              app.property_today(bed.property_id) - 10,
              app.property_today(bed.property_id) + 20
         from bed, guest
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

test("a dormitory room says how many of its beds are taken, and the map counts the empty ones", async ({
  page,
}) => {
  const yurt = aFreshProperty("beds taken", { capabilities: ["front_desk"] });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${yurt.propertyId}'`,
  );
  roomWithBeds(yurt.propertyId, "Y-101", ["A", "B", "C", "D"]);
  roomWithBeds(yurt.propertyId, "Y-102", ["A", "B"]);
  roomWithBeds(yurt.propertyId, "Y-103", ["A"]);
  aStudentInHouse(yurt.propertyId, "Y-101", "A", "Elif Yurt");
  aStudentInHouse(yurt.propertyId, "Y-101", "B", "Zeynep Yurt");
  aStudentInHouse(yurt.propertyId, "Y-101", "C", "Ayşe Yurt");
  aStudentInHouse(yurt.propertyId, "Y-103", "A", "Merve Yurt");
  psql(
    `update public.accommodation_units
        set status = 'blocked', status_reason = 'Broken frame'
      where id = (select id from (${bedOf(yurt.propertyId, "Y-102", "A")}) as bed)`,
  );
  psql(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type,
        status, starts_on, ends_on, departed_at)
     select organization_id, property_id, id, 'guest', 'departed',
            app.property_today(property_id) - 5,
            app.property_today(property_id), now()
       from (${bedOf(yurt.propertyId, "Y-102", "B")}) as bed`,
  );

  await signIn(page, OWNER_EMAIL);

  for (const [locale, words] of [
    [
      "en",
      {
        y101: "3/4 beds taken",
        y102: "0/2 beds taken",
        y103: "1/1 bed taken",
        empty: "Empty beds tonight",
      },
    ],
    [
      "tr",
      {
        y101: "3/4 yatak dolu",
        y102: "0/2 yatak dolu",
        y103: "1/1 yatak dolu",
        empty: "Boş yatak bu gece",
      },
    ],
    [
      "ar",
      {
        y101: "الأسرّة المشغولة 3/4",
        y102: "الأسرّة المشغولة 0/2",
        y103: "الأسرّة المشغولة 1/1",
        empty: "أسرّة فارغة الليلة",
      },
    ],
  ] as const) {
    await page.goto(`/${locale}/rooms?property=${yurt.propertyId}`);
    await expect(card(page, "Y-101")).toContainText(words.y101);
    // The blocked bed is in the total; the bed left this morning is not taken.
    await expect(card(page, "Y-102")).toContainText(words.y102);
    await expect(card(page, "Y-103")).toContainText(words.y103);
    // Y-101 D and Y-102 B: never the blocked bed, never a bed somebody is in.
    await expect(figure(page, words.empty)).toHaveText("2");
  }

  // A single beside a quad starts its bed where the quad starts its first row,
  // rather than hanging it at the foot of a card the quad made tall.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/en/rooms?property=${yurt.propertyId}`);
  const firstBedTop = async (room: string): Promise<number> =>
    (await card(page, room).locator('[id^="unit-"]').first().boundingBox())
      ?.y ?? Number.NaN;
  expect(
    Math.abs((await firstBedTop("Y-103")) - (await firstBedTop("Y-101"))),
  ).toBeLessThan(2);
});
