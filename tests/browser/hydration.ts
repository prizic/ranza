import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";

/**
 * A browser test that fails when the page it drives did not hydrate cleanly.
 *
 * A server-rendered page whose markup the browser then disagrees with — a
 * number, a date, a time zone, a `today` read on one side and not the other —
 * hydrates anyway in production, with the difference papered over and nothing
 * said. In development React logs it and Next puts an error overlay over the
 * page, which is how a spec passed locally and failed on CI: the overlay sat
 * over the record the assertion was looking for. Nothing in a spec's own
 * assertions notices a console error, so this does.
 *
 * `test` here is Playwright's, with one automatic fixture added: it listens to
 * the page's console and uncaught errors for the whole test, and at the end
 * fails it if any was a hydration error or if Next's error overlay is showing.
 * Import it in place of `@playwright/test`'s `test`; `expect` is unchanged.
 */

/** What React and Next write for a mismatch between server markup and client. */
export const HYDRATION_ERROR =
  /hydrat(?:ion|ed)|did(?:n't| not) match|text content does not match/i;

/**
 * A screenshot hides the caret by setting `caret-color: transparent` on the
 * page's inputs, which is a change to markup React has not hydrated yet when a
 * spec takes one straight after navigating. That is what failed the Arabic
 * audit-log spec on CI, and later the maintenance spec: the server's inputs and
 * the client's no longer matched, Next put its overlay over the page, and the
 * overlay quoted the search box's value a second time. The page was not at
 * fault, so no screenshot is allowed to touch it.
 *
 * Patched on the classes, not on the one `page`: an element's screenshot, and
 * a page opened in another context, hide the caret just the same.
 */
const caretsKept = new WeakSet<object>();

function keepCaretsInPlace(page: Page): void {
  for (const prototype of [
    Object.getPrototypeOf(page) as Pick<Page, "screenshot">,
    Object.getPrototypeOf(page.locator("body")) as Pick<Locator, "screenshot">,
  ]) {
    if (caretsKept.has(prototype)) continue;
    caretsKept.add(prototype);
    const screenshot = prototype.screenshot as (
      this: unknown,
      options?: { caret?: "hide" | "initial" },
    ) => Promise<Buffer>;
    (prototype as { screenshot: typeof screenshot }).screenshot = function (
      options,
    ) {
      return screenshot.call(this, { caret: "initial", ...options });
    };
  }
}

export const test = base.extend<{ hydratesCleanly: void }>({
  hydratesCleanly: [
    async ({ page }, use) => {
      keepCaretsInPlace(page);

      const reported: string[] = [];
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          HYDRATION_ERROR.test(message.text())
        ) {
          reported.push(message.text().slice(0, 400));
        }
      });
      page.on("pageerror", (error) => {
        if (HYDRATION_ERROR.test(error.message)) {
          reported.push(error.message.slice(0, 400));
        }
      });

      await use();

      expect(reported, "the page logged a hydration error").toEqual([]);
      if (!page.isClosed()) {
        await expect(
          page.locator("[data-nextjs-container-errors-pseudo-html-line]"),
          "Next's error overlay is showing a hydration diff",
        ).toHaveCount(0);
      }
    },
    { auto: true },
  ],
});

export { expect };
