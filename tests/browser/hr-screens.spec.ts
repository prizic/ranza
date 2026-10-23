import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { formatDate } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import { psql } from "./local-database";

const hr = messages.en.hr;

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-69",
);

function organizationOf(propertyId: string): string {
  return psql(
    `select organization_id from public.properties where id = '${propertyId}'`,
  );
}

/** The Property's own calendar date, the way the database counts it. */
function todayAt(propertyId: string): string {
  return psql(
    `select to_char(app.hr_today('${organizationOf(propertyId)}', '${propertyId}'), 'YYYY-MM-DD')`,
  );
}

/** Somebody employed at a Property, hired long ago so every month counts them. */
function aPersonAt(
  propertyId: string | null,
  overrides: { department?: string; position?: string; userId?: string } = {},
): string {
  const name = `Person${randomUUID().slice(0, 6)}`;
  psql(
    `insert into public.hr_employees
       (organization_id, property_id, user_id, first_name, last_name, department,
        position, hired_on, gross_pay_minor, currency)
     select organization_id, ${propertyId ? `'${propertyId}'` : "null"},
            ${overrides.userId ? `'${overrides.userId}'` : "null"},
            '${name}', 'Tester', '${overrides.department ?? "Front desk"}',
            '${overrides.position ?? "Agent"}', '1800-01-01', 1000000, 'TRY'
       from public.properties where id = '${propertyId ?? testProperty()}'`,
  );
  return name;
}

const row = (page: Page, name: string) =>
  page.locator(`[data-employee="${name} Tester"]`);

/**
 * HR-02: registering records when somebody started, and where they work.
 *
 * Watched go red first: the dialog had no start date, so the hire date in the
 * database was the day the form was saved.
 */
test("HR-S1-56: registering takes a start date, which is recorded, and says where the person will work", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = `Started${randomUUID().slice(0, 6)}`;
  const today = todayAt(propertyId);
  const earlier = new Date(`${today}T00:00:00Z`);
  earlier.setUTCDate(earlier.getUTCDate() - 120);
  const startedOn = earlier.toISOString().slice(0, 10);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);
  await page.getByRole("button", { name: hr.employees.register }).click();
  const dialog = page.getByRole("dialog", { name: hr.employees.registerTitle });

  await expect(dialog).toContainText("Registers at E2E Test Property.");
  // Today by default, and never later than today.
  await expect(dialog.getByLabel(`${hr.employees.startDate}`)).toHaveValue(
    today,
  );
  await expect(dialog.getByLabel(`${hr.employees.startDate}`)).toHaveAttribute(
    "max",
    today,
  );

  await dialog.getByLabel(`${hr.employees.firstName}`).fill(name);
  await dialog.getByLabel(`${hr.employees.lastName}`).fill("Tester");
  await dialog.getByLabel(`${hr.employees.department}`).fill("Front desk");
  await dialog.getByLabel(`${hr.employees.position}`).fill("Agent");
  await dialog.getByLabel(/^Gross pay \([A-Z]{3}\)$/).fill("30000");
  await dialog.getByLabel(`${hr.employees.startDate}`).fill(startedOn);
  await dialog.getByRole("button", { name: hr.employees.submit }).click();
  await expect(dialog).toBeHidden();

  const shown = row(page, name);
  await expect(shown).toBeVisible();
  await expect(shown).toContainText("E2E Test Property");
  expect(
    psql(
      `select to_char(hired_on, 'YYYY-MM-DD') from public.hr_employees where first_name = '${name}'`,
    ),
  ).toBe(startedOn);
});

/**
 * HR-03: an employee can be edited, and a raise is dated.
 *
 * Watched go red first: with the wage written in place the earlier month's
 * payslip read the new pay too.
 */
