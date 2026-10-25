import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { aStaffMember, OWNER_EMAIL, signIn, testProperty } from "./front-desk";
import { messages } from "../../apps/operator-workspace/src/messages";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit-2026-10-24/people-hr",
);

const OTHER_PROPERTY = "Deniz Otel Kadıköy";

/** A colleague of this run's own, holding the shipped Front desk role. */
function aColleague(propertyIds: readonly string[], prefix = "e2e-hr"): string {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
  const organization = psql(
    `select organization_id from public.properties where id = '${testProperty()}'`,
  );
  psql(
    `with person as (
       insert into public.users (email) values ('${email}') returning id
     ), membership as (
       insert into public.organization_memberships
         (organization_id, user_id, role, access_scope)
       select '${organization}', person.id, 'front_desk', 'assigned_properties'
       from person
       returning organization_id, user_id
     )
     insert into public.property_assignments (property_id, organization_id, user_id)
     select property.id, membership.organization_id, membership.user_id
       from membership, unnest(array[${propertyIds.map((id) => `'${id}'::uuid`).join(",")}]::uuid[]) as property (id)`,
  );
  return email;
}

function propertyIdNamed(name: string): string {
  return psql(`select id from public.properties where name = '${name}'`);
}

/** The Properties somebody reaches right now, by name, sorted. */
function reachOf(email: string): string {
  return psql(
    `select coalesce(string_agg(property.name, ' | ' order by property.name), '')
       from public.property_assignments as assignment
       join public.properties as property on property.id = assignment.property_id
       join public.users as person on person.id = assignment.user_id
      where person.email = '${email}' and assignment.status = 'active'`,
  );
}

async function openChangeProperties(page: Page, email: string) {
  await page
    .getByRole("row")
    .filter({ hasText: email })
    .getByTestId("staff-properties")
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(email);
  return dialog;
}

async function pickProperty(page: Page, name: string) {
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Properties" })
    .click();
  await page.getByPlaceholder("Search…").fill(name);
  await page.getByRole("option", { exact: true, name }).click();
  await page.keyboard.press("Escape");
}

/**
 * PEOPLE-01: a person's Properties can be set after the invitation.
 *
 * Three screens say "they reach no Property until you assign one" and nothing
 * on the roster could. Watched red first: before the control the cell was plain
 * text and the first click found no button.
 */
