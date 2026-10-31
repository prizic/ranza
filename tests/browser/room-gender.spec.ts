import { expect, test } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import {
  OWNER_EMAIL,
  openTheCalendar,
  pickDay,
  pickUnit,
  propertyDay,
  signIn,
  whenHydrated,
} from "./front-desk";
import { psql } from "./local-database";

/**
 * A room that admits women only, as the desk meets it (RANZ-110, RB-S5-*).
 *
 * pgTAP proves the database refuses; the integration suite proves the modules
 * say so as their own errors; the unit suites prove each dialog's states. This
 * proves the journey only the running workspace has: the room is gendered from
 * its own tile, a registration into it asks the gender and says so before the
 * press when the answer is refused, the student is registered, the room then
 * refuses to change while she holds it, and the audit log names the change in
 * the reader's words.
 *
 * A dormitory of the spec's own, so the marker is read on a room nobody else
 * books.
 */

test("a room is set to women only on its tile, asks the gender when booked, and keeps whom it holds", async ({
  page,
}) => {
  const yurt = aFreshProperty("room gender", {
    capabilities: ["front_desk"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${yurt.propertyId}'`,
  );
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'G-101', 'room', 2
       from public.properties where id = '${yurt.propertyId}'`,
  );
  const at = (segment: string) => `/en/${segment}?property=${yurt.propertyId}`;

  await signIn(page, OWNER_EMAIL);

  // On the tile: a dormitory's room offers the choice where it is drawn.
  await page.goto(at("rooms"));
  const mark = page.getByRole("button", { name: "Change who G-101 admits" });
  await whenHydrated(mark);
  await expect(mark).toHaveText("Anyone");
  await mark.click();
  const change = page.getByRole("dialog", { name: "Who it admits" });
  await change.getByText("Women only", { exact: true }).click();
  await change.getByRole("button", { name: "Save" }).click();
  await expect(change).toBeHidden();
  await expect(mark).toHaveText("Women only");

  // A registration into it asks, and a refused answer is said before the press.
  await page.goto(at("reservations"));
  await page.getByRole("button", { name: "New registration" }).click();
  const booking = page.getByRole("dialog", { name: "New registration" });
  await booking.getByLabel("Guest name").fill("Elif Yurt");
  await openTheCalendar(page, booking);
  await pickDay(page, propertyDay(yurt.propertyId, 0));
  await page.getByRole("button", { name: "Done" }).click();
  await pickUnit(booking, "G-101", "Women only");

  await expect(
    booking.getByText(
      "This room admits women only, so the gender is recorded on the Guest's file.",
    ),
  ).toBeVisible();
  const create = booking.getByRole("button", { name: "Create registration" });
  await expect(create).toBeDisabled();
  await booking.getByText("Male", { exact: true }).click();
  await expect(
    booking.getByText(
      "This room admits women only. Choose another room for this Guest.",
    ),
  ).toBeVisible();
  await expect(create).toBeDisabled();

  await booking.getByText("Female", { exact: true }).click();
  await create.click();
  await expect(booking).toBeHidden();
  expect(
    psql(
      `select guest.gender
         from public.reservations as booking
         join public.guests as guest on guest.id = booking.guest_id
        where booking.property_id = '${yurt.propertyId}'`,
    ),
  ).toBe("female");

  // While she holds it, the room cannot be made a men's room.
  await page.goto(at("rooms"));
  await whenHydrated(mark);
  await mark.click();
  await change.getByText("Men only", { exact: true }).click();
  await change.getByRole("button", { name: "Save" }).click();
  await expect(
    change.getByText(
      "Somebody booked into this room, or staying in it, would no longer be admitted. Move them first, or open the room to anyone.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    psql(
      `select admits from public.accommodation_units
        where property_id = '${yurt.propertyId}' and name = 'G-101'`,
    ),
  ).toBe("female");

  // The change that was made is on the record, in the reader's words.
  await page.goto(at("audit-log"));
  await expect(page.getByText("Anyone → Women only").first()).toBeVisible();
});