test("HR-S1-57: an employee's details are edited, and a raise starts in its month and leaves the months before it alone", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = aPersonAt(propertyId);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);

  await page
    .getByRole("button", { name: `${hr.employees.edit}: ${name} Tester` })
    .click();
  const dialog = page.getByRole("dialog").filter({ hasText: `${name} Tester` });

  // Details change now.
  await dialog.getByLabel(`${hr.employees.position}`).fill("Night manager");
  await dialog.getByLabel(hr.employees.phone).fill("+90 555 111 2233");
  await dialog.getByRole("button", { name: hr.employees.saveDetails }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    hr.employees.detailsSaved,
  );
  expect(
    psql(
      `select position || '|' || phone from public.hr_employees where first_name = '${name}'`,
    ),
  ).toBe("Night manager|+90 555 111 2233");

  // A raise from a month on. A bad amount is refused in words and keeps what
  // was typed; a good one is recorded.
  await dialog
    .getByRole("radio", { name: hr.employees.payHeading })
    .check({ force: true });
  await dialog.getByLabel(/^New gross pay/).fill("12.345");
  await dialog.getByLabel(hr.employees.editPayFromTitle).fill("2000-06");
  await dialog.getByRole("button", { name: hr.employees.changePay }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    hr.outcomes.invalid.grossPay,
  );
  await expect(dialog.getByLabel(/^New gross pay/)).toHaveValue("12.345");

  await dialog.getByLabel(/^New gross pay/).fill("15000");
  await dialog.getByRole("button", { name: hr.employees.changePay }).click();
  await expect(dialog.getByRole("status")).toHaveText(hr.employees.wageSaved);
  await dialog.screenshot({ path: path.join(EVIDENCE, "edit-employee.png") });
  expect(
    psql(
      `select to_char(effective_from, 'YYYY-MM') || ':' || gross_pay_minor
         from public.hr_wage_changes
        where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
    ),
  ).toBe("2000-06:1500000");
  await page.keyboard.press("Escape");

  // The month before the raise reads the old pay and the month after reads the
  // new one: nothing already paid was rewritten.
  const gross = async (period: string): Promise<string> => {
    await page.goto(
      `/en/hr?property=${propertyId}&tab=payroll&period=${period}`,
    );
    return (
      (await page
        .getByRole("row", { name: new RegExp(`${name} Tester`) })
        .getByRole("cell")
        .nth(1)
        .textContent()) ?? ""
    );
  };
  expect(await gross("2000-05")).toContain("10,000.00");
  expect(await gross("2000-07")).toContain("15,000.00");
});

test("HR-S1-59: a wage cannot start in a month whose payroll is approved, and the refusal says so", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = aPersonAt(propertyId);
  const organization = organizationOf(propertyId);
  // A run for a month long gone, approved as the owner of the database would.
  const period = "1850-01";
  psql(
    `with run as (
       insert into public.hr_payroll_runs
         (organization_id, period, currency, total_gross_minor, total_net_minor)
       values ('${organization}', '${period}', 'TRY', 1000000, 1000000)
       on conflict (organization_id, period) do nothing
       returning id
     ) select count(*) from run`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);
  await page
    .getByRole("button", { name: `${hr.employees.edit}: ${name} Tester` })
    .click();
  const dialog = page.getByRole("dialog").filter({ hasText: `${name} Tester` });
  // Only a run that is approved closes a month; a draft left from earlier does
  // not, so the refusal needs an approved one.
  psql(
    `insert into public.hr_payslips
       (organization_id, payroll_run_id, employee_id, gross_pay_minor,
        social_security_deduction_minor, tax_deduction_minor, stamp_duty_minor, net_pay_minor)
     select '${organization}', run.id, employee.id, 1000000, 0, 0, 0, 1000000
       from public.hr_payroll_runs as run, public.hr_employees as employee
      where run.organization_id = '${organization}' and run.period = '${period}'
        and run.status = 'draft' and employee.first_name = '${name}'
     on conflict do nothing`,
  );
  psql(
    `update public.hr_payroll_runs
        set status = 'approved', approved_at = now(),
            approved_by = (select id from public.users where email = '${OWNER_EMAIL}')
      where organization_id = '${organization}' and period = '${period}' and status = 'draft'`,
  );

  await dialog
    .getByRole("radio", { name: hr.employees.payHeading })
    .check({ force: true });
  await dialog.getByLabel(/^New gross pay/).fill("20000");
  await dialog.getByLabel(hr.employees.editPayFromTitle).fill("1850-01");
  await dialog.getByRole("button", { name: hr.employees.changePay }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    hr.outcomes.refused.wage_period_approved,
  );
  expect(
    psql(
      `select count(*) from public.hr_wage_changes
        where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
    ),
  ).toBe("0");
});

/**
 * HR-05: the tab is in the address.
 */
