import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = join(
  process.cwd(),
  "docs/features/leaders-theme-and-language/evidence",
);
mkdirSync(evidenceDir, { recursive: true });

async function run() {
  console.log("Launching Chromium for Leaders Beauty Verification...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const consoleMessages = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
    if (msg.type() === "error") {
      consoleMessages.push(msg.text());
    }
  });

  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("/sign-in/email")) {
      networkErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  console.log("1. Testing English Sign-in Desktop...");
  await page.goto("http://localhost:3000/en/sign-in", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: join(evidenceDir, "01-leaders-signin-en-desktop.png"),
    fullPage: false,
  });

  console.log("2. Testing Language Switcher Dropdown...");
  await page.click('button[aria-haspopup="menu"]');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(evidenceDir, "02-leaders-signin-switcher-dropdown.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  console.log("3. Testing Arabic Sign-in (RTL)...");
  await page.goto("http://localhost:3000/ar/sign-in", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: join(evidenceDir, "03-leaders-signin-ar-rtl.png"),
    fullPage: false,
  });

  console.log("4. Testing Turkish Sign-in...");
  await page.goto("http://localhost:3000/tr/sign-in", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: join(evidenceDir, "04-leaders-signin-tr.png"),
    fullPage: false,
  });

  console.log("5. Testing Mobile Viewport (390x844)...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/en/sign-in", {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: join(evidenceDir, "05-leaders-signin-mobile.png"),
    fullPage: false,
  });

  // Reset viewport to desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("6. Testing Auth Error State...");
  await page.goto("http://localhost:3000/en/sign-in", {
    waitUntil: "networkidle",
  });
  await page.fill('input[name="email"]', "wrong@example.com");
  await page.fill('input[name="password"]', "wrong-password");
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes("/api/auth/sign-in/email"),
  );
  await page.locator('button[type="submit"]').click();
  await responsePromise;
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(evidenceDir, "06-leaders-auth-validation-error.png"),
    fullPage: false,
  });

  console.log("7. Logging in with test credentials...");
  await page.goto("http://localhost:3000/en/sign-in", {
    waitUntil: "networkidle",
  });
  await page.getByLabel("Email").fill("deniz@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(
    () => window.location.pathname.includes("/today"),
    null,
    { timeout: 30000 },
  );
  await page.waitForSelector("#main-content");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: join(evidenceDir, "07-leaders-workspace-today.png"),
    fullPage: false,
  });

  console.log("8. Navigating to Arrivals...");
  await page.goto("http://localhost:3000/en/arrivals", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector("#main-content", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: join(evidenceDir, "08-leaders-workspace-arrivals.png"),
    fullPage: false,
  });

  console.log("9. Navigating to Arabic Workspace (RTL)...");
  await page.goto("http://localhost:3000/ar/today", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector("#main-content", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: join(evidenceDir, "09-leaders-workspace-arabic.png"),
    fullPage: false,
  });

  await browser.close();

  console.log("\n--- Verification Summary ---");
  console.log(`Console Errors: ${consoleMessages.length}`);
  if (consoleMessages.length > 0) {
    consoleMessages.forEach((err) => console.log(`  - ${err}`));
  }
  console.log(`Network Failures: ${networkErrors.length}`);
  if (networkErrors.length > 0) {
    networkErrors.forEach((err) => console.log(`  - ${err}`));
  }
  console.log("All evidence screenshots captured successfully!");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
