import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import {
  openTheCalendar,
  pickDay,
  pickUnit,
  propertyDay,
  signIn,
} from "./front-desk";
import { aBooking, aDeskProperty, archiveMadeProperties } from "./ux-fixtures";

/**
 * The 2026-10-24 UX audit's Reservations findings (lane 03), walked through the
 * real UI. Each test brings a Property of its own.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/reservations",
);

test.afterAll(() => archiveMadeProperties());

/** A Guest on file with no email, as a walk-in is, with a Turkish name. */
function aWalkIn(propertyId: string, phone: string): string {
  const tag = randomUUID().slice(0, 6).replaceAll(/[0-9]/g, "x");
  const fullName = `Özdemir${tag} Ayşe`;
  psql(
    `insert into public.guests (organization_id, full_name, phone)
     select organization_id, '${fullName}', '${phone}'
       from public.properties where id = '${propertyId}'`,
  );
  return fullName;
}

function guestsNamed(fullName: string): number {
  return Number(
    psql(`select count(*) from public.guests where full_name = '${fullName}'`),
  );
}

test.describe("a returning Guest is found and booked onto (RESERVATIONS-01)", () => {
  test("a_returning_guest_without_an_email_is_found_by_name_without_accents_or_by_telephone_and_the_booking_is_added_to_them", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const number = String(
      Math.floor(1_000_000_000 + Math.random() * 8_999_999_999),
    );
    const fullName = aWalkIn(propertyId, `+90 ${number}`);
    const free = aBooking(propertyId, {
      startsIn: 60,
      nights: 1,
      label: "Elsewhere",
    });
    await signIn(page);

    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });

    // By the name without its umlaut and cedilla.
    await dialog
      .getByLabel("Guest name")
      .fill(fullName.replace("Ö", "O").replace("ş", "s"));
    const suggestion = dialog.getByRole("button", {
      name: new RegExp(fullName.slice(0, 9)),
    });
    await expect(suggestion).toBeVisible();

    // By the telephone, typed with a trunk zero, into the telephone field.
    await dialog.getByLabel("Guest name").fill("");
    await dialog.getByLabel("Telephone").fill(`0${number}`);
    await expect(suggestion).toBeVisible();

    await suggestion.click();
    await expect(dialog.getByLabel("Guest name")).toHaveValue(fullName);
    await expect(dialog.getByText("who is already on file")).toBeVisible();

    await openTheCalendar(page, dialog);
    await pickDay(page, propertyDay(propertyId, 30));
    await pickDay(page, propertyDay(propertyId, 32));
    await page.keyboard.press("Escape");
    await pickUnit(dialog, free.unitName, "Free");
    await page.screenshot({ path: path.join(EVIDENCE, "01-picked-guest.png") });
    await dialog.getByRole("button", { name: "Create reservation" }).click();
    await expect(dialog).toBeHidden();

    expect(guestsNamed(fullName)).toBe(1);
    const booked = psql(
      `select count(*) from public.reservations as r
         join public.guests as g on g.id = r.guest_id
        where g.full_name = '${fullName}' and r.property_id = '${propertyId}'`,
    );
    expect(booked).toBe("1");
  });
});

test.describe("the booking dialog on a phone (RESERVATIONS-11)", () => {
  test("the_new_reservation_form_fits_a_375_px_dialog", async ({ page }) => {
    const propertyId = aDeskProperty();
    aBooking(propertyId, { startsIn: 60, nights: 1 });
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/reservations?property=${propertyId}`);
    await page.getByRole("button", { name: "New reservation" }).click();
    const dialog = page.getByRole("dialog", { name: "New reservation" });
    await expect(dialog.getByLabel("Guest name")).toBeVisible();
    const sizes = await dialog.evaluate((node) => {
      const widest = [...node.querySelectorAll("*")]
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .sort((a, b) => b.right - a.right)[0];
      return {
        dialogRight: node.getBoundingClientRect().right,
        widestRight: widest?.right ?? 0,
        widest: widest?.el.outerHTML.slice(0, 120),
        scroll: [...node.querySelectorAll("*")]
          .filter(
            (el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
          )
          .map(
            (el) =>
              `${el.tagName}.${el.className.toString().slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`,
          ),
      };
    });
    console.log(JSON.stringify(sizes));
    expect(sizes.widestRight).toBeLessThanOrEqual(sizes.dialogRight + 1);
    await page.screenshot({ path: path.join(EVIDENCE, "11-dialog-375.png") });
  });
});
