import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { signIn, testProperty } from "./front-desk";

/**
 * Inviting a colleague, through the screen an Organization actually uses.
 *
 * The integration suite proves the command and the pgTAP suite proves the
 * policies, the grants and the trigger. This proves the part neither of them
 * can see: that the form exists, that what a person types reaches the server
 * action in the shape the module wants, and — the one this screen exists for —
 * that the invitation link is shown to the person who created it.
 *
 * There is no Notifications module (blueprint 5.12). That field is not a
 * placeholder; it is the whole delivery mechanism, and a test that did not
 * assert it would let the feature ship undeliverable.
 *
 * Watched go red before it was believed: with the token field removed the test
 * fails at the assertion rather than at a selector.
 *
 * Each run invites somebody new and takes nothing back. A membership is
 * operational history and is revoked rather than deleted.
 */
/** A colleague of this run's own, holding the shipped Front desk role. */
function aColleague(propertyId: string): string {
  const email = `e2e-role-${randomUUID().slice(0, 8)}@example.test`;
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

/** Which role somebody holds, by scope as well as key: `front_desk@shipped`. */
function roleOf(email: string): string {
  return psql(
    `select membership.role || '@' || case
              when membership.role_scope_id = '00000000-0000-0000-0000-000000000000'
              then 'shipped' else 'organization' end
     from public.organization_memberships as membership
     join public.users as member on member.id = membership.user_id
     where member.email = '${email}'`,
  );
}

test("an administrator invites a colleague and is given the link to pass on", async ({
  page,
}) => {
  const propertyId = testProperty();
  // Not "invite" in the address: every roster row now carries a role select
  // whose accessible name is "Role: <address>", and `getByRole` matches a name
  // by substring — so an address containing the word made the Invite button
  // ambiguous with ten of them.
  const email = `e2e-joiner-${randomUUID().slice(0, 8)}@example.test`;

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);

  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Create the invitation" }).click();

  // The dialog stays open on purpose. This is the only moment the token exists
  // in a readable form — the database holds its digest and nothing else.
  const token = dialog.getByTestId("invitation-token");
  await expect(token).toBeVisible();
  await expect(token).not.toHaveValue("");

  await page.reload();

  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  // Active immediately, and not yet accepted: the membership was never waiting
  // on the link.
  await expect(row).toContainText("Awaiting a password");
  await expect(row).toContainText("Invitation sent");
});

/**
 * Composing a role, through the editor an Organization actually uses.
 *
 * The grid below the roster is the only place the shipped roles and an
 * Organization's own appear side by side, and the only place a permission has a
 * name a person reads rather than a key a policy matches. Both are what this
 * checks.
 *
 * Each run defines a role of its own and leaves it. A role is the record of
 * what somebody used to be able to do and is retired rather than deleted.
 */
test("an Organization defines a role of its own and sees it beside the shipped ones", async ({
  page,
}) => {
  const propertyId = testProperty();
  const name = `Night desk ${randomUUID().slice(0, 8)}`;

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);

  await page
    .getByRole("button", { exact: true, name: "Define a role" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Role name").fill(name);
  await dialog.getByLabel("Check somebody in").check();
  await dialog.getByRole("button", { name: "Save the role" }).click();

  await expect(dialog).toBeHidden();

  // The grid is permissions down and roles across, so the new role is a column
  // and what it may do is a ticked box in it — not a row with a list.
  await page
    .getByRole("tab", { exact: true, name: "What each role can do" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: `${name}: Check somebody in` }),
  ).toBeChecked();
  // And a shipped role is on the same grid, shown and not editable. The first
  // of that name: shipped columns come before the Organization's own, and the
  // Organization may have a "Front desk" of its own (see "picked apart" below).
  await expect(
    page
      .getByRole("checkbox", { name: "Front desk: Check somebody in" })
      .first(),
  ).toBeDisabled();
});

