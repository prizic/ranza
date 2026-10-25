import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-68",
);

/** A colleague of this run's own, holding the shipped Front desk role. */
function aColleague(propertyId: string, prefix = "e2e-people"): string {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
  psql(
    `with home as (
       select organization_id as id from public.properties where id = '${propertyId}'
     ), person as (
       insert into public.users (email) values ('${email}') returning id
     ), membership as (
       insert into public.organization_memberships
         (organization_id, user_id, role, access_scope)
       select home.id, person.id, 'front_desk', 'assigned_properties'
       from home, person
       returning organization_id, user_id
     )
     insert into public.property_assignments (property_id, organization_id, user_id)
     select '${propertyId}', membership.organization_id, membership.user_id
     from membership`,
  );
  return email;
}

function statusOf(email: string): string {
  return psql(
    `select membership.status from public.organization_memberships as membership
       join public.users as person on person.id = membership.user_id
      where person.email = '${email}'`,
  );
}

async function openActions(page: Page, email: string, name: string) {
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: `Actions: ${email}` }).click();
  await page.getByRole("menuitem", { name }).click();
  return page.getByRole("dialog");
}

/**
 * PEOPLE-02 and PEOPLE-11: removing somebody's access asks first and says what
 * it does, and the undo is offered for as long as the server would accept it.
 *
 * Watched go red first: before the dialog the menu item revoked on the press,
 * and the first assertion — still active after Cancel — failed.
 */
test("removing access asks first, names the consequence, and can be taken back", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId);

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);

  let dialog = await openActions(page, colleague, "Remove access");
  await expect(dialog).toContainText(`Remove access for ${colleague}?`);
  await expect(dialog).toContainText("Every session they hold ends at once");
  await expect(dialog).toContainText("Nothing is deleted");
  await expect(dialog).toContainText("You can undo this for 24 hours");
  await dialog.screenshot({ path: path.join(EVIDENCE, "remove-access.png") });

  // Cancelling changes nothing.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(statusOf(colleague)).toBe("active");

  dialog = await openActions(page, colleague, "Remove access");
  await dialog.getByRole("button", { name: "Remove access" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => statusOf(colleague)).toBe("revoked");

  // The row says how long the undo lasts, and offers it.
  const row = page.getByRole("row").filter({ hasText: colleague });
  await expect(row).toContainText("Access removed");
  await expect(row).toContainText("Can be undone until");

  dialog = await openActions(page, colleague, "Restore access");
  await expect(dialog).toContainText("They must sign in again");
  await dialog.getByRole("button", { name: "Restore access" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => statusOf(colleague)).toBe("active");
});

test("somebody revoked more than a day ago is added back with a new link, not an undo", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId);
  psql(
    `update public.organization_memberships
        set status = 'revoked', revoked_at = now() - interval '3 days'
      where user_id = (select id from public.users where email = '${colleague}')`,
  );

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  // Hidden until asked for: a revoke a week old is history, not the roster.
  await expect(
    page.getByRole("row").filter({ hasText: colleague }),
  ).toHaveCount(0);
  await page.getByTestId("show-revoked").check();
  const row = page.getByRole("row").filter({ hasText: colleague });
  await expect(row).toContainText("The 24-hour undo window is over");

  await row.getByRole("button", { name: `Actions: ${colleague}` }).click();
  await expect(
    page.getByRole("menuitem", { name: "Restore access" }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Add back" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "They reach no Property until you assign one",
  );
  await dialog.getByRole("button", { name: "Add back" }).click();
  await expect(dialog.getByTestId("invitation-link")).toHaveValue(
    /\/en\/accept-invitation\?token=/,
  );
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => statusOf(colleague)).toBe("active");
});

test("a lost link is renewed, and the old one stops working", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId, "e2e-renew");
  psql(
    `insert into public.staff_invitations
       (organization_id, user_id, token_hash, status, expires_at, invited_by)
     select membership.organization_id, membership.user_id, 'old-${randomUUID()}',
            'pending', now() + interval '2 days',
            (select id from public.users where email = 'deniz@example.test')
       from public.organization_memberships as membership
      where membership.user_id = (select id from public.users where email = '${colleague}')`,
  );

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  const row = page.getByRole("row").filter({ hasText: colleague });
  await expect(row).toContainText("Awaiting a password");

  const dialog = await openActions(page, colleague, "New invitation link");
  await expect(dialog).toContainText("The old link stops working at once");
  await dialog.getByRole("button", { name: "Make new link" }).click();
  await expect(dialog.getByTestId("invitation-link")).toBeVisible();
  await expect(dialog).toContainText("No email was sent");
  await dialog.getByRole("button", { name: "Done" }).click();

  expect(
    psql(
      `select string_agg(status, ',' order by created_at) from public.staff_invitations
        where user_id = (select id from public.users where email = '${colleague}')`,
    ),
  ).toBe("withdrawn,pending");
});