test("HR-S1-68: a period in the address opens Payroll, the arrows stay on it, and the tab survives a reload", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);

  await page.goto(`/en/hr?property=${propertyId}&period=2026-08`);
  await expect(page.getByRole("tab", { name: /Payroll/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("link", { name: hr.payroll.previousPeriod }).click();
  await expect(page).toHaveURL(/tab=payroll&period=2026-07/);
  await expect(page.getByRole("tab", { name: /Payroll/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: /Employees/ }).click();
  await expect(page).toHaveURL(/tab=employees/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /Employees/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

/**
 * HR-06 and HR-07, in a zone where the defect showed: a browser ahead of UTC
 * keyed the Monday column with Sunday's date.
 */
test.describe("the rota", () => {
  test.use({ timezoneId: "Europe/Istanbul" });

  test("HR-S1-69: a shift set on Monday is saved for Monday, and still there after a reload", async ({
    page,
  }) => {
    const propertyId = testProperty();
    const name = aPersonAt(propertyId);
    const monday = psql(
      `select to_char(date_trunc('week', app.hr_today('${organizationOf(propertyId)}', '${propertyId}'))::date, 'YYYY-MM-DD')`,
    );

    await signIn(page, OWNER_EMAIL);
    await page.goto(`/en/hr?property=${propertyId}&tab=rota`);
    const person = page.getByRole("row").filter({ hasText: name });
    const mondayCell = person.getByRole("combobox").first();
    await mondayCell.click();
    await page.getByRole("option", { name: /Evening/ }).click();
    await expect(mondayCell).toHaveAttribute("data-shift", "evening");

    await expect
      .poll(() =>
        psql(
          `select to_char(date, 'YYYY-MM-DD') || ':' || shift_type from public.hr_shifts
            where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
        ),
      )
      .toBe(`${monday}:evening`);

    await page.reload();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("combobox")
        .first(),
    ).toHaveAttribute("data-shift", "evening");
  });

  test("HR-S1-70: the rota moves a week at a time with the dates in the header, and a cell is a choice, not a cycle", async ({
    page,
  }) => {
    const propertyId = testProperty();
    const name = aPersonAt(propertyId);
    const monday = psql(
      `select to_char(date_trunc('week', app.hr_today('${organizationOf(propertyId)}', '${propertyId}'))::date, 'YYYY-MM-DD')`,
    );
    const nextMonday = new Date(`${monday}T00:00:00Z`);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    const nextMondayIso = nextMonday.toISOString().slice(0, 10);

    await signIn(page, OWNER_EMAIL);
    await page.goto(`/en/hr?property=${propertyId}&tab=rota`);
    const range = page.getByTestId("rota-week");
    const thisWeek = await range.textContent();
    await expect(range).toContainText(
      formatDate(new Date(`${monday}T00:00:00Z`), "en", {
        timeZone: "UTC",
        year: undefined,
      }),
    );

    await page.getByRole("link", { name: hr.rota.nextWeek }).click();
    await expect(page).toHaveURL(new RegExp(`week=${nextMondayIso}`));
    await expect(range).not.toHaveText(thisWeek ?? "");
    await expect(page.getByRole("tab", { name: /Rota/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Morning to Off is one choice, and the times are in the menu.
    const cell = page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("combobox")
      .first();
    await cell.click();
    await expect(
      page.getByRole("option", { name: /Morning · 07:00–15:00/ }),
    ).toBeVisible();
    await page.getByRole("option", { name: /Morning/ }).click();
    await expect(cell).toHaveAttribute("data-shift", "morning");
    await expect
      .poll(() =>
        psql(
          `select to_char(date, 'YYYY-MM-DD') from public.hr_shifts
            where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
        ),
      )
      .toBe(nextMondayIso);
    await cell.click();
    await page.getByRole("option", { name: /Off/ }).click();
    await expect(cell).toHaveAttribute("data-shift", "off");

    await page.getByRole("link", { name: hr.rota.thisWeek }).click();
    await expect(range).toHaveText(thisWeek ?? "");
  });
});

test("HR-S1-74: the rota and the leave form list the people who work at this Property, and the whole Organization's, and nobody else", async ({
  page,
}) => {
  const propertyId = testProperty();
  const here = aPersonAt(propertyId);
  const everywhere = aPersonAt(null);
  const elsewhere = aPersonAt(
    psql(
      `select id from public.properties
        where organization_id = '${organizationOf(propertyId)}' and id <> '${propertyId}'
        order by name limit 1`,
    ),
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}&tab=rota`);
  await expect(page.getByRole("row").filter({ hasText: here })).toHaveCount(1);
  await expect(
    page.getByRole("row").filter({ hasText: everywhere }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("row").filter({ hasText: elsewhere }),
  ).toHaveCount(0);

  await page.getByRole("tab", { name: /Leave/ }).click();
  await page.getByRole("button", { name: hr.leave.requestLeave }).click();
  const search = page.getByLabel(hr.leave.leaveSearch);
  await search.fill(here);
  await expect(
    page.getByRole("radio", { name: new RegExp(here) }),
  ).toBeVisible();
  await search.fill(elsewhere);
  await expect(
    page.getByRole("radio", { name: new RegExp(elsewhere) }),
  ).toHaveCount(0);
});

/**
 * HR-08, HR-09: leave is decided after a confirmation, pending first, and a
 * request without a person says what is missing.
 */
test("HR-S1-71: approving leave asks first and says the decision is final, and a decided request leaves the pending list", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = aPersonAt(propertyId);
  const today = todayAt(propertyId);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}&tab=leave`);
  await page.getByRole("button", { name: hr.leave.requestLeave }).click();
  const request = page.getByRole("dialog", {
    name: hr.leave.requestLeaveTitle,
  });

  // Nobody chosen: it says so, and keeps the dates.
  await request.getByLabel(hr.leave.startsOn).fill(today);
  await request.getByLabel(hr.leave.endsOn).fill(today);
  await expect(
    request.getByRole("button", { name: hr.leave.submit }),
  ).toBeDisabled();
  await expect(request).toContainText(hr.leave.leaveHintMissing);
  await expect(request.getByLabel(hr.leave.startsOn)).toHaveValue(today);

  await request.getByLabel(hr.leave.leaveSearch).fill(name);
  await request
    .getByRole("radio", { name: new RegExp(name) })
    .check({ force: true });
  await request.getByRole("button", { name: hr.leave.submit }).click();
  await expect(request).toBeHidden();

  const pending = page.getByRole("row").filter({ hasText: name });
  await expect(pending).toContainText(hr.leave.statuses.pending);
  await pending.getByRole("button", { name: hr.leave.approve }).click();
  const confirm = page
    .getByRole("dialog")
    .filter({ hasText: `${name} Tester` });
  await expect(confirm).toContainText("A decision is final");
  await expect(confirm).toContainText("not told from here");
  await confirm.screenshot({ path: path.join(EVIDENCE, "decide-leave.png") });

  // Cancelling decides nothing.
  await confirm.getByRole("button", { name: hr.leave.cancel }).click();
  await expect(confirm).toBeHidden();
  expect(
    psql(
      `select status from public.hr_leave_requests
        where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
    ),
  ).toBe("pending");

  await pending.getByRole("button", { name: hr.leave.approve }).click();
  await confirm.getByRole("button", { name: hr.leave.approve }).click();
  await expect(confirm).toBeHidden();
  await expect
    .poll(() =>
      psql(
        `select status from public.hr_leave_requests
          where employee_id = (select id from public.hr_employees where first_name = '${name}')`,
      ),
    )
    .toBe("approved");

  // The default list is what still needs deciding; the decided one is a filter
  // away, and a filter with nothing in it says so rather than claiming there
  // are no requests.
  await page.getByTestId("leave-filter-approved").click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    hr.leave.statuses.approved,
  );
  await page.getByTestId("leave-filter-rejected").click();
  if ((await page.getByRole("row").filter({ hasText: name }).count()) === 0) {
    await expect(page.getByTestId("leave-no-match")).toBeVisible();
  }
});

test("HR-S1-72: leave lists what is pending first, whatever its dates", async ({
  page,
}) => {
  const propertyId = testProperty();
  const old = aPersonAt(propertyId);
  const recent = aPersonAt(propertyId);
  psql(
    `insert into public.hr_leave_requests
       (organization_id, employee_id, leave_type, starts_on, ends_on, status)
     select employee.organization_id, employee.id, 'annual', '2031-01-10', '2031-01-12',
            case when employee.first_name = '${recent}' then 'approved' else 'pending' end
       from public.hr_employees as employee
      where employee.first_name in ('${old}', '${recent}')`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}&tab=leave`);
  await page.getByTestId("leave-filter-all").click();
  const names = await page.getByRole("row").allTextContents();
  const pendingAt = names.findIndex((text) => text.includes(old));
  const approvedAt = names.findIndex((text) => text.includes(recent));
  expect(pendingAt).toBeGreaterThan(-1);
  expect(pendingAt).toBeLessThan(approvedAt);
});

test("HR-S1-77: the period is a month's name, and the arrow stops at the month that is running", async ({
  page,
}) => {
  const propertyId = testProperty();
  const today = todayAt(propertyId);
  await signIn(page, OWNER_EMAIL);

  await page.goto(
    `/en/hr?property=${propertyId}&tab=payroll&period=${today.slice(0, 7)}`,
  );
  const title = page.locator("[data-period]").first();
  await expect(title).toHaveText(
    formatDate(new Date(`${today.slice(0, 7)}-01T00:00:00Z`), "en", {
      day: undefined,
      month: "long",
      timeZone: "UTC",
    }),
  );
  await expect(title).not.toHaveText(/\d{4}-\d{2}/);
  // Not a month that cannot be approved yet, and the badge says why.
  await expect(
    page.getByRole("button", { name: hr.payroll.nextPeriod }),
  ).toBeDisabled();
  await expect(
    page.getByText(hr.payroll.blockedBadge.period_not_ended),
  ).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE, "payroll-month.png") });
});

test("HR-S1-80: People and HR point at each other, and an employee with a login says so", async ({
  page,
}) => {
  const propertyId = testProperty();
  const login = psql(
    `select user_id from public.organization_memberships
      where organization_id = '${organizationOf(propertyId)}' and status = 'active'
      order by created_at limit 1`,
  );
  const name = aPersonAt(propertyId, { userId: login });

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);
  await expect(
    page.getByText(/Who can sign in, and what they may do, is on/),
  ).toBeVisible();
  await expect(
    row(page, name).getByRole("link", { name: hr.employees.hasLogin }),
  ).toHaveAttribute("href", `/en/people?property=${propertyId}`);
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/people/);
  await expect(
    page.getByRole("link", { name: "HR & payroll" }).first(),
  ).toHaveAttribute("href", `/en/hr?property=${propertyId}`);
});

