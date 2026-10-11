import { randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { expect } from "@playwright/test";

import { test } from "./hydration";
import { verifyDelivery } from "../../packages/ranza/integrations/src/signing";
import { PASSWORD, signIn } from "./front-desk";
import { psql } from "./local-database";
import { startWorker, WORKER_BUDGET_MS, whileWorking } from "./worker";

/**
 * Integrations, through the screen an Organization actually uses (RANZ-46,
 * ADR 0045): one external system is connected, and its failures are visible
 * without reading a log.
 *
 * The pgTAP suite proves who may touch which row and what the worker's
 * functions do, and the integration suite proves an event travelling from the
 * outbox to a receiver. This proves the part neither can see: that the form
 * posts what the server action wants, that the secret is on the screen once
 * and nowhere afterwards, that a test event sent from a button reaches a real
 * receiver signed and is shown as delivered, that a failure is on the screen
 * with what happened and when it is tried next, and that Retry and Stop
 * retrying do what they say.
 *
 * The receiver is a server in this file on 127.0.0.1. The product refuses an
 * http address, so the endpoint is registered through the form with an https
 * one and then pointed at the receiver by the table owner; the worker is
 * started with the test allowance for plain http to this machine, which its
 * composition root refuses to honour in production. Each run brings its own
 * Organization.
 *
 * The worker is a process of its own, built and run as a deployment runs it,
 * for as long as the one thing a test waits for takes and no longer: the same
 * process closes every Property's due business day once a minute, and a close
 * cannot be undone (see `worker.ts`).
 */
const SUFFIX = randomUUID().slice(0, 8);
const MANAGER_EMAIL = `e2e-integrations-${SUFFIX}@example.test`;
const VIEWER_EMAIL = `e2e-integrations-viewer-${SUFFIX}@example.test`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();
const ENDPOINT_NAME = `Channel manager ${SUFFIX}`;

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-46");

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

interface Reply {
  status: number;
  body?: string;
}

const received: Received[] = [];
const script: Reply[] = [];
let receiver: Server;
let receiverUrl: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright, baseURL }) => {
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const reply = script.shift() ?? { status: 200 };
      response.writeHead(reply.status, { "Content-Type": "text/plain" });
      response.end(reply.body ?? "");
    });
  });
  await new Promise<void>((resolve) => {
    receiver.listen(0, "127.0.0.1", () => {
      receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
      resolve();
    });
  });

  // Made the way `db:seed:dev` makes a Staff Member: through the application's
  // own sign-up route (ADR 0005), a context of its own for each person.
  for (const email of [MANAGER_EMAIL, VIEWER_EMAIL]) {
    const request = await playwright.request.newContext({ baseURL });
    const signedUp = await request.post("/api/auth/sign-up/email", {
      headers: { origin: new URL("/", baseURL).origin },
      data: { email, password: PASSWORD, name: email.split("@")[0] },
    });
    expect(signedUp.ok(), `could not sign up ${email}`).toBe(true);
    await request.get("/en/today");
    await request.dispose();
    expect(
      psql(`select count(*) from public.users where email = '${email}'`),
      "the workspace did not create a Ranza user",
    ).toBe("1");
  }

  psql(
    `with org as (
       insert into public.organizations (id, name, status)
       values ('${ORGANIZATION}', 'E2E Integrations ${SUFFIX}', 'active') returning id
     ), sub as (
       insert into public.subscriptions (organization_id, status)
       select id, 'active' from org
     ), ent as (
       insert into public.entitlements (organization_id, module_key, status)
       select id, 'platform_core', 'active' from org
     ), prop as (
       insert into public.properties (id, organization_id, name)
       select '${PROPERTY}', id, 'E2E Integrations Property ${SUFFIX}' from org returning id
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select '${PROPERTY}', id, 'integrations', true from org
     ), viewer_role as (
       insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       select id, 'integrations_viewer', id, 'Integrations viewer', array['integrations.view']
         from org
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select org.id, person.id,
            case person.email when '${MANAGER_EMAIL}' then 'owner' else 'integrations_viewer' end,
            case when person.email = '${MANAGER_EMAIL}'
                 then '00000000-0000-0000-0000-000000000000'::uuid else org.id end,
            'organization_wide'
       from org, public.users as person
      where person.email in ('${MANAGER_EMAIL}', '${VIEWER_EMAIL}')`,
  );
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
});

const SCREEN = `/en/integrations?property=${PROPERTY}`;

function endpointId(): string {
  return psql(
    `select id from public.webhook_endpoints
      where organization_id = '${ORGANIZATION}' and status = 'active'
      order by created_at desc limit 1`,
  );
}

function deliveryState(): string {
  return psql(
    `select status || '|' || attempts from public.webhook_deliveries
      where endpoint_id = '${endpointId()}' and event_type = 'webhook.test'
      order by created_at desc limit 1`,
  );
}

