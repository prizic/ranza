import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { formatDate } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import { psql } from "./local-database";

/**
 * The HR screen through the screens a manager actually uses (RANZ-42).
 *
 * The pgTAP suite proves the policies, the integration suite the module and the
 * unit suite the words. This proves what none of them can see: that the form
 * exists and posts the shape the action wants, that the people it registers
 * appear, that ending employment keeps them on the screen, that approving
 * payroll asks first and then locks one run for the whole Organization, that
 * a month still running cannot be approved, and that a manager who reaches one
 * Property still gets a page, and is told why they cannot approve.
 *
 * Each run registers people of its own and approves a period of its own,
 * because an approved run and a person's record are history that is never
 * deleted. A run is approved only for a period that has ended, and a person
 * registered today was hired today, so the people are given an old hire date by
 * the owner of the database, as a fixture, and the period is a long-gone month
 * nobody else uses, chosen at random.
 */

const hr = messages.en.hr;

function organizationOf(propertyId: string): string {
  return psql(
    `select organization_id from public.properties where id = '${propertyId}'`,
  );
}

/** The Organization's calendar day plus a number of months, as `YYYY-MM`. */
function monthFromToday(propertyId: string, months: number): string {
  return psql(
    `select to_char(app.hr_today('${organizationOf(propertyId)}') + interval '${months} months', 'YYYY-MM')`,
  );
}

/** A period as the screen words it: the month's name and the year. */
function monthName(period: string): string {
  return formatDate(new Date(`${period}-01T00:00:00Z`), "en", {
    day: undefined,
    month: "long",
    timeZone: "UTC",
  });
}

/** A month long gone that no run has used. */
function anUnusedPeriod(): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const year = 1900 + Math.floor(Math.random() * 100);
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const period = `${year}-${month}`;
    if (
      psql(
        `select count(*) from public.hr_payroll_runs where period = '${period}'`,
      ) === "0"
    ) {
      return period;
    }
  }
  throw new Error("no unused period in a hundred years of months");
}