test("an Owner gives a colleague a Property from the roster, is told what it does, and can take it away again", async ({
  page,
}) => {
  const colleague = aColleague([], "e2e-hr-assign");
  const testPropertyName = "E2E Test Property";

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/people?property=${testProperty()}`);

  // Reaching nothing is the state the invitation promised a way out of: the
  // cell says so and is the way.
  const cell = page
    .getByRole("row")
    .filter({ hasText: colleague })
    .getByTestId("staff-properties");
  await expect(cell).toContainText("Assign a Property");

  let dialog = await openChangeProperties(page, colleague);
  await expect(
    dialog.getByRole("button", { name: "Save Properties" }),
  ).toBeDisabled();
  await expect(dialog).toContainText("Change the selection to save");

  await pickProperty(page, testPropertyName);
  await expect(dialog.getByTestId("reach-adds")).toContainText(
    `Adds: ${testPropertyName}.`,
  );
  // The consequence is named before the press, not after.
  await expect(dialog).toContainText(
    `Saving ends every session ${colleague} holds`,
  );
  await dialog.screenshot({ path: path.join(EVIDENCE, "assign-property.png") });
  await dialog.getByRole("button", { name: "Save Properties" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => reachOf(colleague)).toBe(testPropertyName);

  const row = page.getByRole("row").filter({ hasText: colleague });
  await expect(row.getByTestId("staff-properties")).toContainText(
    testPropertyName,
  );

  // Taking it away leaves them with nothing, and the dialog says that.
  dialog = await openChangeProperties(page, colleague);
  await dialog.getByRole("combobox", { name: "Properties" }).click();
  await page.getByPlaceholder("Search…").fill(testPropertyName);
  await page
    .getByRole("option", { exact: true, name: testPropertyName })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog.getByTestId("reach-removes")).toContainText(
    `Removes: ${testPropertyName}.`,
  );
  await expect(dialog.getByTestId("reaches-nothing-warning")).toContainText(
    "reach no Property",
  );
  await dialog.getByRole("button", { name: "Save Properties" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => reachOf(colleague)).toBe("");

  // And the assignment row is kept as the record that they once reached it.
  expect(
    psql(
      `select status from public.property_assignments
        where user_id = (select id from public.users where email = '${colleague}')`,
    ),
  ).toBe("revoked");
});

test("an administrator is offered only the Properties they reach and leaves the others as they are", async ({
  page,
  request,
  baseURL,
}) => {
  const narrow = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "manager",
  );
  const other = propertyIdNamed(OTHER_PROPERTY);
  const colleague = aColleague([testProperty(), other], "e2e-hr-bounds");

  await signIn(page, narrow.email);
  await page.goto(`/en/people?property=${testProperty()}`);

  // The roster shows them the Property they reach; the other one is not theirs
  // to list, to give or to take.
  const row = page.getByRole("row").filter({ hasText: colleague });
  await expect(row.getByTestId("staff-properties")).toHaveText(
    /^E2E Test Property/,
  );
  await expect(row).not.toContainText(OTHER_PROPERTY);

  const dialog = await openChangeProperties(page, colleague);
  await dialog.getByRole("combobox", { name: "Properties" }).click();
  await expect(
    page.getByRole("option").filter({ hasNotText: "Clear selection" }),
  ).toHaveCount(1);
  await page
    .getByRole("option", { exact: true, name: "E2E Test Property" })
    .click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Save Properties" }).click();
  await expect(dialog).toBeHidden();

  // What they could see is taken; what they could not is exactly as it was.
  await expect.poll(() => reachOf(colleague)).toBe(OTHER_PROPERTY);
});

test("a change made while the dialog was open is refused with the way out, and nothing is written", async ({
  page,
}) => {
  const colleague = aColleague([testProperty()], "e2e-hr-stale");
  const other = propertyIdNamed(OTHER_PROPERTY);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/people?property=${testProperty()}`);
  const dialog = await openChangeProperties(page, colleague);

  // Somebody else gives them another Property meanwhile.
  psql(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     select '${other}', organization_id, user_id
       from public.organization_memberships
      where user_id = (select id from public.users where email = '${colleague}')`,
  );

  await pickProperty(page, "Deniz Rezidans Beşiktaş");
  await dialog.getByRole("button", { name: "Save Properties" }).click();
  await expect(dialog).toContainText(
    "Their Properties changed while this was open",
  );
  await expect(
    dialog.getByRole("button", { name: "Save Properties" }),
  ).toHaveCount(0);
  expect(reachOf(colleague)).toBe(`${OTHER_PROPERTY} | E2E Test Property`);
});

/** Invites somebody as Front desk at the tests' Property and returns the link shown. */
async function inviteAndCopyLink(page: Page, email: string): Promise<string> {
  await page.goto(`/en/people?property=${testProperty()}`);
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").click();
  await page
    .getByRole("option", { exact: true, name: "Front desk" })
    .first()
    .click();
  await dialog.getByLabel("Properties").click();
  await page.getByPlaceholder("Search…").fill("E2E Test");
  await page
    .getByRole("option", { exact: true, name: "E2E Test Property" })
    .click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Create invitation link" }).click();
  const link = dialog.getByTestId("invitation-link");
  await expect(link).toBeVisible();
  return link.inputValue();
}

/**
 * PEOPLE-02: an invitation opened where somebody else is signed in.
 *
 * The page asked for a sign-out and offered only "Go to sign in", which sends a
 * signed-in person back to their own workspace: a dead end. Watched red first
 * (the button did not exist).
 */
test("an invitation opened on a machine where somebody else is signed in offers the sign-out and carries on to the password page, in English and Arabic", async ({
  page,
}) => {
  for (const locale of ["en", "ar"] as const) {
    const email = `e2e-hr-other-${randomUUID().slice(0, 8)}@example.test`;
    const copy = messages[locale].acceptInvitation;

    await signIn(page, OWNER_EMAIL);
    const href = (await inviteAndCopyLink(page, email)).replace(
      "/en/",
      `/${locale}/`,
    );
    await page.goto(href);

    const button = page.getByRole("button", { name: copy.signOutAndContinue });
    await expect(button).toBeVisible();
    await expect(page.getByRole("link", { name: copy.goToSignIn })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: path.join(EVIDENCE, `other-account-${locale}.png`),
    });

    await button.click();
    await expect(page.locator('input[type="email"]')).toHaveValue(email);
    await expect(button).toHaveCount(0);
  }
});

/** PEOPLE-03: the role editor counts what is ticked where the action is. */
test("the role editor says how many permissions are ticked, and what nothing ticked means", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/people?property=${testProperty()}`);
  await page
    .getByRole("button", { exact: true, name: "Define a role" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Role name").fill("Counting desk");

  await dialog
    .getByRole("radio", { exact: true, name: "Housekeeping" })
    .check({ force: true });
  await expect(dialog).toContainText(/\d+ of \d+ permissions ticked/);

  const ticked = dialog.getByRole("checkbox", { checked: true });
  for (let remaining = await ticked.count(); remaining > 0; remaining -= 1) {
    await ticked.first().uncheck();
  }
  await expect(dialog).toContainText(
    "Nothing ticked: people with this role will open only Today",
  );
});

/** PEOPLE-12: what the Invite dialog withholds, and why. */
test("a Manager's invite dialog says why Owner and Every Property are not offered", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/people?property=${testProperty()}`);
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("roles-withheld")).toContainText(
    "Roles above your own, such as Owner, are not offered.",
  );
  await expect(dialog).toContainText("Every Property” is not offered");
  await dialog.screenshot({ path: path.join(EVIDENCE, "invite-withheld.png") });
});

test("an Owner's invite dialog has nothing withheld to explain", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/people?property=${testProperty()}`);
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  await expect(
    page.getByRole("dialog").getByTestId("roles-withheld"),
  ).toHaveCount(0);
});

