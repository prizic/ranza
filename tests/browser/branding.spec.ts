import path from "node:path";

import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";
import { test } from "./hydration";

import {
  DESK_EMAIL,
  OWNER_EMAIL,
  PASSWORD,
  signIn,
  testProperty,
} from "./front-desk";
import { messages } from "../../apps/operator-workspace/src/messages";
import { psql } from "./local-database";
import { png } from "../unit/branding-images";
import {
  aLogo,
  aResident,
  brandTheOrganization,
  clearTheBrand,
  PORTAL_URL,
  signInToThePortal,
  theOrganization,
} from "./portal";

/**
 * An Organization's colour and logo reach the Portal a Guest actually opens
 * (RANZ-47, BR-S1-*).
 *
 * The integration suite proves what the module stores and the pgTAP suite
 * proves who may; this proves the part neither can see: that the screen takes
 * a colour and a file, that the preview follows them, that what is saved is
 * what a Resident's Portal is drawn in on its next load, and that taking it
 * away puts the Portal back. The Resident is a real sign-in to the real
 * Portal, in a browser context of its own.
 *
 * What a colour "carries" is asserted in computed style rather than in a
 * class name: the active navigation item is the one `bg-primary` element
 * every Portal page has, and the shell holds the two tokens a brand sets.
 *
 * Every test starts from an Organization with no brand and brings a Resident
 * of its own, because a Stay is history that is never deleted.
 *
 * Breaks that were run, and what went red:
 *   the Portal shell's inline tokens removed         BR-S1-01 and BR-S1-12
 *     (the active item stayed the theme's green: rgb(18, 84, 75), not burgundy)
 *   the contrast limit lowered from 4.5 to 1          BR-S1-04 here, and its unit test
 */

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-47");
const BURGUNDY = "#7a1e3c";
const BURGUNDY_RGB = "rgb(122, 30, 60)";
const WHITE_RGB = "rgb(255, 255, 255)";

async function aPortalPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  return context.newPage();
}

/** What the active navigation item is painted in: the one `bg-primary` on every page. */
async function activeItem(
  page: Page,
): Promise<{ background: string; text: string }> {
  const item = page.locator('aside a[aria-current="page"]');
  await expect(item).toBeVisible();
  return item.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
}

/** A CSS colour as the browser computes it (`rgb(...)` or `#rrggbb`), against white. */
function contrastWithWhite(color: string): number {
  const channels = color.startsWith("#")
    ? [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16))
    : (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const [red, green, blue] = channels.map((value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
}

/**
 * Chooses the logo, and is sure the screen has taken it: a file chosen before
 * the page has hydrated is lost, and Save stays disabled for ever. The first
 * choice that enables Save is the one that counts, so it is made again until it
 * does.
 */
async function chooseLogo(page: Page, buffer: Buffer): Promise<void> {
  await expect(async () => {
    await page.getByLabel("Logo file").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer,
    });
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
}

function shellOf(page: Page) {
  return page.locator("div.min-h-svh").first();
}

test.beforeEach(() => {
  clearTheBrand(theOrganization());
});

test("BR-S1-01: the Owner brands the Organization and the Resident's Portal carries the colour and the logo", async ({
  browser,
  page,
  request,
}) => {
  const resident = await aResident(request);
  const portal = await aPortalPage(browser);
  await signInToThePortal(portal, resident.email);
  const before = await activeItem(portal);
  await expect(portal.locator("header img")).toHaveCount(0);

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.locator("h1")).toHaveText("Branding");
  // Every inner page has a way up (ADR 0035).
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();

  await page.getByLabel("Colour (#rrggbb)").fill(BURGUNDY);
  await expect(
    page.getByText(/Text on filled surfaces is white/),
  ).toBeVisible();
  await chooseLogo(page, aLogo());

  // The preview follows the draft before anything is saved.
  const preview = page.getByTestId("brand-preview");
  await expect(preview.locator("img")).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Primary button" }),
  ).toHaveCSS("background-color", BURGUNDY_RGB);
  await expect(portal.locator("header img")).toHaveCount(0);

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "branding-screen.png"),
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Saved. Guests see it the next time they open a page."),
  ).toBeVisible();

  // The Resident's next load.
  await portal.reload();
  const logo = portal.locator("header img");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute(
    "src",
    new RegExp(`^/api/brand/${resident.stayId}/logo\\?v=[0-9a-f]{64}$`),
  );
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  const after = await activeItem(portal);
  expect(after).toEqual({ background: BURGUNDY_RGB, text: WHITE_RGB });
  expect(before.background).not.toBe(BURGUNDY_RGB);
  await expect
    .poll(() =>
      shellOf(portal).evaluate((shell) =>
        getComputedStyle(shell).getPropertyValue("--primary").trim(),
      ),
    )
    .toBe(BURGUNDY);

  await portal.screenshot({ path: path.join(EVIDENCE, "portal-branded.png") });
});

