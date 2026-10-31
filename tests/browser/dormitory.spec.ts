import { expect, test } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import { psql } from "./local-database";

/**
 * A Property run as a student dormitory (ADR 0057, CF-S4-*).
 *
 * pgTAP proves the model is a setting nothing in the database reads; the unit
 * suites prove the overlay changes the same strings in every language and that
 * the client follows a navigation between Properties. This proves what only
 * the running workspace shows: a manager switches the model on Configuration,
 * the audit log names the change, the dormitory's screens are rendered in its
 * words by the server in all three languages, a new booking there starts as a
 * student, the hotel beside it is untouched, and switching back undoes the
 * words and nothing else.
 *
 * A Property of the spec's own, so no other spec ever reads a dormitory's
 * words on the Property it shares.
 */

test("a Property becomes a dormitory, speaks a yurt's words, and becomes a hotel again", async ({
  page,
}) => {
  const yurt = aFreshProperty("dormitory", {
    capabilities: ["configuration", "front_desk", "today"],
  });
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'Y-101', 'room', 2
       from public.properties where id = '${yurt.propertyId}'`,
  );
  const at = (locale: string, segment: string, property = yurt.propertyId) =>
    `/${locale}/${segment}?property=${property}`;
  const heading = page.getByRole("heading", { level: 1 });

  await signIn(page, OWNER_EMAIL);
  await page.goto(at("en", "configuration"));
  const model = page.locator("#model");
  const save = model.getByRole("button", { name: "Save changes" });
  await expect(model.getByRole("radio", { name: /^Hotel/ })).toBeChecked();
  await expect(save).toBeDisabled();

  await model.getByRole("radio", { name: /^Student dormitory/ }).check();
  await save.click();
  await expect(model.getByText("Saved")).toBeVisible();

  // The dormitory's screens in its words. The heading is a client component,
  // which the layout's provider reaches; the title is server metadata, which
  // only the request config does, so each path is asserted by its own.
  await page.goto(at("en", "reservations"));
  await expect(heading).toHaveText("Registrations");
  await expect(page).toHaveTitle(/^Registrations · /);
  await page.getByRole("button", { name: "New registration" }).click();
  await expect(page.getByRole("radio", { name: "Student stay" })).toBeChecked();
  await page.keyboard.press("Escape");

  await page.goto(at("tr", "reservations"));
  await expect(heading).toHaveText("Kayıtlar");
  await expect(page).toHaveTitle(/^Kayıtlar · /);
  await page.goto(at("ar", "reservations"));
  await expect(heading).toHaveText("التسجيلات");
  await expect(page).toHaveTitle(/^التسجيلات · /);

  // The hotel beside it is exactly what it was.
  await page.goto(at("en", "reservations", testProperty()));
  await expect(heading).toHaveText("Reservations");
  await expect(page).toHaveTitle(/^Reservations · /);
  await expect(
    page.getByRole("button", { name: "New reservation" }),
  ).toBeVisible();

  // The change is on the record, in the reader's language.
  await page.goto(at("en", "audit-log"));
  await expect(
    page.getByText("Operating model: Hotel → Student dormitory").first(),
  ).toBeVisible();

  // And back: the words go, and there is nothing else to undo.
  await page.goto(at("en", "configuration"));
  await model.getByRole("radio", { name: /^Hotel/ }).check();
  await save.click();
  await expect(model.getByText("Saved")).toBeVisible();
  await page.goto(at("en", "reservations"));
  await expect(heading).toHaveText("Reservations");
  await expect(page).toHaveTitle(/^Reservations · /);
  expect(
    psql(
      `select operating_model from public.properties where id = '${yurt.propertyId}'`,
    ),
  ).toBe("hotel");
});