test("HR-S1-81: employees can be searched and filtered, and leavers are kept out of the list until asked for", async ({
  page,
}) => {
  const propertyId = testProperty();
  const dept = `Dept${randomUUID().slice(0, 5)}`;
  const kept = aPersonAt(propertyId, { department: dept });
  const left = aPersonAt(propertyId, { department: dept });
  psql(
    `update public.hr_employees set status = 'terminated', terminated_on = '2001-01-01'
      where first_name = '${left}'`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${propertyId}`);
  await page.getByTestId("employee-search").fill(dept);
  await expect(row(page, kept)).toBeVisible();
  await expect(row(page, left)).toHaveCount(0);

  await page.getByTestId("show-left").check();
  await expect(row(page, left)).toBeVisible();
  await page.getByTestId("show-left").uncheck();

  await page.getByTestId("employee-department").click();
  await page.getByRole("option", { name: dept }).click();
  await page.getByTestId("employee-search").fill("");
  await expect(page.locator("[data-employee]")).toHaveCount(1);

  await page.getByTestId("employee-search").fill("nobody-is-called-this");
  await expect(page.getByTestId("employees-no-match")).toHaveText(
    hr.employees.noMatch,
  );
  await page.getByRole("button", { name: hr.employees.showAll }).click();
  await expect(page.getByTestId("employee-search")).toHaveValue("");
});

test("HR-S1-75: on a phone the tabs scroll instead of pushing the page sideways, and the employees stack", async ({
  page,
}) => {
  const propertyId = testProperty();
  aPersonAt(propertyId);
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 375, height: 800 });

  for (const tab of ["employees", "rota", "leave", "payroll"]) {
    await page.goto(`/en/hr?property=${propertyId}&tab=${tab}`);
    await expect(page.getByRole("tab", { name: /Employees/ })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${tab} pushes the page sideways`,
    ).toBe(true);
  }
  await page.goto(`/en/hr?property=${propertyId}&tab=employees`);
  await page.screenshot({ path: path.join(EVIDENCE, "hr-375.png") });
});

test("HR-S1-67: the HR screen reads in Arabic, mirrored, with a rail label that is not cut off", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/ar/hr?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("tab", { name: /الموظفون/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: messages.ar.navigation.hr }).first(),
  ).toBeVisible();
  expect(messages.ar.navigation.hr).toBe("الموارد البشرية");
});
