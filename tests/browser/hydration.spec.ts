import { expect, test, type Page } from "@playwright/test";

import { HYDRATION_ERROR } from "./hydration";
import { signIn, testProperty } from "./front-desk";

/**
 * What the hydration guard is listening for, tried against the failure that
 * made it.
 *
 * The Arabic audit-log spec failed on CI with a hydration error and Next's
 * overlay over the page, and the page was not the cause: Playwright's
 * screenshot had set `caret-color: transparent` on the inputs while React was
 * hydrating them. This holds the page's scripts back, does the same to the
 * server's HTML by hand, and lets hydration run — which is the state CI's slow
 * hydration reached by accident — then checks the message React logs is one the
 * guard recognises. This spec uses Playwright's own `test`, because the guarded
 * one would fail it for doing exactly this.
 */

/** The audit log, server-rendered and held back from hydrating until `release`. */
async function anUnhydratedAuditLog(page: Page): Promise<() => void> {
  await signIn(page);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/static\/.*\.js/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/ar/audit-log?property=${testProperty()}&q=hydration`, {
    waitUntil: "commit",
  });
  await expect(page.getByRole("searchbox")).toBeVisible();
  return release;
}

test("an input changed before hydration is logged as an error the guard recognises", async ({
  page,
}) => {
  const release = await anUnhydratedAuditLog(page);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.evaluate(() => {
    for (const input of document.querySelectorAll("input")) {
      input.style.caretColor = "transparent";
    }
  });
  release();
  await page.waitForLoadState("networkidle");
  await expect
    .poll(() => errors.some((text) => HYDRATION_ERROR.test(text)))
    .toBe(true);
});
