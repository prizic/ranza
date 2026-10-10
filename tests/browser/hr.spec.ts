import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { messages } from "../../apps/operator-workspace/src/messages";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";

/**
 * The HR screen through the screens a manager actually uses (RANZ-42).
 *
 * The pgTAP suite proves the policies, the integration suite the module and the
 * unit suite the words. This proves what none of them can see: that the form
 * exists and posts the shape the action wants, that the people it registers
 * appear, that ending employment keeps them on the screen, that approving
 * payroll is one button for the whole Organization, and that a manager who
 * reaches one Property is told why they cannot.
 *
 * Each run registers people of its own and approves a period of its own,
 * because an approved run and a person's record are history that is never
 * deleted: a far-future month nobody else uses, chosen at random.
 */

const hr = messages.en.hr;

function aPeriod(): string {
  const year = 3000 + Math.floor(Math.random() * 6000);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  return `${year}-${month}`;
}

test("HR-S1-44: an Owner registers an employee, ends another's employment, and approves payroll for the whole Organization", async ({
  page,
}) => {
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 6);
  const stays = `Stays${tag}`;
  const leaves = `Leaves${tag}`;
  const period = aPeriod();

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);

  // Registering: the pay is typed in the Property's currency, and the label
  // says which.
  for (const [name, pay] of [
    [stays, "35000.50"],
    [leaves, "28000"],
  ] as const) {
    await page.getByRole("button", { name: hr.employees.register }).click();
    const dialog = page.getByRole("dialog", {
      name: hr.employees.registerTitle,
    });
    await dialog.getByLabel(`${hr.employees.firstName} *`).fill(name);
    await dialog.getByLabel(`${hr.employees.lastName} *`).fill("Tester");
    await dialog.getByLabel(`${hr.employees.department} *`).fill("Front desk");
    await dialog.getByLabel(`${hr.employees.position} *`).fill("Agent");
    await dialog.getByLabel(/^Gross pay \([A-Z]{3}\) \*$/).fill(pay);
    await dialog
      .getByLabel(hr.employees.iban)
      .fill("TR33 0006 1005 1978 6457 8413 26");
    await dialog.getByRole("button", { name: hr.employees.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.locator(`[data-employee="${name} Tester"]`),
    ).toBeVisible();
  }

  // A pay that has more decimals than the currency is refused in words.
  await page.getByRole("button", { name: hr.employees.register }).click();
  const bad = page.getByRole("dialog", { name: hr.employees.registerTitle });
  await bad.getByLabel(`${hr.employees.firstName} *`).fill("Nobody");
  await bad.getByLabel(`${hr.employees.lastName} *`).fill("Tester");
  await bad.getByLabel(`${hr.employees.department} *`).fill("Front desk");
  await bad.getByLabel(`${hr.employees.position} *`).fill("Agent");
  await bad.getByLabel(/^Gross pay \([A-Z]{3}\) \*$/).fill("100.555");
  await bad.getByRole("button", { name: hr.employees.submit }).click();
  await expect(bad.getByRole("alert")).toHaveText(hr.outcomes.invalid.grossPay);
  await bad.getByRole("button", { name: hr.employees.cancel }).click();

  // Ending employment keeps the person on the screen, as having left.
  await page
    .getByRole("button", {
      name: `${hr.employees.terminate}: ${leaves} Tester`,
    })
    .click();
  const ending = page.getByRole("dialog", {
    name: `End employment for ${leaves} Tester`,
  });
  await expect(ending).toContainText("does not remove their access");
  await ending
    .getByRole("button", { name: hr.employees.terminateConfirm })
    .click();
  await expect(ending).toBeHidden();
  const left = page.locator(`[data-employee="${leaves} Tester"]`);
  await expect(left).toContainText(hr.employees.statuses.terminated);
  await expect(left).toContainText("Left ");
  await expect(
    page.getByRole("button", {
      name: `${hr.employees.terminate}: ${leaves} Tester`,
    }),
  ).toHaveCount(0);

  // Payroll: one button for the whole Organization, with the deductions marked
  // as the placeholders they are.
  await page.goto(`/en/hr?property=${propertyId}&period=${period}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();
  await expect(page.getByRole("note").first()).toContainText(
    hr.payroll.placeholderTitle,
  );
  await expect(page.getByText(hr.payroll.organizationWide)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`${stays} Tester`) });
  await expect(row).toBeVisible();
  // The person who left is not in a later run.
  await expect(
    page.getByRole("row", { name: new RegExp(`${leaves} Tester`) }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: hr.payroll.approve }).click();
  await expect(
    page.getByText(hr.payroll.approved, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: hr.payroll.approve }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/An approved run cannot be changed/),
  ).toBeVisible();

  // The payslip opens with the number masked: the whole IBAN is not in the page.
  await row.getByRole("button", { name: hr.payroll.payslip }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("TR•• •••• •••• 1326");
  expect(await page.content()).not.toContain("6100519786");
});

test("HR-S1-17: the HR screen has a back button to Today that keeps the Property", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page, OWNER_EMAIL);
  for (const [locale, back] of [
    ["en", messages.en.back],
    ["tr", messages.tr.back],
    ["ar", messages.ar.back],
  ] as const) {
    await page.goto(`/${locale}/hr?property=${propertyId}`);
    await expect(
      page.locator(`header a[aria-label="${back}"]`),
    ).toHaveAttribute("href", `/${locale}/today?property=${propertyId}`);
  }
});

test("HR-S1-24: a manager who reaches one Property is told payroll is the whole Organization's, and is offered no approval", async ({
  page,
}) => {
  const propertyId = testProperty();

  // The seeded Manager reaches the browser tests' own Property and others, but
  // not every Property of the Organization.
  await signIn(page);
  await page.goto(`/en/hr?property=${propertyId}&period=${aPeriod()}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();

  await expect(page.getByText(hr.payroll.needsReach.title)).toBeVisible();
  await expect(
    page.getByRole("button", { name: hr.payroll.approve }),
  ).toHaveCount(0);
});
