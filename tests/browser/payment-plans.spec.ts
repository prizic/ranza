import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { aFreshProperty } from "./fresh-property";
import { checkIn, openFolioOf } from "./folio-ui";
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

test("a Resident's booking shows its schedule, takes a plan later, and the Folio names an instalment in the reader's language", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const yurt = aYurt("instalments sheet", { folios: true, model: "dormitory" });
  const student = `Sheet Öğrenci ${randomUUID().slice(0, 6)}`;
  const NIGHTS = 70;
  await signIn(page, OWNER_EMAIL);

  // Registered with the dormitory's open plan turned off, which is the one
  // way a Resident's booking has none to start with.
  let dialog = await openRegistration(page, "en", yurt.propertyId);
  await dialog.getByLabel("Guest name").fill(student);
  await chooseTheTerm(page, yurt.propertyId, NIGHTS);
  await dialog.getByRole("button", { name: "No payment plan" }).click();
  await expect(dialog.getByRole("group", { name: "Payment plan" })).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Create registration" }).click();
  await expect(dialog).toBeHidden();

  const reservationId = psql(
    `select reservation.id
       from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${student}'
        and reservation.property_id = '${yurt.propertyId}'`,
  );
  const bookingUrl = (locale: string) =>
    `/${locale}/reservations?property=${yurt.propertyId}&open=${reservationId}`;
  expect(
    psql(
      `select count(*) from public.payment_plans
        where reservation_id = '${reservationId}'`,
    ),
  ).toBe("0");

  // The booking says it has no plan and offers one where the desk is looking.
  await page.goto(bookingUrl("en"));
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/^No payment plan\./)).toBeVisible();
  await sheet.getByRole("button", { name: "Add a payment plan" }).click();

  // Prefilled from the price list and the booking's own term: 70 nights at
  // 1,500.00, the first instalment due the day the term begins.
  dialog = page.getByRole("dialog", { name: "Payment plan" });
  await expect(dialog.getByLabel("Total fees")).toHaveValue("105000");
  await expect(dialog.getByLabel("Instalment 1 · Due on")).toHaveValue(
    propertyDay(yurt.propertyId, 0),
  );
  await expect(
    dialog.getByRole("button", { name: "No payment plan" }),
  ).toHaveCount(0);
  const planned = await dialog.getByRole("listitem").count();
  expect(planned).toBeGreaterThanOrEqual(2);
  await dialog.screenshot({
    path: path.join(EVIDENCE, "booking-add-plan-en.png"),
  });
  await dialog.getByRole("button", { name: "Save the plan" }).click();
  await expect(dialog).toBeHidden();

  // What the desk saw is what was made, and the booking now shows it.
  expect(
    psql(
      `select count(*) || '/' || sum(instalment.amount_minor)
         from public.plan_instalments as instalment
         join public.payment_plans as plan on plan.id = instalment.plan_id
        where plan.reservation_id = '${reservationId}'`,
    ),
  ).toBe(`${planned}/${150000 * NIGHTS}`);
  await expect(sheet.getByText(`${planned} instalments`)).toBeVisible();
  await expect(sheet.getByText("Still to pay")).toBeVisible();
  await expect(sheet.getByText("Due today")).toHaveCount(1);
  await expect(sheet.getByText("Upcoming")).toHaveCount(planned - 1);
  await sheet.getByText("Still to pay").scrollIntoViewIfNeeded();
  await sheet.screenshot({ path: path.join(EVIDENCE, "booking-sheet-en.png") });

  // The same booking in the other two languages, Arabic mirrored.
  for (const [locale, title] of [
    ["tr", "Ödeme planı"],
    ["ar", "خطة الدفع"],
  ] as const) {
    await page.goto(bookingUrl(locale));
    const heading = page.getByRole("dialog").getByText(title, { exact: true });
    await expect(heading).toBeVisible();
    // The plan sits below the fold of a long sheet; the evidence is the plan.
    await heading.scrollIntoViewIfNeeded();
    if (locale === "ar") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await page.getByRole("dialog").screenshot({
      path: path.join(EVIDENCE, `booking-sheet-${locale}.png`),
    });
  }

  // Once the Resident is in, the worker charges what has fallen due. The pass
  // itself is proved against the real worker in the integration suite; here the
  // line is placed as the worker writes it, so the screen has one to name.
  await checkIn(page, yurt.propertyId, student);
  const folioId = openFolioOf(student);
  psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, source, business_date, instalment_id)
     select folio.organization_id, folio.property_id, folio.id, 'charge',
            'Instalment 1 of ${planned}', instalment.amount_minor, 'instalment',
            instalment.due_on, instalment.id
       from public.folios as folio,
            public.plan_instalments as instalment
       join public.payment_plans as plan on plan.id = instalment.plan_id
      where folio.id = '${folioId}'
        and plan.reservation_id = '${reservationId}'
        and instalment.due_on = (
          select min(first.due_on) from public.plan_instalments as first
           where first.plan_id = plan.id)`,
  );
  for (const [locale, line] of [
    ["en", `Instalment 1 of ${planned}`],
    ["tr", `Taksit 1 / ${planned}`],
    ["ar", `القسط 1 من ${planned}`],
  ] as const) {
    await page.goto(
      `/${locale}/finance?property=${yurt.propertyId}&folio=${folioId}`,
    );
    await expect(page.getByText(line, { exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, `folio-instalment-${locale}.png`),
    });
  }
});
