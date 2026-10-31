import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, propertyDay, signIn } from "./front-desk";
import { psql } from "./local-database";

/**
 * A Resident pays by instalments (RANZ-96, PP-S2-*, PP-S3-*), as the desk does
 * it in a running workspace.
 *
 * pgTAP proves who may make and revise a plan and what the worker charges; the
 * integration suite proves the booking and its plan are one act; the unit
 * suites prove the dialog's states and the split's arithmetic. This proves the
 * journey only the whole workspace has: registering a student for a term makes
 * the plan the dialog showed, in the dormitory's words, in all three languages,
 * and a Property that keeps no Folios offers none.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/yurt-stage-2/instalments",
);

/** A dormitory with one room priced at 1,500.00 a night, and Folios kept. */
function aYurt(label: string, options: { folios: boolean; model: string }) {
  const yurt = aFreshProperty(label, {
    capabilities: options.folios ? ["front_desk", "finance"] : ["front_desk"],
  });
  psql(
    `update public.properties set operating_model = '${options.model}'
      where id = '${yurt.propertyId}'`,
  );
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity)
     select id, organization_id, 'S-101', 'room', 2
       from public.properties where id = '${yurt.propertyId}'`,
  );
  psql(
    `insert into public.property_rates
       (organization_id, property_id, unit_type, amount_minor, currency)
     select organization_id, id, 'room', 150000, 'TRY'
       from public.properties where id = '${yurt.propertyId}'`,
  );
  return yurt;
}

/**
 * Presses a day in the open calendar, turning months forward until it is
 * shown. `front-desk.ts`'s `pickDay` finds the button by its English name; the
 * calendar's own class is the same in every language.
 */
async function pickDay(page: Page, iso: string) {
  const day = page.locator(`td:not([data-outside]) [data-day="${iso}"]`);
  for (let turns = 0; turns < 12 && !(await day.isVisible()); turns++) {
    await page.locator(".rdp-button_next").click();
  }
  await day.click();
}

/** Chooses a stay type by its label: the radio itself is hidden. */
async function chooseStayType(dialog: Locator, label: string) {
  await dialog.locator("label", { hasText: new RegExp(`^${label}$`) }).click();
}

/** The dialog, opened by the link that means "take a booking". */
async function openRegistration(
  page: Page,
  locale: string,
  propertyId: string,
) {
  await page.goto(`/${locale}/reservations?property=${propertyId}&new=1`);
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Arrival today and a departure `nights` on, then the first Unit it lists. */
async function chooseTheTerm(page: Page, propertyId: string, nights: number) {
  const dialog = page.getByRole("dialog").first();
  await dialog.locator("#booking-dates").click();
  await pickDay(page, propertyDay(propertyId, 0));
  await pickDay(page, propertyDay(propertyId, nights));
  await page.keyboard.press("Escape");
  await dialog.locator('input[name="unit"]').first().check();
}

test("registering a student for a term makes the plan the dialog showed, in three languages", async ({
  page,
}) => {
  const yurt = aYurt("instalments register", {
    folios: true,
    model: "dormitory",
  });
  const student = `Plan Öğrenci ${randomUUID().slice(0, 6)}`;
  const NIGHTS = 70;

  await signIn(page, OWNER_EMAIL);

  // Three languages of the same dialog, for the screenshots and the words.
  for (const [locale, title] of [
    ["tr", "Ödeme planı"],
    ["ar", "خطة الدفع"],
  ] as const) {
    const dialog = await openRegistration(page, locale, yurt.propertyId);
    await dialog.locator("#booking-guest").fill(student);
    await chooseTheTerm(page, yurt.propertyId, NIGHTS);
    const plan = dialog.getByRole("group", { name: title });
    await expect(plan).toBeVisible();
    await expect(plan.getByRole("listitem").first()).toBeVisible();
    if (locale === "ar") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await plan.evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await dialog.screenshot({
      path: path.join(EVIDENCE, `booking-dialog-plan-${locale}.png`),
    });
    await page.keyboard.press("Escape");
  }

  // English, all the way through: open at a dormitory, no press needed.
  const dialog = await openRegistration(page, "en", yurt.propertyId);
  await dialog.getByLabel("Guest name").fill(student);
  await chooseTheTerm(page, yurt.propertyId, NIGHTS);
  const plan = dialog.getByRole("group", { name: "Payment plan" });
  await expect(plan).toBeVisible();
  await expect(plan.getByLabel("Total fees")).toHaveValue("105000");
  const shown = await plan.getByRole("listitem").count();
  expect(shown).toBeGreaterThanOrEqual(2);
  await expect(plan.getByLabel("Instalment 1 · Due on")).toHaveValue(
    propertyDay(yurt.propertyId, 0),
  );
  await plan.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await dialog.screenshot({
    path: path.join(EVIDENCE, "booking-dialog-plan-en.png"),
  });

  await dialog.getByRole("button", { name: "Create registration" }).click();
  await expect(dialog).toBeHidden();

  // What the dialog showed is what was made: the same count, and the total
  // the price list gave, to the minor unit.
  expect(
    psql(
      `select count(*) || '/' || coalesce(sum(instalment.amount_minor), 0)
         from public.plan_instalments as instalment
         join public.payment_plans as plan on plan.id = instalment.plan_id
         join public.reservations as reservation on reservation.id = plan.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${student}'
          and reservation.property_id = '${yurt.propertyId}'`,
    ),
  ).toBe(`${shown}/${150000 * NIGHTS}`);
});

test("a hotel opens the plan with one press, and a Property that keeps no Folios offers none", async ({
  page,
}) => {
  const hotel = aYurt("instalments hotel", { folios: true, model: "hotel" });
  const noFolios = aYurt("instalments no folios", {
    folios: false,
    model: "dormitory",
  });
  await signIn(page, OWNER_EMAIL);

  let dialog = await openRegistration(page, "en", hotel.propertyId);
  await chooseStayType(dialog, "Resident stay");
  await expect(dialog.getByRole("group", { name: "Payment plan" })).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Pay by instalments" }).click();
  await expect(
    dialog.getByRole("group", { name: "Payment plan" }),
  ).toBeVisible();
  // A Guest's booking has none, however it was begun.
  await chooseStayType(dialog, "Guest stay");
  await expect(dialog.getByRole("group", { name: "Payment plan" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  dialog = await openRegistration(page, "en", noFolios.propertyId);
  await expect(
    dialog.getByRole("radio", { name: /Student stay/ }),
  ).toBeChecked();
  await expect(dialog.getByRole("group", { name: "Payment plan" })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByRole("button", { name: "Pay by instalments" }),
  ).toHaveCount(0);
});