test("the roster can be searched, and a search that finds nobody says so and offers everyone", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId, "e2e-findable");

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);

  await page.getByTestId("staff-search").fill(colleague);
  await expect(page.getByTestId("staff-row")).toHaveCount(1);
  await expect(page.getByTestId("staff-row")).toContainText(colleague);

  await page.getByTestId("staff-search").fill("nobody-has-this-address");
  await expect(page.getByTestId("staff-no-match")).toContainText(
    "Nobody on the list matches “nobody-has-this-address”.",
  );
  await page.getByRole("button", { name: "Show everyone" }).click();
  await expect(page.getByTestId("staff-search")).toHaveValue("");
  expect(await page.getByTestId("staff-row").count()).toBeGreaterThan(1);
});

test("on a phone the roster's actions are in reach, and Arabic mirrors", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId, "e2e-phone");

  await signIn(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/en/people?property=${propertyId}`);

  const actions = page.getByRole("button", { name: `Actions: ${colleague}` });
  await expect(actions).toBeVisible();
  const box = await actions.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: path.join(EVIDENCE, "roster-375.png") });

  await page.goto(`/ar/people?property=${propertyId}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: new RegExp(colleague) }).first(),
  ).toBeVisible();
});

/**
 * PEOPLE-05, PEOPLE-06 and PEOPLE-13: a role's ticks are a draft, saving says
 * how many people it signs out, the catalogue has sections, and what a shipped
 * role holds is drawn as a mark.
 */
test("role ticks are saved together, after saying who is signed out", async ({
  page,
}) => {
  const propertyId = testProperty();
  const suffix = randomUUID().slice(0, 8);
  const roleName = `Grid desk ${suffix}`;
  const colleague = aColleague(propertyId, "e2e-grid");
  psql(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     select organization_id, 'grid_desk_${suffix}', organization_id, '${roleName}',
            array['front_desk.check_in'], 'active'
       from public.properties where id = '${propertyId}'`,
  );
  psql(
    `update public.organization_memberships
        set role = 'grid_desk_${suffix}',
            role_scope_id = (select organization_id from public.properties where id = '${propertyId}')
      where user_id = (select id from public.users where email = '${colleague}')`,
  );

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  await page
    .getByRole("tab", { exact: true, name: "What each role can do" })
    .click();

  // Sections, and a filter that answers "who can see money?".
  await expect(page.getByRole("cell", { name: "Money" }).first()).toBeVisible();
  const rows = page.getByTestId("permission-row");
  const everything = await rows.count();
  expect(everything).toBeGreaterThan(30);
  await page.getByTestId("permission-section-filter").click();
  await page.getByRole("option", { name: "Money" }).click();
  await expect(rows).toHaveCount(6);
  await expect(page.getByTestId("permission-row").first()).toContainText(
    "Also shows revenue and balances",
  );
  await page.getByTestId("permission-section-filter").click();
  await page.getByRole("option", { name: "All sections" }).click();
  await expect(rows).toHaveCount(everything);

  // A tick is a draft: nothing is written until it is saved.
  const tick = page.getByRole("checkbox", {
    name: `${roleName}: Open and close a Folio`,
  });
  await tick.check();
  const bar = page.getByTestId("unsaved-roles");
  await expect(bar).toContainText("1 role has unsaved changes");
  await expect(bar).toContainText("Saving signs out 1 person.");
  expect(
    psql(
      `select 'finance.manage_folio' = any(permissions) from public.staff_roles where key = 'grid_desk_${suffix}'`,
    ),
  ).toBe("f");

  // Discarding puts it back.
  await bar.getByRole("button", { name: "Discard changes" }).click();
  await expect(tick).not.toBeChecked();
  await expect(bar).toHaveCount(0);

  await tick.check();
  await page.getByRole("button", { name: "Save changes" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(roleName);
  await expect(dialog).toContainText("1 person holds them");
  await dialog.screenshot({
    path: path.join(EVIDENCE, "save-role-changes.png"),
  });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      psql(
        `select 'finance.manage_folio' = any(permissions) from public.staff_roles where key = 'grid_desk_${suffix}'`,
      ),
    )
    .toBe("t");
  await expect(bar).toHaveCount(0);

  // A shipped role is a mark, not a pale disabled box.
  await expect(
    page
      .getByRole("img", { name: /Manager: Open and close a Folio.*: Allowed/ })
      .first(),
  ).toBeVisible();

  // And a role somebody holds cannot be switched off, with the way out.
  await page.getByRole("button", { name: `Actions: ${roleName}` }).click();
  await page.getByRole("menuitem", { name: "Stop offering" }).click();
  const held = page.getByRole("dialog");
  await expect(held).toContainText("1 person holds");
  await expect(held.getByRole("button", { name: "Stop offering" })).toHaveCount(
    0,
  );
  await page.screenshot({ path: path.join(EVIDENCE, "roles-grid.png") });
});

/**
 * The roles grid takes a refreshed answer in place. A colleague editing a role,
 * or this person's own save, sends the page fresh data; rebuilding the grid for
 * it closed a row menu that had just been opened, and CI met the menu item
 * "detached from the DOM" between opening it and pressing it.
 */
test("a role changed elsewhere appears without closing the row menu that is open", async ({
  page,
}) => {
  const propertyId = testProperty();
  const suffix = randomUUID().slice(0, 8);
  const roleName = `Refreshed desk ${suffix}`;
  psql(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     select organization_id, 'refreshed_desk_${suffix}', organization_id, '${roleName}',
            array['front_desk.check_in'], 'active'
       from public.properties where id = '${propertyId}'`,
  );

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  await page
    .getByRole("tab", { exact: true, name: "What each role can do" })
    .click();
  // By its attribute, not its role: an open menu hides the rest of the page
  // from the accessibility tree.
  const tick = page.locator(
    `[role="checkbox"][aria-label^="${roleName}: Open and close a Folio"]`,
  );
  await expect(tick).not.toBeChecked();

  await page.getByRole("button", { name: `Actions: ${roleName}` }).click();
  const item = page.getByRole("menuitem", { name: "Stop offering" });
  await expect(item).toBeVisible();

  psql(
    `update public.staff_roles
        set permissions = array['front_desk.check_in', 'finance.manage_folio']
      where key = 'refreshed_desk_${suffix}'`,
  );
  await page.evaluate(() =>
    (
      window as unknown as { next: { router: { refresh: () => void } } }
    ).next.router.refresh(),
  );

  await expect(tick).toBeChecked();
  await expect(item).toBeVisible();
});