/**
 * Changing somebody's role from the roster.
 *
 * The select's value is `<scope>:<key>` — the pair the database keys on, so
 * an Organization's own role can never resolve to a shipped one that shares
 * its name. The server action used to pass that pair through as the key, and
 * every change was refused: "That was refused." on the screen, nothing in the
 * database, nothing in the audit log. The module's own tests called it
 * directly and never saw the pair, and no browser test changed a role.
 *
 * Both halves of the pair are exercised: a role Ranza ships, whose scope half
 * is empty, and one this Organization authored, whose scope half is the
 * Organization. Watched go red before it was believed: without `roleFrom` in
 * `changeStaffRole` this fails at the first change.
 *
 * The colleague and the authored role are written in SQL rather than through
 * their own screens, which have tests of their own; this one is about the
 * select.
 */
test("an administrator changes somebody's role from the roster", async ({
  page,
}) => {
  const propertyId = testProperty();
  const suffix = randomUUID().slice(0, 8);
  const roleName = `Night desk ${suffix}`;
  const roleKey = `night_desk_${suffix}`;

  const colleague = aColleague(propertyId);
  psql(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     select organization_id, '${roleKey}', organization_id, '${roleName}',
            array['front_desk.check_in'], 'active'
     from public.properties where id = '${propertyId}'`,
  );
  expect(roleOf(colleague)).toBe("front_desk@shipped");

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  const row = page.getByRole("row").filter({ hasText: colleague });
  const select = row.getByRole("combobox", { name: `Role: ${colleague}` });

  // A role Ranza ships.
  await select.click();
  await page.getByRole("option", { exact: true, name: "Housekeeping" }).click();
  await expect(select).toBeEnabled();
  await expect(row.getByText("That was refused.")).toHaveCount(0);
  await expect.poll(() => roleOf(colleague)).toBe("housekeeping@shipped");

  // One the Organization wrote, which only the scope half tells apart.
  await select.click();
  await page.getByRole("option", { exact: true, name: roleName }).click();
  await expect(select).toBeEnabled();
  await expect(row.getByText("That was refused.")).toHaveCount(0);
  await expect.poll(() => roleOf(colleague)).toBe(`${roleKey}@organization`);

  // And it survives a reload: the screen shows what the database holds.
  await page.reload();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: colleague })
      .getByRole("combobox", { name: `Role: ${colleague}` }),
  ).toHaveText(roleName);

  // Every change is on the record, from and to.
  expect(
    psql(
      `select string_agg(record.context->>'from' || '>' || (record.context->>'to'), ',' order by record.occurred_at)
       from audit.records as record
       join public.organization_memberships as membership on membership.id = record.subject_id
       join public.users as member on member.id = membership.user_id
       where record.action = 'staff.role_changed' and member.email = '${colleague}'`,
    ),
  ).toBe(`front_desk>housekeeping,housekeeping>${roleKey}`);
});

/**
 * An Organization's own "Front desk", beside the shipped one.
 *
 * An authored role's key is a slug of its name, so this one is `front_desk`
 * exactly as the shipped one is. Both pickers named every role from its key
 * alone, so the two read the same and nothing said which was which. Each is
 * now named by its scope and sits in the roles grid's two groups, and picking
 * the Organization's own gives the Organization's own. Watched go red before
 * it was believed: without the groups there is no telling which to press.
 *
 * A role is retired, never deleted, so this one stays the Organization's and a
 * later run finds it rather than writing it again.
 */
test("an Organization's own Front desk is picked apart from the shipped one", async ({
  page,
}) => {
  const propertyId = testProperty();
  const colleague = aColleague(propertyId);
  psql(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     select organization_id, 'front_desk', organization_id, 'Front desk',
            array['front_desk.check_in'], 'active'
     from public.properties where id = '${propertyId}'
     on conflict do nothing`,
  );

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);
  const select = page
    .getByRole("row")
    .filter({ hasText: colleague })
    .getByRole("combobox", { name: `Role: ${colleague}` });
  await select.click();

  const ranzas = page
    .getByRole("group", { name: "Ranza ships these" })
    .getByRole("option", { exact: true, name: "Front desk" });
  const ours = page
    .getByRole("group", { name: "You defined these" })
    .getByRole("option", { exact: true, name: "Front desk" });
  await expect(ranzas).toHaveAttribute("data-state", "checked");
  await expect(ours).toHaveAttribute("data-state", "unchecked");

  await ours.click();
  await expect(select).toBeEnabled();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: colleague })
      .getByText("That was refused."),
  ).toHaveCount(0);
  await expect.poll(() => roleOf(colleague)).toBe("front_desk@organization");
});