test("INT-S1-51: an Owner adds an endpoint, sees the secret once, sends a test event and sees it delivered", async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);

  // Nothing registered: the screen says what to do, and that nothing has failed.
  await expect(page.getByText("No webhook endpoint yet")).toBeVisible();
  await expect(
    page.getByText(
      "Nothing has failed. Every delivery has arrived or is on its way.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(ENDPOINT_NAME);

  // A page that is not https is refused with words, and nothing is written.
  await dialog.getByLabel("HTTPS address").fill("http://hooks.example.test/x");
  await dialog.getByRole("checkbox", { name: "A guest checks in" }).click();
  await dialog.getByRole("button", { name: "Add endpoint" }).click();
  await expect(
    dialog.getByText("The address must start with https://."),
  ).toBeVisible();
  expect(
    psql(
      `select count(*) from public.webhook_endpoints where organization_id = '${ORGANIZATION}'`,
    ),
  ).toBe("0");

  await dialog
    .getByLabel("HTTPS address")
    .fill(`https://hooks.example.test/ranza-${SUFFIX}`);
  await dialog.getByRole("checkbox", { name: "A booking is taken" }).click();
  await dialog.getByRole("button", { name: "Add endpoint" }).click();

  // The secret, once. The dialog cannot be dismissed from outside.
  const secretBox = dialog.getByTestId("webhook-secret");
  await expect(secretBox).toBeVisible();
  const secret = (await secretBox.textContent())!.trim();
  expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByText(/shown only once/)).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "secret-shown-once.png") });
  await page.keyboard.press("Escape");
  await expect(secretBox).toBeVisible();
  await dialog.getByRole("button", { name: "I have saved it" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // And nowhere afterwards: not on this page, not after a reload.
  await expect(page.getByText(ENDPOINT_NAME)).toBeVisible();
  await page.reload();
  expect(await page.content()).not.toContain(secret);
  expect(
    psql(
      `select secret from public.webhook_endpoint_secrets where endpoint_id = '${endpointId()}'`,
    ),
    "the secret the screen showed is the one the signature will use",
  ).toBe(secret);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await expect(card).toContainText("No delivery yet");
  await expect(card).toContainText("A guest checks in");
  await expect(card).toContainText("A booking is taken");

  // The product refuses an http address; the owner of the table points the
  // endpoint at the receiver, which is what the worker's test allowance is for.
  psql(
    `update public.webhook_endpoints set url = '${receiverUrl}' where id = '${endpointId()}'`,
  );

  await card.getByRole("button", { name: "Send test event" }).click();
  await expect(card.getByText(/Test event queued/)).toBeVisible();
  expect(deliveryState()).toBe("pending|0");

  // One at a time.
  await card.getByRole("button", { name: "Send test event" }).click();
  await expect(
    card.getByText("A test event is already on its way to this endpoint."),
  ).toBeVisible();

  const worker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
  await whileWorking(
    worker,
    expect
      .poll(() => deliveryState(), { timeout: WORKER_BUDGET_MS })
      .toBe("delivered|1"),
  );

  expect(received).toHaveLength(1);
  const [request] = received;
  expect(request!.headers["x-ranza-event"]).toBe("webhook.test");
  expect(
    verifyDelivery(
      secret,
      String(request!.headers["x-ranza-timestamp"]),
      request!.body,
      String(request!.headers["x-ranza-signature"]),
    ),
    "the signature verifies with the secret the screen showed",
  ).toBe(true);
  expect(JSON.parse(request!.body)).toMatchObject({
    type: "webhook.test",
    organizationId: ORGANIZATION,
    propertyId: PROPERTY,
  });

  await page.reload();
  await expect(card).toContainText("Delivering");
  await expect(card).not.toContainText("Nothing delivered yet");
  await expect(card.getByText("No delivery yet")).toHaveCount(0);
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(EVIDENCE, "endpoint-delivering.png"),
  });
});

test("INT-S1-08: a failing endpoint is on the screen with what happened and when it is tried next, and Retry delivers it", async ({
  page,
}) => {
  received.length = 0;
  script.push({ status: 503, body: "upstream unavailable\nplease wait" });

  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await card.getByRole("button", { name: "Send test event" }).click();
  await expect(card.getByText(/Test event queued/)).toBeVisible();

  const worker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
  await whileWorking(
    worker,
    expect
      .poll(() => deliveryState(), { timeout: WORKER_BUDGET_MS })
      .toBe("retrying|1"),
  );

  // Nobody read a log: the screen says it all.
  await page.reload();
  const failure = page.getByTestId("failed-operation");
  await expect(failure).toHaveCount(1);
  await expect(failure).toContainText(ENDPOINT_NAME);
  await expect(failure).toContainText("The receiver answered with an error");
  await expect(failure).toContainText("HTTP 503");
  await expect(failure).toContainText(
    "It said: upstream unavailable please wait",
  );
  await expect(failure).toContainText("Retrying");
  await expect(failure.getByRole("cell", { name: /^1 Last / })).toBeVisible();
  await expect(card).toContainText("Failing");
  await expect(
    page.getByText(/A failed delivery is retried after 1 minute, 5 minutes/),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "failure-visible.png") });

  // Retry puts it back in the queue, due now. It resolves nothing by itself.
  await failure.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(failure.getByText("Due now")).toBeVisible();
  expect(deliveryState()).toBe("retrying|1");
  expect(
    psql(
      `select status from public.failed_operations where endpoint_id = '${endpointId()}'`,
    ),
  ).toBe("retrying");

  const retryWorker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
  await whileWorking(
    retryWorker,
    expect
      .poll(() => deliveryState(), { timeout: WORKER_BUDGET_MS })
      .toBe("delivered|2"),
  );
  expect(received).toHaveLength(2);
  expect(received[1]!.headers["x-ranza-attempt"]).toBe("2");
  expect(received[1]!.headers["idempotency-key"]).toBe(
    received[0]!.headers["idempotency-key"],
  );

  // Only now is the failure resolved, and the screen says nothing has failed.
  await page.reload();
  await expect(page.getByTestId("failed-operation")).toHaveCount(0);
  await expect(card).toContainText("Delivering");
  expect(
    psql(
      `select status || '|' || coalesce(closed_reason, '') from public.failed_operations
        where endpoint_id = '${endpointId()}'`,
    ),
  ).toBe("resolved|delivered");
});

