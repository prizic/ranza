import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["tr", "en", "ar"]) {
  test(`${locale} demo form preserves entries and reports submission failure accessibly`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:3100/${locale}`);
    await page.locator("#lead-name").fill("Ada Demir");
    await page.locator("#lead-contact").fill("ada@example.com");
    await page.locator("#lead-operator").fill("Ada Yurt");
    await page.locator("#lead-beds").fill("120");
    await page.locator("#lead-city").fill("İstanbul");
    await page.locator('[name="consent"]').check();
    await page.locator('button[type="submit"]').click();
    // Unconfigured local infrastructure must produce a recoverable failure,
    // never a false persisted-success message.
    // The first request in a Next dev server may include a cold route compile.
    const submissionAlert = page.locator('.status-message[role="alert"]');
    await expect(submissionAlert).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#lead-name")).toHaveValue("Ada Demir");
    await expect(submissionAlert).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto(`http://127.0.0.1:3102/${locale}/leads`);
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.locator('input[name="id"]')).toHaveCount(0);
  });
}
