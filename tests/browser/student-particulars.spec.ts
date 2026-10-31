import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import {
  OWNER_EMAIL,
  openTheCalendar,
  pickDay,
  pickUnit,
  propertyDay,
  signIn,
} from "./front-desk";
import { psql } from "./local-database";

/**
 * A student registered with their particulars, as the desk does it (RANZ-110,
 * GP-S1-*).
 *
 * pgTAP proves who may read them; the integration suite proves the modules
 * record them with the booking and hand them to nobody else; the unit suites
 * prove the dialog's fields and the sheet's states. This proves the journey
 * only the running workspace has: a dormitory's registration opens the
 * student's fields, what is typed is on the registration when it is opened, in
 * the dormitory's words, in all three languages, and the Reservations page
 * itself never carries it.
 */

test("a student is registered with their particulars and they are on the registration, in three languages", async ({
  page,
}) => {
  const yurt = aFreshProperty("student particulars", {
    capabilities: ["front_desk"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${yurt.propertyId}'`,
  );
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'S-101', 'room', 2
       from public.properties where id = '${yurt.propertyId}'`,
  );
  const student = `Zeynep Öğrenci ${randomUUID().slice(0, 6)}`;
  const at = (locale: string) =>
    `/${locale}/reservations?property=${yurt.propertyId}`;

  await signIn(page, OWNER_EMAIL);
  await page.goto(at("en"));
  await page.getByRole("button", { name: "New registration" }).click();
  const booking = page.getByRole("dialog", { name: "New registration" });
  await booking.getByLabel("Guest name").fill(student);

  // A student's stay is the dormitory's default, so the fields are open.
  await expect(booking.getByText("Student details")).toBeVisible();
  await booking.getByLabel("Date of birth").fill("2008-03-14");
  await booking.getByLabel("Year of study").fill("1");
  await booking.getByLabel("University or school").fill("ODTÜ");
  await booking.getByLabel("Guardian", { exact: true }).fill("Ayten Öğrenci");
  await booking.getByLabel("Guardian's telephone").fill("+90 532 111 11 11");

  await openTheCalendar(page, booking);
  await pickDay(page, propertyDay(yurt.propertyId, 0));
  await page.getByRole("button", { name: "Done" }).click();
  await pickUnit(booking, "S-101");
  await booking.getByRole("button", { name: "Create registration" }).click();
  await expect(booking).toBeHidden();

  for (const [locale, details, title] of [
    ["en", "Registration details", "Student details"],
    ["tr", "Kayıt ayrıntıları", "Öğrenci bilgileri"],
    ["ar", "تفاصيل التسجيل", "بيانات الطالب"],
  ] as const) {
    const listed = page.waitForResponse(
      (response) =>
        response.url().includes("/reservations") &&
        response.request().resourceType() === "document",
    );
    await page.goto(at(locale));
    // The list's own page carries no particulars; they arrive when opened.
    expect(await (await listed).text()).not.toContain("Ayten Öğrenci");

    await page.getByRole("searchbox").fill(student);
    const row = page.getByRole("row").filter({ hasText: student });
    await row.getByText("S-101").click();
    const sheet = page.getByRole("dialog", { name: details });
    await expect(sheet.getByText(title)).toBeVisible();
    await expect(sheet.getByText("ODTÜ")).toBeVisible();
    await expect(sheet.getByText("Ayten Öğrenci")).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: "+90 532 111 11 11" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});
