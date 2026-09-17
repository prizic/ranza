import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

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
test("an administrator invites a colleague and is given the link to pass on", async ({
  page,
}) => {
  const propertyId = testProperty();
  const email = `e2e-invite-${randomUUID().slice(0, 8)}@example.test`;

  await signIn(page);
  await page.goto(`/en/people?property=${propertyId}`);

  await page.getByRole("button", { name: "Invite" }).click();
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

  // The shipped roles are there for everybody and say so.
  await expect(
    page.getByRole("row").filter({ hasText: "Front desk" }).first(),
  ).toContainText("Ranza");

  await page.getByRole("button", { name: "Define a role" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Role name").fill(name);
  await dialog.getByLabel("Check somebody in").check();
  await dialog.getByRole("button", { name: "Save the role" }).click();

  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  // The permission reads as the command it is, not as the key a policy matches.
  await expect(row).toContainText("Check somebody in");
  // Nobody holds it yet, which is what makes retiring it possible.
  await expect(row).toContainText("0");
});
