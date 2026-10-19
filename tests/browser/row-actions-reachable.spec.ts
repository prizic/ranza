import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { psql } from "./local-database";
import { aGuestInHouse, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-23");

/**
 * A row's actions stay in reach on the screens a desk lives in.
 *
 * A table wider than its container scrolls sideways, and the row menu sits in
 * the last column — so on a 1280 px laptop (the Departures table was 51 px
 * wider than its container there) the one control every row has scrolled out
 * of view with the cells beside it. The shared table now pins that column to
 * the end of the row. This proves it where a person would notice: in a real
 * browser at a laptop and at a phone width, in English and in Arabic, where
 * "the end" is the left edge.
 *
 * One test per language and width rather than per screen, because the cost is
 * the Guest checked in to give Departures and Finance a row to look at, and a
 * check-in is history that is never deleted.
 */

interface Screen {
  name: string;
  path: string;
  /** The control in the last cell, or null where the cell itself is what to see. */
  trigger: string | null;
  /** Opens a tab first, for a screen whose table is not the first thing on it. */
  tab?: number;
}

const SCREENS: Screen[] = [
  { name: "Arrivals", path: "arrivals", trigger: '[aria-haspopup="menu"]' },
  {
    name: "Departures",
    path: "departures?view=in_house",
    trigger: '[aria-haspopup="menu"]',
  },
  {
    name: "Reservations",
    path: "reservations",
    trigger: '[aria-haspopup="menu"]',
  },
  {
    name: "Housekeeping",
    path: "housekeeping",
    trigger: '[aria-haspopup="menu"]',
  },
  {
    name: "Maintenance equipment register",
    path: "maintenance",
    trigger: "button",
    tab: 1,
  },
  { name: "Finance folios", path: "finance", trigger: null },
  { name: "Audit log", path: "audit-log", trigger: null },
];

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

function anEquipmentItem(propertyId: string): void {
  psql(
    `insert into public.maintenance_equipment
       (organization_id, property_id, name, category, location)
     select organization_id, id, 'E2E lift ${randomUUID().slice(0, 8)}', 'Plant', 'Roof'
       from public.properties where id = '${propertyId}'`,
  );
}

/** How far the page itself scrolls sideways, which no screen should. */
function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

for (const locale of ["en", "ar"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`every row's actions are in view at ${viewport.width} px in ${locale}`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const propertyId = testProperty();
      anEquipmentItem(propertyId);
      await page.setViewportSize(viewport);
      await signIn(page);
      await aGuestInHouse(page, propertyId);

      for (const screen of SCREENS) {
        const separator = screen.path.includes("?") ? "&" : "?";
        await page.goto(
          `/${locale}/${screen.path}${separator}property=${propertyId}`,
        );
        if (screen.tab !== undefined) {
          await page.getByRole("tab").nth(screen.tab).click();
        }
        const rows = page.locator("tbody tr");
        await expect(
          rows.first(),
          `${screen.name} has a row to look at`,
        ).toBeVisible();

        expect(
          await pageOverflow(page),
          `${screen.name} scrolls the page sideways`,
        ).toBeLessThanOrEqual(0);

        // A table with nothing to press in its rows may scroll sideways
        // below a laptop's width, and nothing in it is out of reach — but it
        // must say that it does. At a laptop its last column must still be
        // whole in the window.
        if (screen.trigger === null && viewport.width < 1280) {
          const scroller = page
            .locator('[data-slot="table-container"]')
            .first();
          const overflows = await scroller.evaluate(
            (element) => element.scrollWidth > element.clientWidth + 1,
          );
          if (overflows) {
            await expect(
              scroller.locator(".."),
              `${screen.name} scrolls sideways and does not say so`,
            ).toHaveAttribute("data-cue-end", "true");
          }
          continue;
        }

        let measured = 0;
        for (const row of await rows.all()) {
          const cell = row.locator("td").last();
          const control =
            screen.trigger === null
              ? cell
              : cell.locator(screen.trigger).last();
          if ((await control.count()) === 0) continue;
          const box = await control.boundingBox();
          expect(box, `${screen.name}: a control with no box`).not.toBeNull();
          // Within the window at both edges: the right one in English, the
          // left one in Arabic, with no branch on direction to get wrong.
          expect(
            box!.x,
            `${screen.name}: a control left of the window`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            box!.x + box!.width,
            `${screen.name}: a control right of the window`,
          ).toBeLessThanOrEqual(viewport.width);
          measured += 1;
        }
        expect(
          measured,
          `${screen.name} has controls to measure`,
        ).toBeGreaterThan(0);
      }
    });
  }

  test(`a row menu opens from its pinned column at 1280 px in ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const propertyId = testProperty();
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await aGuestInHouse(page, propertyId);

    await page.goto(
      `/${locale}/departures?property=${propertyId}&view=in_house`,
    );
    const menu = page
      .locator("tbody tr")
      .first()
      .locator('td:last-child [aria-haspopup="menu"]');
    await expect(menu).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, `departures-1280-${locale}.png`),
    });
    await menu.click();
    await expect(page.getByRole("menu")).toBeVisible();
  });
}
