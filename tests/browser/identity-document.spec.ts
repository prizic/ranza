import { randomUUID } from "node:crypto";
import path from "node:path";

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
 * A student registered with their nationality and identity document, as the
 * desk does it (RANZ-81, PA-S2-*).
 *
 * pgTAP proves the checksum, the mask and who may reveal; the integration
 * suite proves the module records a reveal; the unit suites prove the fields
 * and the sheet's states. This proves the journey only the running workspace
 * has: the dialog suggests a T.C. kimlik for a Turkish nationality and takes
 * the number with its spaces, the registration shows the number masked in all
 * three languages, one press shows it and writes the audit record, and the
 * number is in no response the sheet reads on its own.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/yurt-identity-document",
);

const NUMBER = "10000000146";

test("a student is registered with a T.C. kimlik, shown masked on the registration and in full on request, in three languages", async ({
  page,
}) => {
  const yurt = aFreshProperty("identity document", {
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
  const student = `Elif Öğrenci ${randomUUID().slice(0, 6)}`;
  const at = (locale: string) =>
    `/${locale}/reservations?property=${yurt.propertyId}`;

  await signIn(page, OWNER_EMAIL);
  await page.goto(at("en"));
  await page.getByRole("button", { name: "New registration" }).click();
  const booking = page.getByRole("dialog", { name: "New registration" });
  await booking.getByLabel("Guest name").fill(student);

  // The nationality suggests the kind of document, and the number is checked
  // as it is typed.
  await booking.getByRole("combobox", { name: "Nationality" }).click();
  await page.getByPlaceholder("Search…").fill("turkey");
  await page.getByRole("option", { name: /Türkiye|Turkey/ }).click();
  await expect(
    booking.getByRole("radio", { name: "Turkish ID (T.C. kimlik)" }),
  ).toBeChecked();

  const number = booking.getByLabel("Document number");
  await number.fill("10000000147");
  await number.blur();
  await expect(
    booking.getByText(
      "A T.C. kimlik number is 11 digits and its last two digits must check out.",
    ),
  ).toBeVisible();
  await number.fill("100 000 001 46");
  await expect(
    booking.getByText("A T.C. kimlik number is 11 digits"),
  ).toBeHidden();
  await booking.getByLabel("University or school").fill("ODTÜ");
  await page.screenshot({ path: path.join(EVIDENCE, "01-dialog-en.png") });

  await openTheCalendar(page, booking);
  await pickDay(page, propertyDay(yurt.propertyId, 0));
  await page.getByRole("button", { name: "Done" }).click();
  await pickUnit(booking, "S-101");
  await booking.getByRole("button", { name: "Create registration" }).click();
  await expect(booking).toBeHidden();

  for (const [locale, details, country, show, hide] of [
    ["en", "Registration details", /Türkiye|Turkey/, "Show", "Hide"],
    ["tr", "Kayıt ayrıntıları", "Türkiye", "Göster", "Gizle"],
    ["ar", "تفاصيل التسجيل", /تركيا|ترکیا|تركيّا/, "إظهار", "إخفاء"],
  ] as const) {
    await page.goto(at(locale));
    await page.getByRole("searchbox").fill(student);
    const row = page.getByRole("row").filter({ hasText: student });
    // The sheet reads the particulars on its own; the number is not in them.
    const read = page.waitForResponse((response) =>
      response.url().includes("/api/front-office/guest-particulars"),
    );
    await row.getByText("S-101").click();
    expect(await (await read).text()).not.toContain(NUMBER);

    const sheet = page.getByRole("dialog", { name: details });
    await expect(sheet.getByText(country)).toBeVisible();
    await expect(sheet.getByText("•••• 0146")).toBeVisible();
    // Centred, because the sheet's sticky footer hides what is just below the fold.
    await sheet
      .getByText("•••• 0146")
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(sheet.getByText(NUMBER)).toBeHidden();
    await page.screenshot({
      path: path.join(EVIDENCE, `02-sheet-masked-${locale}.png`),
    });

    await sheet.getByRole("button", { name: show }).click();
    await expect(sheet.getByText(NUMBER)).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, `03-sheet-shown-${locale}.png`),
    });
    await sheet.getByRole("button", { name: hide }).click();
    await expect(sheet.getByText(NUMBER)).toBeHidden();
    await page.keyboard.press("Escape");
  }

  // Three presses, three records, and none carries the number.
  const records = psql(
    `select count(*) from audit.records
      where action = 'guest.identity_document_revealed'
        and location_id = '${yurt.propertyId}'`,
  );
  expect(records).toBe("3");
  expect(
    psql(
      `select count(*) from audit.records
        where location_id = '${yurt.propertyId}'
          and context::text like '%${NUMBER}%'`,
    ),
  ).toBe("0");

  // The dialog in Turkish and in Arabic, mirrored, with the fields filled.
  for (const [locale, open, nationality, search, pick, label] of [
    ["tr", "Yeni kayıt", "Uyruk", "türkiye", "Türkiye", "Belge numarası"],
    ["ar", "تسجيل جديد", "الجنسية", "تركيا", "تركيا", "رقم الوثيقة"],
  ] as const) {
    await page.goto(at(locale));
    await page.getByRole("button", { name: open }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: nationality }).click();
    await page.locator("[cmdk-input]").fill(search);
    await page.getByRole("option", { name: pick }).click();
    await dialog.getByLabel(label).fill("100 000 001 46");
    await dialog.getByLabel(label).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(EVIDENCE, `04-dialog-${locale}.png`),
    });
  }
});
