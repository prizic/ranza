import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { OWNER_EMAIL, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-68",
);

const NEW_PASSWORD = "an-invited-colleagues-password";

/** Invites somebody as Front desk at the tests' Property and returns the link shown. */
async function inviteAndCopyLink(
  page: Page,
  email: string,
  propertyId: string,
): Promise<string> {
  await page.goto(`/en/people?property=${propertyId}`);
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

/** A browser of its own with nobody signed in: the person the link was sent to. */
async function aStranger(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

function invitationOf(email: string): string {
  return psql(
    `select invitation.id
       from public.staff_invitations as invitation
       join public.users as person on person.id = invitation.user_id
      where person.email = '${email}'
      order by invitation.created_at desc limit 1`,
  );
}

/**
 * PEOPLE-01: an invited colleague can get in.
 *
 * The invite dialog used to show a bare token and nothing in the application
 * consumed it, so a person on the roster as "Awaiting a password" had no way to
 * set one. Watched go red first: with the page removed the second step 404s.
 *
 * It goes through every screen a real invitation touches — the dialog that
 * makes the link, the page behind it, the sign-in it ends in, and the roster
 * that then shows the person as having joined — and checks what the database
 * holds at the end, because "the page said welcome" is not the same as the
 * login being tied to the person who was invited.
 */
test("an invited colleague opens the link, sets a password and is signed in with the invited role and reach", async ({
  browser,
  page,
}) => {
  const propertyId = testProperty();
  const email = `e2e-accept-${randomUUID().slice(0, 8)}@example.test`;

  await signIn(page);
  const href = await inviteAndCopyLink(page, email, propertyId);
  expect(href).toMatch(/\/en\/accept-invitation\?token=[\w-]{43}$/);
  await page.getByRole("dialog").screenshot({
    path: path.join(EVIDENCE, "invite-link-shown.png"),
  });

  const { context, page: invitee } = await aStranger(browser);
  await invitee.goto(href);

  await expect(
    invitee.getByRole("heading", { name: "Choose your password" }),
  ).toBeVisible();
  await expect(invitee.getByText("Front desk").first()).toBeVisible();
  // The address is the invitation's, shown and not typed.
  await expect(invitee.getByLabel("Email")).toHaveValue(email);
  await expect(invitee.getByLabel("Email")).toHaveJSProperty("readOnly", true);
  await invitee.screenshot({ path: path.join(EVIDENCE, "accept-page.png") });

  // A password the sign-up will not take says so and keeps what was typed.
  await invitee.getByLabel("Your name").fill("Nadia Night");
  await invitee.getByLabel("Password", { exact: true }).fill("short");
  await invitee.getByRole("button", { name: "Set password and join" }).click();
  await expect(
    invitee.getByText("That password is too short or too long"),
  ).toBeVisible();
  await expect(invitee.getByLabel("Password", { exact: true })).toHaveValue(
    "short",
  );

  await invitee.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await invitee.getByRole("button", { name: "Set password and join" }).click();
  await expect(invitee).toHaveURL(/\/en\/today/);

  // Signed in as the invited person, holding the invited role: a Front desk
  // colleague reads the team and is offered nothing to change it.
  await invitee.goto(`/en/people?property=${propertyId}`);
  await expect(
    invitee.getByText(
      "You can see the team. People who manage staff can change it.",
    ),
  ).toBeVisible();
  const mine = invitee.getByRole("row").filter({ hasText: email });
  await expect(mine).toContainText("Front desk");
  await expect(mine).toContainText("E2E Test Property");
  await expect(mine).toContainText("Active");
  await expect(mine).not.toContainText("Awaiting a password");

  // The login is tied to the person the invitation made, not to a new one.
  expect(
    psql(
      `select count(*) from public.auth_identities as identity
         join public.users as person on person.id = identity.user_id
        where person.email = '${email}'`,
    ),
  ).toBe("1");
  expect(
    psql(`select count(*) from public.users where lower(email) = '${email}'`),
  ).toBe("1");
  expect(
    psql(
      `select status from public.staff_invitations where id = '${invitationOf(email)}'`,
    ),
  ).toBe("accepted");
  expect(
    psql(
      `select count(*) from audit.records
        where action = 'staff.invitation_accepted'
          and subject_id = (select membership.id
                              from public.organization_memberships as membership
                              join public.users as person on person.id = membership.user_id
                             where person.email = '${email}')`,
    ),
  ).toBe("1");

  // The link works once.
  const { context: later, page: again } = await aStranger(browser);
  await again.goto(href);
  await expect(
    again.getByRole("heading", { name: "This invitation was already used" }),
  ).toBeVisible();
  await later.close();

  // And the password they chose is the one that signs them in.
  const { context: fresh, page: signingIn } = await aStranger(browser);
  await signingIn.goto("/en/sign-in");
  await signingIn.getByLabel("Email").fill(email);
  await signingIn.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await signingIn.getByRole("button", { name: "Sign in" }).click();
  await expect(signingIn).toHaveURL(/\/en\/today/);
  await fresh.close();
  await context.close();
});

test("a link that cannot be used says why, in its own words", async ({
  browser,
  page,
}) => {
  const propertyId = testProperty();
  await signIn(page);

  const expired = `e2e-expired-${randomUUID().slice(0, 8)}@example.test`;
  const expiredLink = await inviteAndCopyLink(page, expired, propertyId);
  psql(
    `update public.staff_invitations set expires_at = now() - interval '1 hour'
      where id = '${invitationOf(expired)}'`,
  );

  const withdrawn = `e2e-withdrawn-${randomUUID().slice(0, 8)}@example.test`;
  const withdrawnLink = await inviteAndCopyLink(page, withdrawn, propertyId);
  psql(
    `update public.staff_invitations set status = 'withdrawn'
      where id = '${invitationOf(withdrawn)}'`,
  );

  const revoked = `e2e-revoked-${randomUUID().slice(0, 8)}@example.test`;
  const revokedLink = await inviteAndCopyLink(page, revoked, propertyId);
  psql(
    `update public.organization_memberships set status = 'revoked', revoked_at = now()
      where user_id = (select id from public.users where email = '${revoked}')`,
  );

  const { context, page: stranger } = await aStranger(browser);
  const messages: [string, string][] = [
    [expiredLink, "This invitation has expired"],
    [withdrawnLink, "This invitation was withdrawn"],
    [revokedLink, "This access was removed"],
    [
      `${new URL(expiredLink).origin}/en/accept-invitation?token=not-a-token`,
      "This link does not work",
    ],
  ];
  for (const [link, heading] of messages) {
    await stranger.goto(link);
    await expect(
      stranger.getByRole("heading", { name: heading }),
    ).toBeVisible();
    // Nothing to type into: a dead link offers no password field.
    await expect(stranger.getByLabel("Password", { exact: true })).toHaveCount(
      0,
    );
  }
  await stranger.goto(expiredLink);
  await stranger.screenshot({ path: path.join(EVIDENCE, "expired-link.png") });

  // Somebody else's link, opened while signed in as another person.
  const live = `e2e-someone-${randomUUID().slice(0, 8)}@example.test`;
  const liveLink = await inviteAndCopyLink(page, live, propertyId);
  const { context: owner, page: ownerPage } = await aStranger(browser);
  await signIn(ownerPage, OWNER_EMAIL);
  await ownerPage.goto(liveLink);
  await expect(
    ownerPage.getByRole("heading", {
      name: "This invitation is for someone else",
    }),
  ).toBeVisible();
  await owner.close();
  await context.close();
});

test("the invitation page reads in Arabic, mirrored", async ({
  browser,
  page,
}) => {
  const propertyId = testProperty();
  const email = `e2e-arabic-${randomUUID().slice(0, 8)}@example.test`;
  await signIn(page);
  const href = await inviteAndCopyLink(page, email, propertyId);

  const { context, page: invitee } = await aStranger(browser);
  await invitee.goto(href.replace("/en/", "/ar/"));
  await expect(invitee.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    invitee.getByRole("heading", { name: "اختر كلمة المرور" }),
  ).toBeVisible();
  await invitee.screenshot({ path: path.join(EVIDENCE, "accept-page-ar.png") });
  await context.close();
});
