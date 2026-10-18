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
const NO_ACCESS_EMAIL = `e2e-integrations-none-${SUFFIX}@example.test`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();
const PROPERTY_WITHOUT_THE_MODULE = randomUUID();
const ENDPOINT_NAME = `Channel manager ${SUFFIX}`;

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-46");
const AUDIT_EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/ux-audit/RANZ-72",
);

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
  for (const email of [MANAGER_EMAIL, VIEWER_EMAIL, NO_ACCESS_EMAIL]) {
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
     ), bare as (
       insert into public.properties (id, organization_id, name)
       select '${PROPERTY_WITHOUT_THE_MODULE}', id, 'E2E Property without the module ${SUFFIX}' from org
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
            case person.email when '${MANAGER_EMAIL}' then 'owner'
                              when '${NO_ACCESS_EMAIL}' then 'housekeeping'
                              else 'integrations_viewer' end,
            case when person.email = '${VIEWER_EMAIL}'
                 then org.id else '00000000-0000-0000-0000-000000000000'::uuid end,
            'organization_wide'
       from org, public.users as person
      where person.email in ('${MANAGER_EMAIL}', '${VIEWER_EMAIL}', '${NO_ACCESS_EMAIL}')`,
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
    page.getByText("Nothing has failed at this Property."),
  ).toBeVisible();
  // And says what can be connected here, and what cannot yet: no fake providers.
  await expect(page.getByTestId("integrations-availability")).toContainText(
    "A webhook is the only integration available today. Channel managers, KBS reporting, e-invoicing and payment providers are not available yet.",
  );
  await page.screenshot({ path: path.join(AUDIT_EVIDENCE, "empty-state.png") });

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
    "Look in the receiver's logs for why it refused, then Retry.",
  );
  // What the receiver said is there for whoever runs it, behind a disclosure.
  await expect(
    failure.getByText("It said: upstream unavailable please wait"),
  ).toBeHidden();
  await failure.getByText("Technical details").click();
  await expect(
    failure.getByText("It said: upstream unavailable please wait"),
  ).toBeVisible();
  await expect(failure).toContainText("Retrying");
  await expect(failure.getByRole("cell", { name: /^1 Last / })).toBeVisible();
  await expect(card).toContainText("Failing");
  await expect(
    page.getByText(/A failed delivery is retried after 1 minute, 5 minutes/),
  ).toBeVisible();
  // The row's commands are on screen at a laptop's width, not past a scroll.
  await expect(
    failure.getByRole("button", { name: "Retry", exact: true }),
  ).toBeInViewport();
  await expect(
    failure.getByRole("button", { name: "Stop retrying" }),
  ).toBeInViewport();
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

test("INT-S1-48: Mark resolved asks for a reason, records who and why, and the delivery stays failed", async ({
  page,
}) => {
  received.length = 0;
  script.push({ status: 400, body: "bad shape" });

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
      .toBe("failed|1"),
  );

  // A 400 is not retried: the failure offers Mark resolved and not Stop retrying.
  await page.reload();
  const failure = page.getByTestId("failed-operation");
  await expect(failure).toHaveCount(1);
  await expect(failure).toContainText("Stopped");
  await expect(failure).toContainText("HTTP 400");
  await expect(
    failure.getByRole("button", { name: "Stop retrying" }),
  ).toHaveCount(0);
  await failure.getByRole("button", { name: "Mark resolved" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Mark resolved" }).click();
  await expect(
    dialog.getByText("Say why, in at least 3 characters."),
  ).toBeVisible();
  expect(
    psql(
      `select status from public.failed_operations where endpoint_id = '${endpointId()}' order by created_at desc limit 1`,
    ),
  ).toBe("failed");

  await dialog.getByLabel("Reason").fill("Re-sent by hand from their portal");
  await dialog.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("failed-operation")).toHaveCount(0);

  expect(
    psql(
      `select f.status || '|' || f.closed_reason || '|' || u.email || '|' || d.status
         from public.failed_operations f
         join public.users u on u.id = f.closed_by
         join public.webhook_deliveries d on d.id = f.delivery_id
        where f.endpoint_id = '${endpointId()}' order by f.updated_at desc limit 1`,
    ),
  ).toBe(`resolved|Re-sent by hand from their portal|${MANAGER_EMAIL}|failed`);
  expect(
    psql(
      `select count(*) from audit.records
        where organization_id = '${ORGANIZATION}'
          and action = 'failed_operation.resolved'
          and reason = 'Re-sent by hand from their portal'`,
    ),
  ).toBe("1");
});

test("INT-S1-71: Retry all asks first, sends every stopped delivery again, and the closed list says how each ended", async ({
  page,
}) => {
  received.length = 0;
  script.push({ status: 400, body: "bad shape" }, { status: 400 });

  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });

  for (let sent = 1; sent <= 2; sent += 1) {
    await card.getByRole("button", { name: "Send test event" }).click();
    await expect(card.getByText(/Test event queued/)).toBeVisible();
    const worker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
    await whileWorking(
      worker,
      expect
        .poll(
          () =>
            psql(
              `select count(*) from public.failed_operations
                where endpoint_id = '${endpointId()}' and status = 'failed'`,
            ),
          { timeout: WORKER_BUDGET_MS },
        )
        .toBe(String(sent)),
    );
    await page.reload();
  }

  await expect(page.getByTestId("failed-operation")).toHaveCount(2);
  await expect(page.getByTestId("failures-tab-open")).toHaveText("Open (2)");

  // At a phone's width each failure is a block of its own: its commands are in
  // reach and the page does not scroll sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const first = page.getByTestId("failed-operation").first();
  await first.scrollIntoViewIfNeeded();
  await expect(
    first.getByRole("button", { name: "Mark resolved" }),
  ).toBeInViewport();
  await expect(
    first.getByRole("button", { name: "Retry", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "the page scrolls sideways at 390 px",
  ).toBe(true);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(AUDIT_EVIDENCE, "phone-failures.png"),
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();

  // Asked first, and the consequence is named before the click.
  await page.getByTestId("retry-all").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Send every stopped delivery again?");
  await expect(dialog).toContainText("Each retry is recorded with your name.");
  await dialog.getByRole("button", { name: "Not now" }).click();
  expect(
    psql(
      `select count(*) from public.failed_operations
        where endpoint_id = '${endpointId()}' and status = 'retrying'`,
    ),
  ).toBe("0");

  await page.getByTestId("retry-all").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Retry all" })
    .click();
  await expect(
    page.getByText("2 stopped deliveries were sent again."),
  ).toBeVisible();
  expect(
    psql(
      `select count(*) from public.failed_operations
        where endpoint_id = '${endpointId()}' and status = 'retrying'`,
    ),
  ).toBe("2");
  expect(
    psql(
      `select count(*) from audit.records
        where organization_id = '${ORGANIZATION}' and action = 'failed_operation.retried'`,
    ),
    "one record for each delivery put back, including the one Retry did earlier",
  ).toBe("3");

  const worker = startWorker({ WEBHOOK_ALLOW_LOOPBACK_HTTP: "true" });
  await whileWorking(
    worker,
    expect
      .poll(
        () =>
          psql(
            `select count(*) from public.failed_operations
              where endpoint_id = '${endpointId()}' and status in ('failed', 'retrying')`,
          ),
        { timeout: WORKER_BUDGET_MS },
      )
      .toBe("0"),
  );

  // Nothing is open; the closed list says when, how and why, in words.
  await page.goto(SCREEN);
  await expect(page.getByTestId("failures-tab-open")).toHaveText("Open (0)");
  await expect(
    page.getByText("Nothing has failed at this Property."),
  ).toBeVisible();
  await page.getByTestId("failures-tab-closed").click();
  await expect(page).toHaveURL(/view=closed/);
  const rows = page.getByTestId("failed-operation");
  await expect(rows.filter({ hasText: "Cancelled · You" })).toContainText(
    "The receiver was switched off",
  );
  await expect(rows.filter({ hasText: "Resolved · You" })).toContainText(
    "Re-sent by hand from their portal",
  );
  await expect(
    rows.filter({ hasText: "Resolved · Automatic" }).first(),
  ).toContainText("It was delivered.");
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await page.screenshot({
    path: path.join(AUDIT_EVIDENCE, "closed-failures.png"),
  });
});

test("INT-S1-79: someone with no integrations permission is told so, and a Property without the module is told that instead", async ({
  page,
}) => {
  await signIn(page, NO_ACCESS_EMAIL);
  await page.goto(SCREEN);
  await expect(
    page.getByText("You do not have access to Integrations"),
  ).toBeVisible();
  await expect(
    page.getByText(/needs the integrations permission/),
  ).toBeVisible();
  await expect(
    page.getByText("This module is not in your Subscription"),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(AUDIT_EVIDENCE, "no-permission.png"),
  });

  await page.context().clearCookies();
  await signIn(page, MANAGER_EMAIL);
  await page.goto(`/en/integrations?property=${PROPERTY_WITHOUT_THE_MODULE}`);
  await expect(
    page.getByText("This module is not in your Subscription"),
  ).toBeVisible();
  await expect(
    page.getByText("You do not have access to Integrations"),
  ).toHaveCount(0);
});

test("INT-S1-67: someone who can only view reads an address without its query string, and the manager reads it whole", async ({
  page,
}) => {
  const token = `s3cret-${SUFFIX}`;
  psql(
    `update public.webhook_endpoints set url = '${receiverUrl}?token=${token}#top'
      where id = '${endpointId()}'`,
  );

  await signIn(page, VIEWER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await expect(card).toContainText(`${receiverUrl}?…`);
  await expect(card).toContainText("Part of this address is hidden from you.");
  expect(await page.content()).not.toContain(token);

  await page.context().clearCookies();
  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  await expect(card).toContainText(`${receiverUrl}?token=${token}#top`);
  await expect(card).not.toContainText("Part of this address is hidden");

  psql(
    `update public.webhook_endpoints set url = '${receiverUrl}' where id = '${endpointId()}'`,
  );
});

