// Real audit history: invites colleagues through the People screen's own dialog.
import { chromium } from "@playwright/test";
const BASE = process.env.BASE;
const RUN = Date.now().toString(36);
const N = Number(process.env.N ?? 24);
const browser = await chromium.launch();
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 1000 } })
).newPage();
page.setDefaultTimeout(60_000);
await page.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: {
    email: "deniz@example.test",
    password: "correct-horse-battery-staple",
  },
  headers: { origin: BASE },
});
await page.goto(`${BASE}/en/people`, { waitUntil: "networkidle" });
let done = 0;
for (let i = 1; i <= N; i++) {
  if (i > 1) await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { exact: true, name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Email")
    .fill(`evidence-${RUN}-${String(i).padStart(2, "0")}@example.test`);
  await dialog.getByRole("button", { name: "Create the invitation" }).click();
  try {
    await dialog.getByTestId("invitation-token").waitFor({ timeout: 30_000 });
  } catch (error) {
    console.log(
      `invite ${i} failed; dialog says: ${(await dialog.innerText()).replace(/\s+/g, " ")}`,
    );
    throw error;
  }
  done++;
}
console.log(`invited ${done}`);
await browser.close();