test("BR-S1-12: reset returns the Portal to the default theme", async ({
  browser,
  page,
  request,
}) => {
  const resident = await aResident(request);
  const portal = await aPortalPage(browser);
  await signInToThePortal(portal, resident.email);
  const defaults = await activeItem(portal);

  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await portal.reload();
  expect((await activeItem(portal)).background).toBe(BURGUNDY_RGB);
  await expect(portal.locator("header img")).toBeVisible();

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue(BURGUNDY);
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByText("Back to the default theme.")).toBeVisible();
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue("");

  await portal.reload();
  await expect(portal.locator("header img")).toHaveCount(0);
  expect(await activeItem(portal)).toEqual(defaults);
  await expect(shellOf(portal)).not.toHaveAttribute("style", /--primary/);
});

test("BR-S1-04: a light colour is accepted and the screen shows the darker shade used for text", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);
  const field = page.getByLabel("Colour (#rrggbb)");
  const save = page.getByRole("button", { name: "Save", exact: true });

  // A yellow: a fine button and an unreadable link.
  await field.fill("#ffeb3b");
  await expect(
    page.getByText(/Links and text use a darker shade of the same hue/),
  ).toBeVisible();
  await expect(page.getByText("Buttons and fills")).toBeVisible();
  await expect(page.getByText("Links and text", { exact: true })).toBeVisible();
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(save).toBeEnabled();

  // The preview draws a link in the shade, which reads on white.
  const link = page.getByTestId("brand-preview").getByText("A link");
  const shade = await link.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(contrastWithWhite(shade)).toBeGreaterThanOrEqual(4.5);
  const fill = page
    .getByTestId("brand-preview")
    .getByRole("button", { name: "Primary button" });
  await expect(fill).toHaveCSS("background-color", "rgb(255, 235, 59)");
  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "branding-screen-light-colour.png"),
  });

  // A colour that already reads on white is its own text colour.
  await field.fill(BURGUNDY);
  await expect(
    page.getByText(/Links and text use the colour itself/),
  ).toBeVisible();

  await field.fill("rebeccapurple");
  await expect(page.getByText(/Write the colour like #0f5132/)).toBeVisible();
  await expect(save).toBeDisabled();
});

test("BR-S1-04: a link in the Portal of an orange brand reads at 4.5:1 on white", async ({
  browser,
  request,
}) => {
  const ORANGE = "#e67e22";
  brandTheOrganization(theOrganization(), ORANGE, aLogo());
  const resident = await aResident(request);
  const portal = await aPortalPage(browser);
  await signInToThePortal(portal, resident.email);

  // Fills are the colour as it is.
  expect((await activeItem(portal)).background).toBe("rgb(230, 126, 34)");

  // The Portal has no link on its one page, so one is drawn where a link
  // would be, in the theme's own class for it, inside the branded shell.
  const link = await shellOf(portal).evaluate((shell) => {
    const anchor = document.createElement("a");
    anchor.className = "text-primary-text";
    anchor.textContent = "a link";
    shell.appendChild(anchor);
    const style = getComputedStyle(anchor);
    return {
      color: style.color,
      ring: getComputedStyle(shell).getPropertyValue("--ring").trim(),
    };
  });
  expect(contrastWithWhite(link.color)).toBeGreaterThanOrEqual(4.5);
  expect(link.color).not.toBe("rgb(230, 126, 34)");
  // Focus rings are drawn in the same shade.
  expect(contrastWithWhite(link.ring)).toBeGreaterThanOrEqual(4.5);
});

test("BR-S1-23: the Portal's sign-in page stays Ranza's", async ({
  browser,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  const visitor = await aPortalPage(browser);
  await visitor.goto(`${PORTAL_URL}/en/sign-in`);

  const submit = visitor.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  const background = await submit.evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  );
  expect(background).not.toBe(BURGUNDY_RGB);
  await expect(visitor.locator("img[src*='/api/brand/']")).toHaveCount(0);
});

