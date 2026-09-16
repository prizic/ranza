import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const applications = [
  { name: "storefront", origin: "http://127.0.0.1:3100" },
  { name: "product-web", origin: "http://127.0.0.1:3101" },
  { name: "control-plane", origin: "http://127.0.0.1:3102" },
] as const;

const locales = [
  { direction: "ltr", locale: "tr" },
  { direction: "ltr", locale: "en" },
  { direction: "rtl", locale: "ar" },
] as const;

for (const application of applications) {
  test.describe(application.name, () => {
    test("redirects the unlocalized entry to Turkish", async ({ page }) => {
      await page.goto(application.origin);
      await expect(page).toHaveURL(`${application.origin}/tr`);
    });

    for (const locale of locales) {
      test(`${locale.locale} shell is localized, navigable, and accessible`, async ({
        page,
      }) => {
        const response = await page.goto(
          `${application.origin}/${locale.locale}`,
        );

        expect(response?.ok()).toBe(true);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          locale.locale,
        );
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale.direction,
        );
        await expect(page.getByRole("navigation").nth(1)).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const mixedValue = page.locator("[data-bidi-isolate]").first();
        await expect(mixedValue).toHaveAttribute("dir", "ltr");

        await page.keyboard.press("Tab");
        const skipLink = page.locator(".skip-link");
        await expect(skipLink).toBeFocused();
        await skipLink.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();

        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test("provides localized maintenance and not-found recovery", async ({
      page,
    }) => {
      await page.goto(`${application.origin}/ar/maintenance`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link")).toBeVisible();

      await page.goto(`${application.origin}/ar/missing-page`);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link")).toBeVisible();
    });
  });
}

test.describe("Product Web PWA", () => {
  test("publishes install metadata and standalone launch settings", async ({
    request,
  }) => {
    const response = await request.get(
      "http://127.0.0.1:3101/manifest.webmanifest",
    );
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      display: string;
      icons: Array<{ sizes: string; purpose?: string }>;
      lang: string;
      start_url: string;
      theme_color: string;
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("tr");
    expect(manifest.start_url).toBe("/tr");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(
      manifest.icons.some((icon) => icon.purpose?.includes("maskable")),
    ).toBe(true);
  });

  test("does not place navigations or authorization-bearing responses in caches", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:3101/tr");
    await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers are unavailable in this browser");
      }
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await registration.update();
      await navigator.serviceWorker.ready;
    });

    await page.evaluate(async () => {
      await fetch("/ar");
      await fetch("/tr", { headers: { Authorization: "Bearer smoke-test" } });
      await fetch("/tr/wifi?branch=copied-url");
    });

    const cachedRequests = await page.evaluate(async () => {
      const keys = await caches.keys();
      const requests = await Promise.all(
        keys.map(async (key) => (await caches.open(key)).keys()),
      );
      return requests.flat().map((request) => request.url);
    });

    expect(cachedRequests.some((url) => /\/(tr|ar)$/.test(url))).toBe(false);
    expect(cachedRequests.some((url) => url.includes("/wifi"))).toBe(false);
  });
});

test.describe("Product Web Student credentials", () => {
  for (const locale of locales) {
    for (const route of ["activate", "student/sign-in"] as const) {
      test(`${locale.locale} ${route} is usable and accessible on a small screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.goto(`http://127.0.0.1:3101/${locale.locale}/${route}`);

        const form = page.locator("form");
        const fields = form.locator("label");
        await expect(form).toBeVisible();
        expect(await fields.count()).toBeGreaterThanOrEqual(2);
        const boxes = await fields.evaluateAll((labels) =>
          labels.map((label) => {
            const box = label.getBoundingClientRect();
            return { bottom: box.bottom, top: box.top, width: box.width };
          }),
        );
        for (let index = 1; index < boxes.length; index += 1) {
          expect(boxes[index]!.top).toBeGreaterThanOrEqual(
            boxes[index - 1]!.bottom,
          );
        }
        expect(boxes.every((box) => box.width <= 288)).toBe(true);

        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }
});