test("INT-S1-74: deliveries waiting too long are shown on their endpoint, because a stopped sender leaves no failure to show", async ({
  page,
}) => {
  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  const card = page.getByTestId("webhook-endpoint").filter({
    hasText: ENDPOINT_NAME,
  });
  await expect(card.getByTestId("endpoint-overdue")).toHaveCount(0);

  await card.getByRole("button", { name: "Send test event" }).click();
  await expect(card.getByText(/Test event queued/)).toBeVisible();
  psql(
    `update public.webhook_deliveries set next_attempt_at = now() - interval '7 minutes'
      where endpoint_id = '${endpointId()}' and status = 'pending'`,
  );
  await page.reload();
  await expect(card.getByTestId("endpoint-overdue")).toContainText(
    "1 delivery has waited more than 5 minutes to be sent.",
  );

  psql(
    `update public.webhook_deliveries set status = 'cancelled', next_attempt_at = null
      where endpoint_id = '${endpointId()}' and status = 'pending'`,
  );
  await page.reload();
  await expect(card.getByTestId("endpoint-overdue")).toHaveCount(0);
});

test("INT-S1-73: a long list of failures is a page at a time, with a way to the rest", async ({
  page,
}) => {
  psql(
    `with made as (
       insert into public.webhook_deliveries
         (organization_id, endpoint_id, property_id, event_id, event_type, body, status, attempts, last_failure, last_attempt_at)
       select '${ORGANIZATION}', '${endpointId()}', '${PROPERTY}', null, 'webhook.test', '{}'::jsonb,
              'failed', 1, 'timeout', now() - make_interval(mins => n)
         from generate_series(1, 27) as n
       returning id, property_id, endpoint_id, organization_id, last_attempt_at
     )
     insert into public.failed_operations
       (organization_id, property_id, endpoint_id, delivery_id, integration_name, operation, error, status, attempts, last_attempt_at)
     select organization_id, property_id, endpoint_id, id, 'Paged', 'webhook.test', 'timeout', 'failed', 1, last_attempt_at
       from made`,
  );

  await signIn(page, MANAGER_EMAIL);
  await page.goto(SCREEN);
  await expect(page.getByTestId("failures-tab-open")).toHaveText("Open (27)");
  await expect(page.getByTestId("failed-operation")).toHaveCount(25);
  await expect(page.getByText("1–25 of 27")).toBeVisible();
  await expect(page.getByRole("link", { name: "Newer" })).toHaveCount(0);

  await page.getByRole("link", { name: "Older" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByTestId("failed-operation")).toHaveCount(2);
  await expect(page.getByText("26–27 of 27")).toBeVisible();
  await expect(page.getByRole("link", { name: "Older" })).toHaveCount(0);

  // A page that no longer exists is the last one there is, not an empty list.
  await page.goto(`${SCREEN}&page=9`);
  await expect(page.getByTestId("failed-operation")).toHaveCount(2);

  psql(
    `update public.failed_operations
        set status = 'cancelled', next_attempt_at = null, closed_at = now(), closed_reason = 'test cleanup'
      where endpoint_id = '${endpointId()}' and integration_name = 'Paged'`,
  );
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
