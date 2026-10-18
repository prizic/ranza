import path from "node:path";

import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aStaffMember, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-76",
);

/**
 * Turning two-step verification on and off (RANZ-76, SIGN-05, 06, 07, 11).
 *
 * One person per run, made through the application's own sign-up, because
 * turning a second factor on changes how that account signs in for good. The
 * authenticator app is played by the one-time-password library the server uses.
 */

/** What the authenticator app would show for a setup key. */
async function codeFor(setupKey: string): Promise<string> {
  const secret = new TextDecoder().decode(base32.decode(setupKey));
  return createOTP(secret).totp();
}

async function openSecurity(page: Page, locale = "en"): Promise<void> {
  await page.goto(`/${locale}/security?property=${testProperty()}`);
  await expect(page.getByLabel("Confirm with your password")).toBeVisible();
}

test("backup codes can be saved, and verifying waits until they are", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "manager",
  );
  await signIn(page, email);
  await openSecurity(page);
  await page
    .getByLabel("Confirm with your password")
    .fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Turn on" }).click();

  const setupKey = (await page.locator("main code").first().innerText()).trim();
  expect(setupKey).toMatch(/^[A-Z2-7]+$/);
  await expect(
    page.getByRole("link", { name: "Open in your authenticator app" }),
  ).toHaveAttribute("href", /^otpauth:\/\/totp\//);
  await expect(page.locator("main ul code")).toHaveCount(10);

  // The codes can leave the page, as text.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download codes" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("ranza-backup-codes.txt");
  const saved = await (
    await import("node:fs/promises")
  ).readFile(await file.path(), "utf8");
  expect(saved.trim().split("\n")).toHaveLength(10);

  // Verifying is not offered until they say the codes are somewhere safe.
  const verify = page.getByRole("button", { name: "Verify" });
  await expect(verify).toBeDisabled();
  await page.screenshot({ path: path.join(EVIDENCE, "backup-codes-en.png") });

  // A wrong code is said to be a wrong code, and the codes stay on the page.
  await page.getByLabel("I have saved these codes").check();
  await expect(verify).toBeEnabled();
  await page.getByLabel("Code", { exact: true }).fill("000000");
  await verify.click();
  await expect(page.getByText("That code is not valid.")).toBeVisible();
  await expect(page.locator("main ul code")).toHaveCount(10);

  await page.getByLabel("Code", { exact: true }).fill(await codeFor(setupKey));
  await verify.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Two-step verification is on" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "two-factor-on-en.png") });

  // Turning it off says what it changes before the click, and says it is done.
  await expect(
    page.getByText("anyone with your password can sign in as you"),
  ).toBeVisible();
  await page.getByLabel("Confirm with your password").fill("not-the-password");
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("That password did not match.")).toBeVisible();
  await page
    .getByLabel("Confirm with your password")
    .fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Two-step verification is off" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
});

test("a dropped connection and a throttled request are said to be that, and the button comes back", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "manager",
  );
  await signIn(page, email);
  await openSecurity(page);
  await page
    .getByLabel("Confirm with your password")
    .fill("correct-horse-battery-staple");
  const turnOn = page.getByRole("button", { name: "Turn on" });

  await page.route("**/api/auth/two-factor/enable", (route) => route.abort());
  await turnOn.click();
  await expect(
    page.getByText(
      "That didn't go through. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(page.getByText("That password did not match.")).toHaveCount(0);
  await expect(turnOn).toBeEnabled();

  await page.unroute("**/api/auth/two-factor/enable");
  await page.route("**/api/auth/two-factor/enable", (route) =>
    route.fulfill({
      status: 429,
      headers: { "x-retry-after": "5" },
      body: "{}",
    }),
  );
  await turnOn.click();
  await expect(
    page.getByText("Too many attempts. Try again in 5 seconds."),
  ).toBeVisible();
  await expect(page.getByText("That password did not match.")).toHaveCount(0);
  await expect(turnOn).toBeEnabled();

  await page.unroute("**/api/auth/two-factor/enable");
  await page.route("**/api/auth/two-factor/enable", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await turnOn.click();
  await expect(
    page.getByText(
      "That didn't go through. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(turnOn).toBeEnabled();
});

test("leaving halfway through enrolment asks first, in Arabic too", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { email } = await aStaffMember(
    request,
    baseURL!,
    testProperty(),
    "manager",
  );
  await signIn(page, email);
  await page.goto(`/ar/security?property=${testProperty()}`);
  await page
    .getByLabel("أكّد بكلمة المرور")
    .fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "تفعيل" }).click();
  await expect(page.locator("main ul code")).toHaveCount(10);

  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    await dialog.dismiss();
  });
  await page.locator("aside").getByRole("link", { name: "اليوم" }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain("رموز النسخ الاحتياطي");
  await expect(page).toHaveURL(/\/ar\/security/);
  await expect(page.locator("main ul code")).toHaveCount(10);
});