/** PEOPLE-07: the roster can be narrowed by role and by Property. */
test("the roster is filtered by role and by Property, including the people who reach none", async ({
  page,
}) => {
  const frontDesk = aColleague([testProperty()], "e2e-hr-filter-fd");
  const nowhere = aColleague([], "e2e-hr-filter-none");
  const housekeeper = aColleague([testProperty()], "e2e-hr-filter-hk");
  psql(
    `update public.organization_memberships set role = 'housekeeping'
      where user_id = (select id from public.users where email = '${housekeeper}')`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/people?property=${testProperty()}`);
  const rowOf = (email: string) =>
    page.getByRole("row").filter({ hasText: email });

  await page.getByTestId("staff-role-filter").click();
  await page.getByRole("option", { exact: true, name: "Housekeeping" }).click();
  await expect(rowOf(housekeeper)).toHaveCount(1);
  await expect(rowOf(frontDesk)).toHaveCount(0);

  await page.getByTestId("staff-role-filter").click();
  await page.getByRole("option", { name: "All roles" }).click();
  await page.getByTestId("staff-property-filter").click();
  await page.getByRole("option", { name: "No Property yet" }).click();
  await expect(rowOf(nowhere)).toHaveCount(1);
  await expect(rowOf(frontDesk)).toHaveCount(0);
  await page.screenshot({ path: path.join(EVIDENCE, "roster-filters.png") });
});

/** PEOPLE-14: what a role save changes, and who holds a role that cannot be retired. */
test("saving a role shows what it gains and loses, and a held role names its holders and shows them", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const roleName = `Diff desk ${suffix}`;
  const colleague = aColleague([testProperty()], "e2e-hr-holder");
  psql(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     select organization_id, 'diff_desk_${suffix}', organization_id, '${roleName}',
            array['front_desk.check_in'], 'active'
       from public.properties where id = '${testProperty()}'`,
  );
  psql(
    `update public.organization_memberships
        set role = 'diff_desk_${suffix}',
            role_scope_id = (select organization_id from public.properties where id = '${testProperty()}')
      where user_id = (select id from public.users where email = '${colleague}')`,
  );

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/people?property=${testProperty()}`);
  await page
    .getByRole("tab", { exact: true, name: "What each role can do" })
    .click();

  await page
    .getByRole("checkbox", { name: `${roleName}: Open and close a Folio` })
    .check();
  await page
    .getByRole("checkbox", { name: `${roleName}: Check somebody in` })
    .uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  const save = page.getByRole("dialog");
  await expect(save.getByTestId("role-diff-added")).toContainText(
    "Open and close a Folio",
  );
  await expect(save.getByTestId("role-diff-removed")).toContainText(
    "Check somebody in",
  );
  await save.screenshot({ path: path.join(EVIDENCE, "role-save-diff.png") });
  await save.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();

  await page.getByRole("button", { name: `Actions: ${roleName}` }).click();
  await page.getByRole("menuitem", { name: "Stop offering" }).click();
  const held = page.getByRole("dialog");
  await expect(held.getByTestId("role-holders")).toContainText(colleague);
  await held.screenshot({ path: path.join(EVIDENCE, "role-holders.png") });
  await held
    .getByRole("button", { name: "Show the people who hold it" })
    .click();

  await expect(
    page.getByRole("tab", { exact: true, name: "People" }),
  ).toHaveAttribute("data-state", "active");
  await expect(
    page.getByRole("row").filter({ hasText: colleague }),
  ).toHaveCount(1);
  await expect(page.getByTestId("staff-role-filter")).toContainText(roleName);
});

/** PEOPLE-10: all four HR tabs fit a phone, in every language. */
test("HR-S1-84: the four HR tabs fit a 375 px screen in English, Turkish and Arabic", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const locale of ["en", "tr", "ar"]) {
    await page.goto(`/${locale}/hr?property=${testProperty()}`);
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab")).toHaveCount(4);
    const fits = await tabs.evaluate((list) => {
      const scroller = list.parentElement!;
      return scroller.scrollWidth <= scroller.clientWidth;
    });
    expect(fits, `${locale}: the tab bar needs a scrollbar`).toBe(true);
    await page.screenshot({
      path: path.join(EVIDENCE, `hr-tabs-375-${locale}.png`),
    });
  }
});

/** PEOPLE-06: the Start date says its limit and what to do for a later hire. */
test("HR-S1-83: the Start date says it cannot be later than today and how to register a later hire", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/hr?property=${testProperty()}`);
  await page.getByRole("button", { exact: true, name: "Add employee" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start date")).toHaveAttribute(
    "aria-describedby",
    "hiredOn-hint",
  );
  await expect(dialog.locator("#hiredOn-hint")).toContainText(
    "Today or earlier. For someone who starts later, register them on their first day.",
  );
  await dialog.screenshot({ path: path.join(EVIDENCE, "start-date-hint.png") });
});
