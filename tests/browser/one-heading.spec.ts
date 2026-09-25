import { expect, test, type Page } from "@playwright/test";

import { ALL_SCREENS } from "../../apps/operator-workspace/src/lib/screens";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  aPropertyTheViewerDoesNotReach,
  signIn,
  testProperty,
} from "./front-desk";

/**
 * Every page has exactly one `h1`, or a screen reader lands on two page names
 * — or none.
 *
 * `AppPageBar` (`packages/ui/src/components/app-page-bar.tsx`) already owns
 * the route's one heading: the large title under the bar, or — for a page
 * that opens with display type of its own, such as Today — the breadcrumb's
 * last crumb. The Leaders rebrand (PR #53) gave Housekeeping, Maintenance and
 * the room calendar their own `PageHeader` heading on top of that, without
 * lowering it below `h1`, so those three routes rendered two: the bar's
 * generic title and the board's own dynamic one. `PageHeader`
 * (`packages/ui/src/components/patterns.tsx`) now says the heading a caller
 * puts inside it starts at `h2` for exactly this reason.
 *
 * Watched go red before it was believed: with a board's own heading put back
 * at `h1`, `page.locator("h1")` finds 2 on `/en/housekeeping`,
 * `/en/maintenance` and `/en/room-calendar` once a Property with the matching
 * capability is selected — the case the seeded test Property exercises below.
 * The same three routes read 1 when the Property is out of reach and the
 * board never renders, which is the assertion right after: the fix must not
 * trade the double heading for none.
 */

async function settled(page: Page): Promise<void> {
  // Same budget as navigation.spec.ts: `next dev` compiles a route the first
  // time it is asked for, and here the asking is a `goto`.
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, {
    timeout: 90_000,
  });
}

/** Every rail destination with a page of its own — `front-office` is a nav
    group and has none. `security` is not in `screens.ts` (it names no
    capability, blueprint 15) but `page-titles.ts` gives it a bar all the
    same, so it belongs here too. */
const DESTINATIONS = [
  ...ALL_SCREENS.filter((screen) => !screen.children).map(
    (screen) => screen.segment,
  ),
  "security",
];

test("the sign-in page has exactly one h1", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: messages.en.welcomeBack }),
  ).toBeVisible();
});

test("every rail destination has exactly one h1", async ({ page }) => {
  const propertyId = testProperty();
  await signIn(page);

  for (const segment of DESTINATIONS) {
    await page.goto(`/en/${segment}?property=${propertyId}`);
    await settled(page);
    // Soft: one failing route should not hide the others in the same run.
    await expect.soft(page.locator("h1"), segment).toHaveCount(1);
  }
});

/** The empty-state title each route falls back to when `frontDeskProperty`
    finds nothing for the id in `?property=` — asserted below so the test
    proves it actually exercised that branch, not the board rendering by
    coincidence. */
const EMPTY_STATE_TITLE: Record<string, string> = {
  housekeeping: messages.en.housekeeping.unavailableTitle,
  maintenance: messages.en.notEntitledTitle,
  "room-calendar": messages.en.noFrontDeskTitle,
};

test("a Property out of reach still has exactly one h1 on the boards' own routes", async ({
  page,
}) => {
  // frontDeskProperty finds nothing for a Property outside the viewer's
  // Organization, so Housekeeping, Maintenance and the room calendar fall
  // back to their empty state rather than the board — the branch with no
  // PageHeader at all, which must still leave the bar's h1 standing alone.
  const propertyId = aPropertyTheViewerDoesNotReach();
  await signIn(page);

  for (const [segment, title] of Object.entries(EMPTY_STATE_TITLE)) {
    await page.goto(`/en/${segment}?property=${propertyId}`);
    await settled(page);
    // Proves the empty state, not the board, rendered — otherwise a count of
    // 1 here would say nothing about the branch this test means to exercise.
    await expect.soft(page.getByRole("heading", { name: title })).toBeVisible();
    await expect.soft(page.locator("h1"), segment).toHaveCount(1);
  }
});