test("BR-S1-24: the Workspace stays Ranza's while the Organization is branded", async ({
  page,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await signIn(page, OWNER_EMAIL);

  const item = page.locator('aside a[aria-current="page"]');
  await expect(item).toBeVisible();
  expect(
    await item.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(BURGUNDY_RGB);
  await expect(shellOf(page)).not.toHaveAttribute("style", /--primary/);

  // Not even on the screen that sets the brand.
  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveValue(BURGUNDY);
  await expect(shellOf(page)).not.toHaveAttribute("style", /--primary/);
  expect(
    await page
      .locator('aside a[aria-current="page"]')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(BURGUNDY_RGB);
});

test("BR-S1-29: a Staff Member without branding.manage does not see the Branding screen", async ({
  page,
}) => {
  await signIn(page, DESK_EMAIL);
  await expect(page.getByRole("link", { name: "Branding" })).toHaveCount(0);

  await page.goto(`/en/branding?property=${testProperty()}`);
  await expect(
    page.getByRole("heading", { name: messages.en.denied.noPermissionTitle }),
  ).toBeVisible();
  await expect(page.getByLabel("Colour (#rrggbb)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

  // And the Owner, who does hold it, finds the entry in the rail.
  await page.context().clearCookies();
  await signIn(page, OWNER_EMAIL);
  await expect(
    page.getByRole("link", { name: "Branding" }).first(),
  ).toBeVisible();
});

test("BR-S1-33: the Branding screen reads right to left in Arabic with the colour field left to right", async ({
  page,
}) => {
  brandTheOrganization(theOrganization(), BURGUNDY, aLogo());
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/ar/branding?property=${testProperty()}`);

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("h1")).toHaveText("الهوية البصرية");
  const field = page.getByLabel(/^اللون/);
  await expect(field).toHaveAttribute("dir", "ltr");
  await expect(field).toHaveValue(BURGUNDY);
  await expect(page.getByText("لون العلامة")).toBeVisible();
  // The server's verdict on the saved colour, which is drawn under it.
  await expect(
    page.getByText(/تُرسم الروابط والنصوص باللون نفسه/),
  ).toBeVisible();
  await expect(page.getByTestId("brand-preview").getByRole("button")).toHaveCSS(
    "background-color",
    BURGUNDY_RGB,
  );

  await page.screenshot({
    fullPage: true,
    path: path.join(EVIDENCE, "branding-screen-arabic.png"),
  });
});

/** The Organization's Subscription, so a test that suspends it can put it back. */
function subscriptionStatus(organizationId: string): string {
  return psql(
    `select status from public.subscriptions where organization_id = '${organizationId}'`,
  );
}

function setSubscription(organizationId: string, status: string): void {
  psql(
    `update public.subscriptions set status = '${status}' where organization_id = '${organizationId}'`,
  );
}

/** A browser-less session of its own: cookies are kept per context, never shared. */
async function signedInWorkspace(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string,
  email: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL });
  const answer = await context.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL },
    data: { email, password: PASSWORD },
  });
  expect(answer.ok(), `could not sign in ${email}: ${answer.status()}`).toBe(
    true,
  );
  return context;
}

test("BR-S1-40: the Portal's logo route answers 401 without a session and 404 for another person's Stay, a departed Stay and a gated Organization", async ({
  playwright,
}) => {
  const organization = theOrganization();
  brandTheOrganization(organization, BURGUNDY, aLogo());
  const mine = await playwright.request.newContext();
  const theirs = await playwright.request.newContext();
  const gated = await playwright.request.newContext();
  const stranger = await playwright.request.newContext();
  const me = await aResident(mine);
  const them = await aResident(theirs);
  const lapsed = await aResident(gated);
  const logo = (stay: string) => `${PORTAL_URL}/api/brand/${stay}/logo`;

  // No session at all.
  expect((await stranger.get(logo(me.stayId))).status()).toBe(401);

  // Their own, and not somebody else's.
  expect((await mine.get(logo(me.stayId))).status()).toBe(200);
  const another = await mine.get(logo(them.stayId));
  expect(another.status()).toBe(404);
  expect(await another.body()).toHaveLength(0);
  expect((await mine.get(logo("not-a-uuid"))).status()).toBe(404);
  expect(
    (await mine.get(logo("00000000-0000-8000-8000-000000000000"))).status(),
  ).toBe(404);

  // An Organization whose Subscription is suspended shows its Resident no Stay
  // and so no brand; a past-due one is in its grace period.
  const before = subscriptionStatus(organization);
  try {
    expect((await gated.get(logo(lapsed.stayId))).status()).toBe(200);
    setSubscription(organization, "suspended");
    expect((await gated.get(logo(lapsed.stayId))).status()).toBe(404);
    setSubscription(organization, "past_due");
    expect((await gated.get(logo(lapsed.stayId))).status()).toBe(200);
  } finally {
    setSubscription(organization, before);
  }

  // A Stay that has ended.
  psql(
    `update public.stays set status = 'departed', ends_on = date '2026-09-05',
            departed_at = now() where id = '${me.stayId}'`,
  );
  expect((await mine.get(logo(me.stayId))).status()).toBe(404);
});

test("BR-S1-40: the Portal's logo is served private, nosniff, with its stored type and a closed policy", async ({
  playwright,
}) => {
  const organization = theOrganization();
  brandTheOrganization(organization, BURGUNDY, aLogo());
  const mine = await playwright.request.newContext();
  const me = await aResident(mine);
  const url = `${PORTAL_URL}/api/brand/${me.stayId}/logo`;

  // Without the version a page links it by: revalidated, never held for good.
  const bare = await mine.get(url);
  expect(bare.status()).toBe(200);
  expect(bare.headers()["content-type"]).toBe("image/png");
  expect(bare.headers()["x-content-type-options"]).toBe("nosniff");
  expect(bare.headers()["content-security-policy"]).toBe("default-src 'none'");
  expect(bare.headers()["cache-control"]).toBe("private, no-cache");
  const etag = bare.headers().etag!;
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/);

  // With it: private, and cached for as long as that logo is the logo.
  const versioned = await mine.get(`${url}?v=${etag.slice(1, -1)}`);
  expect(versioned.headers()["cache-control"]).toBe(
    "private, max-age=31536000, immutable",
  );
  expect(Buffer.from(await versioned.body()).equals(aLogo())).toBe(true);

  // And a matching tag is a 304 with nothing in it.
  const revalidated = await mine.get(url, {
    headers: { "if-none-match": etag },
  });
  expect(revalidated.status()).toBe(304);
  expect(await revalidated.body()).toHaveLength(0);
});

test("BR-S1-40: the Workspace's logo route answers 401 without a session and 404 to those who may not manage the brand", async ({
  baseURL,
  playwright,
}) => {
  const organization = theOrganization();
  brandTheOrganization(organization, BURGUNDY, aLogo());
  const url = `/api/branding/${organization}/logo`;
  const anonymous = await playwright.request.newContext({ baseURL: baseURL! });
  expect((await anonymous.get(url)).status()).toBe(401);

  const owner = await signedInWorkspace(playwright, baseURL!, OWNER_EMAIL);
  const answer = await owner.get(url);
  expect(answer.status()).toBe(200);
  expect(answer.headers()["content-type"]).toBe("image/png");
  expect(answer.headers()["cache-control"]).toBe("private, no-cache");
  expect(answer.headers()["x-content-type-options"]).toBe("nosniff");
  expect(answer.headers()["content-security-policy"]).toBe(
    "default-src 'none'",
  );
  expect((await owner.get("/api/branding/not-a-uuid/logo")).status()).toBe(404);
  expect(
    (
      await owner.get("/api/branding/00000000-0000-8000-8000-000000000000/logo")
    ).status(),
  ).toBe(404);

  // A Front desk member holds no permission over the brand.
  const desk = await signedInWorkspace(playwright, baseURL!, DESK_EMAIL);
  const refused = await desk.get(url);
  expect(refused.status()).toBe(404);
  expect(await refused.body()).toHaveLength(0);

  // And nobody manages it where the Subscription is suspended.
  const before = subscriptionStatus(organization);
  try {
    setSubscription(organization, "suspended");
    expect((await owner.get(url)).status()).toBe(404);
  } finally {
    setSubscription(organization, before);
  }
});

test("BR-S1-42: a logo of 600 KB and one of 2 MB are each told they are too large", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/branding?property=${testProperty()}`);

  for (const size of [600 * 1024, 2 * 1024 * 1024]) {
    await chooseLogo(page, png(320, 160, size));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("The file is larger than 512 KB."),
    ).toBeVisible();
  }
  // Told, and nothing saved.
  expect(
    psql(
      `select count(*) from public.organization_brand_logos
        where organization_id = '${theOrganization()}' and content is not null`,
    ),
  ).toBe("0");
});