test("a new role can start from an existing one and is listed by section", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = `Started from ${randomUUID().slice(0, 8)}`;

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  await page
    .getByRole("button", { exact: true, name: "Define a role" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Role name").fill(name);
  await dialog
    .getByRole("radio", { exact: true, name: "Housekeeping" })
    .check({ force: true });
  await expect(dialog.getByLabel("Update room status")).toBeChecked();
  await expect(dialog.getByLabel("Open and close a Folio")).not.toBeChecked();
  await expect(dialog.getByText("Money")).toBeVisible();
  await dialog.getByRole("button", { name: "Save the role" }).click();
  await expect(dialog).toBeHidden();
  expect(
    psql(
      `select array_to_string(permissions, ',') from public.staff_roles where name = '${name}'`,
    ),
  ).toContain("housekeeping.update_status");
});

test("inviting shows a role description, a reaches-nothing warning, and offers every Property to someone who reaches them", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByTestId("reaches-nothing-warning")).toBeVisible();
  await dialog.getByLabel("Role").click();
  // A Manager holds everything an Owner does but the Organization's brand, so
  // Owner is not a role they can hand out (PEOPLE-04).
  await expect(
    page.getByRole("option", { exact: true, name: "Owner" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { exact: true, name: "Manager" }),
  ).toHaveCount(1);
  await page
    .getByRole("option", { exact: true, name: "Housekeeping" })
    .first()
    .click();
  await expect(dialog).toContainText(
    "Updates room status and reports maintenance",
  );

  // The seeded Manager reaches assigned Properties only, so is not offered the
  // whole Organization.
  await expect(dialog.getByLabel(/Every Property/)).toHaveCount(0);

  await dialog.getByLabel("Properties").click();
  await page.getByPlaceholder("Search…").fill("E2E Test");
  await page
    .getByRole("option", { exact: true, name: "E2E Test Property" })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog.getByTestId("reaches-nothing-warning")).toHaveCount(0);

  // Required: a form with no role is not sent.
  await dialog
    .getByLabel("Email")
    .fill(`e2e-${randomUUID().slice(0, 6)}@example.test`);
  await dialog.getByLabel("Role").click();
  await expect(dialog).toBeVisible();
});

test("an Owner who reaches everything may give that reach on", async ({
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page, "e2e-owner@example.test");
  await page.goto(`/en/people?property=${propertyId}`);
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  const everywhere = dialog.getByLabel(/Every Property in this Organization/);
  await expect(everywhere).toBeVisible();

  const email = `e2e-wide-${randomUUID().slice(0, 6)}@example.test`;
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").click();
  await page
    .getByRole("option", { exact: true, name: "Housekeeping" })
    .first()
    .click();
  await everywhere.check();
  await expect(dialog.getByTestId("reaches-nothing-warning")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Create invitation link" }).click();
  await expect(dialog.getByTestId("invitation-link")).toBeVisible();

  expect(
    psql(
      `select membership.access_scope from public.organization_memberships as membership
         join public.users as person on person.id = membership.user_id
        where person.email = '${email}'`,
    ),
  ).toBe("organization_wide");
});