test("INT-S1-45: Stop retrying asks for a reason and records who stopped it", async ({
  page,
}) => {
  received.length = 0;
  script.push({ status: 500 });

  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await card.getByRole("button", { name: "Send test event" }).click();
  await expect(card.getByText(/Test event queued/)).toBeVisible();

  const worker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
  await whileWorking(
    worker,
    expect
      .poll(() => deliveryState(), { timeout: WORKER_BUDGET_MS })
      .toBe("retrying|1"),
  );

  await page.reload();
  const failure = page.getByTestId("failed-operation");
  await expect(failure).toHaveCount(1);
  await failure.getByRole("button", { name: "Stop retrying" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Stop retrying" }).click();
  await expect(
    dialog.getByText("Say why, in at least 3 characters."),
  ).toBeVisible();
  expect(deliveryState()).toBe("retrying|1");

  await dialog.getByLabel("Reason").fill("The receiver was switched off");
  await page.screenshot({
    path: path.join(EVIDENCE, "stop-retrying-reason.png"),
  });
  await dialog.getByRole("button", { name: "Stop retrying" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("failed-operation")).toHaveCount(0);

  expect(deliveryState()).toBe("cancelled|1");
  expect(
    psql(
      `select f.status || '|' || f.closed_reason || '|' || u.email
         from public.failed_operations f join public.users u on u.id = f.closed_by
        where f.endpoint_id = '${endpointId()}' order by f.updated_at desc limit 1`,
    ),
  ).toBe(`cancelled|The receiver was switched off|${MANAGER_EMAIL}`);
  expect(
    psql(
      `select count(*) from audit.records
        where organization_id = '${ORGANIZATION}'
          and action = 'failed_operation.cancelled'
          and reason = 'The receiver was switched off'`,
    ),
  ).toBe("1");
});

test("INT-S1-07: someone who may only view sees the endpoints and the failures and no command", async ({
  page,
}) => {
  await signIn(page, VIEWER_EMAIL);
  await page.goto(SCREEN);

  await expect(page.getByTestId("webhook-endpoint")).toHaveCount(1);
  await expect(
    page.getByText(/Adding, testing and removing them needs/),
  ).toBeVisible();
  for (const name of [
    "Add endpoint",
    "Send test event",
    "Remove",
    "Retry",
    "Stop retrying",
    "Mark resolved",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
});

test("INT-S1-15: the screen has a Back button to Today that keeps the Property", async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);

  const back = page.getByRole("link", { name: "Back" });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute(
    "href",
    new RegExp(`^/en/today\\?property=${PROPERTY}$`),
  );
  await back.click();
  await expect(page).toHaveURL(new RegExp(`/en/today\\?property=${PROPERTY}$`));
});

test("INT-S1-14: the screen reads in Arabic, mirrored, and in Turkish", async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);

  await page.goto(`/ar/integrations?property=${PROPERTY}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("نقاط استقبال الويب هوك")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "إرسال حدث اختبار" }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, "arabic.png") });

  await page.goto(`/tr/integrations?property=${PROPERTY}`);
  await expect(page.getByText("Webhook uç noktaları")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deneme olayı gönder" }),
  ).toBeVisible();
});

test("INT-S1-50: removing an endpoint asks first, and the endpoint stops being listed", async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await card.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog")).toContainText("Remove this endpoint?");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Remove" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove endpoint" })
    .click();
  await expect(page.getByTestId("webhook-endpoint")).toHaveCount(0);
  await expect(page.getByText("No webhook endpoint yet")).toBeVisible();

  expect(
    psql(
      `select status || '|' || (select count(*) from public.webhook_endpoint_secrets
                                 where endpoint_id = e.id)
         from public.webhook_endpoints e where e.organization_id = '${ORGANIZATION}'`,
    ),
  ).toBe("removed|0");
});