test("HR-S1-44: an Owner registers an employee, ends another's employment, and approves payroll for the whole Organization", async ({
  page,
}) => {
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 6);
  const stays = `Stays${tag}`;
  const leaves = `Leaves${tag}`;
  const period = anUnusedPeriod();

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
  // People who left are kept, and shown when asked for (HR-11).
  await expect(page.locator(`[data-employee="${leaves} Tester"]`)).toHaveCount(
    0,
  );
  await page.getByTestId("show-left").check();
  const left = page.locator(`[data-employee="${leaves} Tester"]`);
  await expect(left).toContainText(hr.employees.statuses.terminated);
  await expect(left).toContainText("Left ");
  await expect(
    page.getByRole("button", {
      name: `${hr.employees.terminate}: ${leaves} Tester`,
    }),
  ).toHaveCount(0);

  // Both were hired today, which is what registering means. A run is for a
  // month that has ended, so they are given an old hire date as a fixture.
  psql(
    `update public.hr_employees set hired_on = '1800-01-01'
      where first_name in ('${stays}', '${leaves}')`,
  );

  // Payroll: one button for the whole Organization, with the deductions marked
  // as the placeholders they are. Both people are in a month long gone: the one
  // who left, after it, was employed during it.
  await page.goto(`/en/hr?property=${propertyId}&period=${period}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();
  await expect(page.getByRole("note").first()).toContainText(
    hr.payroll.placeholderTitle,
  );
  await expect(page.getByText(hr.payroll.organizationWide)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`${stays} Tester`) });
  await expect(row).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(`${leaves} Tester`) }),
  ).toBeVisible();

  // Approving asks first, and names what is about to be locked.
  await page.getByRole("button", { name: hr.payroll.approve }).click();
  const confirm = page.getByRole("dialog", {
    name: `Approve payroll for ${monthName(period)}?`,
  });
  await expect(confirm).toContainText("will be recorded as the payroll for");
  await expect(confirm).toContainText("placeholders that nobody has approved");
  await expect(confirm).toContainText(/locks the run/);
  await confirm.getByRole("button", { name: hr.payroll.cancel }).click();
  await expect(confirm).toBeHidden();
  await expect(
    page.getByText(hr.payroll.approved, { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: hr.payroll.approve }).click();
  const locking = page.getByRole("dialog", {
    name: `Approve payroll for ${monthName(period)}?`,
  });
  // Locking waits for the acknowledgement that the deductions are placeholders.
  await expect(
    locking.getByRole("button", { name: hr.payroll.confirm }),
  ).toBeDisabled();
  await locking.getByTestId("understood-placeholders").check();
  await locking.getByRole("button", { name: hr.payroll.confirm }).click();
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

test("HR-S1-45: payroll opens on the last month that ended, and a month still running cannot be approved", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page, OWNER_EMAIL);

  // No period in the address: the month before the one that is running.
  await page.goto(`/en/hr?property=${propertyId}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();
  await expect(page.locator("[data-period]").first()).toHaveAttribute(
    "data-period",
    monthFromToday(propertyId, -1),
  );

  // The month that is running, and the one after: told why, offered nothing.
  for (const months of [0, 1]) {
    const running = monthFromToday(propertyId, months);
    await page.goto(`/en/hr?property=${propertyId}&period=${running}`);
    await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();
    await expect(page.locator("[data-period]").first()).toHaveAttribute(
      "data-period",
      running,
    );
    await expect(page.getByText(/has not ended yet/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: hr.payroll.approve }),
    ).toHaveCount(0);
  }
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

test("HR-S1-47: a manager who reaches one Property still gets the page when the whole Organization's manager has rostered a floater", async ({
  page,
}) => {
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 6);
  const floater = `Floater${tag}`;

  // An employee with no Property, rostered at this Property today: the shift
  // the seeded Manager can read and the person they cannot.
  psql(
    `with employee as (
       insert into public.hr_employees
         (organization_id, first_name, last_name, department, position, gross_pay_minor)
       select organization_id, '${floater}', 'Tester', 'Front desk', 'Agent', 100
         from public.properties where id = '${propertyId}'
       returning id, organization_id
     )
     insert into public.hr_shifts
       (organization_id, property_id, employee_id, date, shift_type)
     select employee.organization_id, '${propertyId}', employee.id,
            current_date, 'day'
       from employee`,
  );

  // The seeded Manager is assigned to Properties, not to the Organization.
  await signIn(page);
  await page.goto(`/en/hr?property=${propertyId}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.rota) }).click();
  await expect(page.getByText(hr.rota.title)).toBeVisible();
  await expect(page.getByText(floater)).toHaveCount(0);
});

test("HR-S1-24: a manager who reaches one Property is told payroll is the whole Organization's, and is offered no approval", async ({
  page,
}) => {
  const propertyId = testProperty();

  // The seeded Manager reaches the browser tests' own Property and others, but
  // not every Property of the Organization.
  await signIn(page);
  await page.goto(`/en/hr?property=${propertyId}`);
  await page.getByRole("tab", { name: new RegExp(hr.tabs.payroll) }).click();

  await expect(page.getByText(hr.payroll.needsReach.title)).toBeVisible();
  await expect(
    page.getByRole("button", { name: hr.payroll.approve }),
  ).toHaveCount(0);
});

/**
 * A colleague of this run's own with a login and no employment record: a
 * membership is access, and nothing here employs them (HR-S1-49).
 */
function aLoginWithNoRecord(propertyId: string): string {
  const email = `e2e-login-${randomUUID().slice(0, 8)}@example.test`;
  psql(
    `with home as (
       select organization_id as id from public.properties where id = '${propertyId}'
     ), person as (
       insert into public.users (email) values ('${email}') returning id
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     select home.id, person.id, 'front_desk', 'assigned_properties'
     from home, person`,
  );
  return email;
}

test("HR-S1-50: an Owner registers a Staff Member's login as an employee, and the login leaves the offer", async ({
  page,
}) => {
  const propertyId = testProperty();
  const email = aLoginWithNoRecord(propertyId);
  const name = `Login${randomUUID().slice(0, 6)}`;

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);

  const offer = page.locator("[data-unregistered-staff] li", {
    hasText: email,
  });
  await expect(offer).toHaveCount(1);
  await offer
    .getByRole("button", {
      name: `${hr.employees.registerAsEmployee}: ${email}`,
    })
    .click();

  const dialog = page.getByRole("dialog", { name: hr.employees.registerTitle });
  await expect(dialog.getByLabel(hr.employees.email)).toHaveValue(email);
  await dialog.getByLabel(`${hr.employees.firstName} *`).fill(name);
  await dialog.getByLabel(`${hr.employees.lastName} *`).fill("Tester");
  await dialog.getByLabel(`${hr.employees.department} *`).fill("Front desk");
  await dialog.getByLabel(`${hr.employees.position} *`).fill("Agent");
  await dialog.getByLabel(/^Gross pay \([A-Z]{3}\) \*$/).fill("30000");
  await dialog.getByRole("button", { name: hr.employees.submit }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator(`[data-employee="${name} Tester"]`)).toBeVisible();
  await expect(offer).toHaveCount(0);
  expect(
    psql(
      `select count(*) from public.hr_employees as employee
         join public.users as member on member.id = employee.user_id
        where member.email = '${email}' and employee.first_name = '${name}'`,
    ),
  ).toBe("1");
});
