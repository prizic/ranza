import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { test } from "./hydration";

import { aGuestInHouse, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-50",
);

/**
 * The frame at a tablet and at a laptop (RANZ-50): the sidebar does not eat a
 * third of a tablet, the person's choice about it is remembered, the page bar
 * still names the page, and a table that scrolls sideways says so.
 */

const SIDEBAR = "aside";

/** The sidebar's rendered width, which is what folding it changes. */
async function sidebarWidth(page: Page): Promise<number> {
  const box = await page.locator(SIDEBAR).first().boundingBox();
  expect(box, "the sidebar has a box").not.toBeNull();
  return box!.width;
}

const FOLDED = 112;
const OPEN = 200;

test("the sidebar starts folded on a tablet, opens on request and stays as chosen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);

  await page.goto(`/en/reservations?property=${testProperty()}`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBeLessThan(FOLDED);
  await page.screenshot({
    path: path.join(EVIDENCE, "tablet-folded-sidebar.png"),
  });

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(OPEN);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Collapse sidebar" }),
    "an opened sidebar is still open after a reload",
  ).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(OPEN);
});

test("the sidebar is open on a laptop, and the window decides until the person does", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(OPEN);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect
    .poll(
      () => sidebarWidth(page),
      "narrowing the window folds a sidebar nobody chose",
    )
    .toBeLessThan(FOLDED);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(OPEN);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect.poll(() => sidebarWidth(page)).toBeLessThan(FOLDED);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect
    .poll(
      () => sidebarWidth(page),
      "a folded sidebar stays folded on a laptop once chosen",
    )
    .toBeLessThan(FOLDED);
});

for (const locale of ["en", "ar"] as const) {
  test(`the page bar names the page with the sidebar open at 768 px in ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const propertyId = testProperty();
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.goto(`/${locale}/reservations?property=${propertyId}`);

    const current = page.locator('header [aria-current="page"]');
    await expect(current).toBeVisible();
    const box = await current.boundingBox();
    expect(
      box!.width,
      "the page's name is wider than a sliver",
    ).toBeGreaterThan(40);
  });

  test(`the data export controls fit at 768 px in ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const propertyId = testProperty();
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.goto(`/${locale}/data-export?property=${propertyId}`);

    const buttons = page.locator("main button", { hasText: /./ });
    await expect(buttons.first()).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(768);
    }
  });
}

test("a table wider than its box shows that more lies sideways", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await aGuestInHouse(page, propertyId);

  await page.goto(`/en/audit-log?property=${propertyId}`);
  const frame = page.locator('[data-slot="table-container"]').locator("..");
  await expect(frame.locator("tbody tr").first()).toBeVisible();
  await expect(
    frame,
    "a table that runs past the window says there is more to the end",
  ).toHaveAttribute("data-cue-end", "true");
  await expect(frame).toHaveAttribute("data-cue-start", "false");
  await page.screenshot({ path: path.join(EVIDENCE, "phone-audit-cue.png") });

  await frame
    .locator('[data-slot="table-container"]')
    .evaluate((scroller) => scroller.scrollTo({ left: 400 }));
  await expect(frame).toHaveAttribute("data-cue-start", "true");

  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(frame, "a table that fits says nothing").toHaveAttribute(
    "data-cue-end",
    "false",
  );
});

const CLOSE_LABEL = { en: "Close", tr: "Kapat", ar: "إغلاق" } as const;

for (const locale of ["en", "tr", "ar"] as const) {
  test(`a dialog names its close control in ${locale} and fits a phone`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(`/${locale}/reservations?property=${testProperty()}`);
    await page.locator('main button[aria-haspopup="dialog"]').first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: CLOSE_LABEL[locale] });
    await expect(close).toHaveCount(1);

    const box = await close.boundingBox();
    expect(box!.x, "the close control is on the screen").toBeGreaterThanOrEqual(
      0,
    );
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    const frame = await dialog.boundingBox();
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(390);
  });
}

test("the audit log on a phone folds its filters and shows who did it", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const propertyId = testProperty();
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await aGuestInHouse(page, propertyId);
  await page.goto(`/en/audit-log?property=${propertyId}`);

  const filters = page.getByRole("button", { name: /^Filters/ });
  await expect(filters).toBeVisible();
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Search", { exact: true })).toBeHidden();

  // The first record is on the first screen, not under five fields.
  const first = page.locator("tbody tr").first();
  await expect(first).toBeVisible();
  const row = await first.boundingBox();
  expect(row!.y, "the first record starts on the first screen").toBeLessThan(
    500,
  );

  // Who did it is in the row, in view, without scrolling it sideways.
  const who = first.getByText(/^Who:/);
  await expect(who).toBeVisible();
  const where = await who.boundingBox();
  expect(where!.x + where!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: path.join(EVIDENCE, "phone-audit-folded-filters.png"),
  });

  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible();

  // On a laptop nothing is folded and nothing is said twice.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(filters).toBeHidden();
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
  await expect(first.getByText(/^Who:/)).toBeHidden();
});

test("the phone's bottom bar names every destination it offers, and Arabic names Housekeeping as the product does", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page);
  await page.goto(`/ar/today?property=${testProperty()}`);

  const dock = page.locator("nav.glass-panel").last();
  await expect(dock).toBeVisible();
  const labels = dock.locator("a span.line-clamp-2");
  await expect(labels.first()).toBeVisible();
  for (const label of await labels.all()) {
    const clipped = await label.evaluate(
      (element) =>
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1,
    );
    expect(clipped, `${await label.innerText()} is cut off`).toBe(false);
  }
  await expect(dock).toContainText("التدبير الفندقي");
  await expect(dock).not.toContainText("خدمة الغرف");
  await page.screenshot({ path: path.join(EVIDENCE, "phone-dock-ar.png") });

  await page.goto(`/en/today?property=${testProperty()}`);
  for (const label of await dock.locator("a span.line-clamp-2").all()) {
    const clipped = await label.evaluate(
      (element) =>
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1,
    );
    expect(clipped, `${await label.innerText()} is cut off`).toBe(false);
  }
  await page.screenshot({ path: path.join(EVIDENCE, "phone-dock-en.png") });
});
