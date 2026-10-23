/**
 * An Organization's webhook, end to end (RANZ-46, ADR 0045).
 *
 * The pgTAP suite proves who may touch which row and what the worker's
 * functions do. This proves the path an event takes: a Staff Member registers
 * an endpoint as `ranza_app`, a fact is published to the outbox, the real
 * dispatcher running as `ranza_worker` queues it through the real handler, and
 * the real delivery pass signs it and sends it to a receiver started in this
 * file. The receiver is plain http on 127.0.0.1, which the delivery pass is
 * told to allow and which nothing else is; a second pass without the
 * allowance proves it is refused.
 *
 * An endpoint cannot be registered with an http address, so each is registered
 * with a placeholder https one and then pointed at the receiver by the table
 * owner. That is the only thing done outside the product, and it is what the
 * tests' own allowance exists for.
 *
 * What a webhook carries is built from the reservation an event names, so each
 * event published here names a real one, and the ones that are forged are
 * forged on purpose.
 *
 * Each claim was checked by breaking it: sending without the signature header,
 * dropping the `Idempotency-Key`, treating a redirect as a success, queueing
 * the same event twice, and letting the strict pass connect to a private
 * address.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  createIntegrationsModule,
  createWebhookDelivery,
  EndpointInputError,
  IntegrationsRefusedError,
  verifyDelivery,
  WEBHOOK_EVENT_TYPES,
  type DeliveryReport,
} from "../../packages/ranza/integrations/src";
import {
  createOutboxDispatcher,
  publishWithin,
  type OutboxWriteClient,
} from "../../packages/platform/outbox/src";
import { subscriptions } from "../../apps/worker/src/outbox/subscriptions";
import { latestRecord } from "./audit-record";

const ORG = randomUUID();
const PROPERTY = randomUUID();
const MANAGER = randomUUID();
const HOUSEKEEPER = randomUUID();
const VIEWER = randomUUID();
const GUEST = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const workerDb = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const integrations = createIntegrationsModule({ db: prisma });
const dispatcher = createOutboxDispatcher({ db: workerDb });
const delivery = createWebhookDelivery({
  db: workerDb,
  allowLoopbackHttp: true,
});
const strictDelivery = createWebhookDelivery({ db: workerDb });

const DATABASE_BUDGET_MS = 60_000;

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
  path: string;
}

/** What the receiver does with the next request it is sent. */
interface Reply {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  /** The receiver does not answer until this settles. */
  hold?: Promise<void>;
}

const received: Received[] = [];
const script: Reply[] = [];
let inFlight = 0;
let mostInFlight = 0;
let receiver: Server;
let receiverOrigin: string;

function startReceiver(): Promise<void> {
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        path: request.url ?? "",
      });
      const reply = script.shift() ?? { status: 200 };
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      void (reply.hold ?? Promise.resolve()).then(() => {
        inFlight -= 1;
        response.writeHead(reply.status, reply.headers);
        response.end(reply.body ?? "");
      });
    });
  });
  return new Promise((resolve) => {
    receiver.listen(0, "127.0.0.1", () => {
      const { port } = receiver.address() as AddressInfo;
      receiverOrigin = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function seed(): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1, $2), ($3, $4), ($5, $6)
     on conflict (id) do nothing`,
    MANAGER,
    `webhook-manager-${Date.now()}@ranza.test`,
    HOUSEKEEPER,
    `webhook-housekeeper-${Date.now()}@ranza.test`,
    VIEWER,
    `webhook-viewer-${Date.now()}@ranza.test`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Webhook Integration Organization', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone, currency) values
       ($1, $2, 'Webhook Grand Hotel', 'Europe/Istanbul', 'TRY')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1, 'active')
     on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1, 'platform_core', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values ($1, $2, 'integrations', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       values ($1, 'webhook_viewer', $1, 'Webhook viewer', array['integrations.view'])
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1, $2, 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $3, 'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
       ($1, $4, 'webhook_viewer', $1, 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MANAGER,
    HOUSEKEEPER,
    VIEWER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name) values ($1, $2, 'Webhook Guest')
     on conflict (id) do nothing`,
    GUEST,
    ORG,
  );
}

/** Registers an endpoint and points it at the receiver, which the product itself would refuse. */
async function endpointToReceiver(
  name: string,
  eventTypes: readonly string[] = ["reservation.created"],
  path = "/hook",
): Promise<{ endpointId: string; secret: string }> {
  const registered = await integrations.registerEndpoint(MANAGER, {
    organizationId: ORG,
    name,
    url: `https://hooks.example.test/${randomUUID()}`,
    eventTypes,
  });
  await owner.$executeRawUnsafe(
    `update public.webhook_endpoints set url = $2 where id = $1::uuid`,
    registered.endpointId,
    `${receiverOrigin}${path}`,
  );
  return registered;
}

interface BookedReservation {
  reservationId: string;
  unitId: string;
}

/** A reservation on a unit of its own, laid down by the owner as the Reservations module would have. */
async function bookReservation(
  status = "confirmed",
): Promise<BookedReservation> {
  const reservationId = randomUUID();
  const unitId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2)`,
    unitId,
    PROPERTY,
    ORG,
    `WH-${unitId.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'guest', $6,
             app.property_today($3::uuid), app.property_today($3::uuid) + 2)`,
    reservationId,
    ORG,
    PROPERTY,
    unitId,
    GUEST,
    status,
  );
  return { reservationId, unitId };
}

/** Publishes an event with exactly the payload given: any member of the Organization can. */
async function publishEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<string> {
  return withOrganizationContext(prisma, { userId: MANAGER }, async (tx) => {
    const { eventId } = await publishWithin(
      tx as unknown as OutboxWriteClient,
      { organizationId: ORG, eventType, payload },
    );
    return eventId;
  });
}

/** Publishes a reservation fact the way the Reservations module does, in a transaction of its own. */
async function publishReservation(): Promise<string> {
  const { reservationId, unitId } = await bookReservation();
  return publishEvent("reservation.created", {
    reservationId,
    guestId: GUEST,
    propertyId: PROPERTY,
    accommodationUnitId: unitId,
    description: "Mr Example asked for a quiet room",
  });
}

async function drainOutbox(): Promise<void> {
  for (let pass = 0; pass < 50; pass += 1) {
    const report = await dispatcher.dispatch(subscriptions);
    if (report.claimed === 0) return;
  }
  throw new Error("the outbox still had work after 50 passes");
}

async function makeDue(endpointId: string): Promise<void> {
  await owner.$executeRawUnsafe(
    `update public.webhook_deliveries
        set next_attempt_at = now(), claimed_until = null, lease_id = null
      where endpoint_id = $1::uuid and status in ('pending', 'retrying')`,
    endpointId,
  );
}

async function deliveryOf(endpointId: string, eventId: string) {
  const [row] = await owner.$queryRawUnsafe<
    {
      id: string;
      status: string;
      attempts: number;
      lastStatusCode: number | null;
      lastFailure: string | null;
    }[]
  >(
    `select id, status, attempts, last_status_code as "lastStatusCode",
            last_failure as "lastFailure"
       from public.webhook_deliveries
      where endpoint_id = $1::uuid and event_id = $2::uuid`,
    endpointId,
    eventId,
  );
  return row;
}

/** Runs delivery passes until nothing is due, so one test does not leave work for the next. */
async function settle(runner = delivery): Promise<DeliveryReport[]> {
  const reports: DeliveryReport[] = [];
  for (let pass = 0; pass < 10; pass += 1) {
    const report = await runner.processDueDeliveries();
    reports.push(report);
    if (report.due === 0) break;
  }
  return reports;
}

/** The failures at the Property that are still being asked about, as the screen's first page. */
async function openFailures() {
  const { records } = await integrations.failedOperations(MANAGER, PROPERTY, {
    view: "open",
    limit: 100,
    offset: 0,
  });
  return records;
}

function requestsTo(path: string): Received[] {
  return received.filter((request) => request.path === path);
}

/** A promise that settles when `release` is called, for a receiver that is slow to answer. */
function gate(): { held: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let waited = 0; waited < 10_000; waited += 20) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`still waiting for ${what}`);
}

beforeAll(async () => {
  await startReceiver();
  await seed();
}, DATABASE_BUDGET_MS);

beforeEach(() => {
  received.length = 0;
  script.length = 0;
  inFlight = 0;
  mostInFlight = 0;
});

/**
 * An Organization registers ten endpoints at most, and each test registers its
 * own. What a test leaves open is closed by the owner, the way a person would
 * with the product, so the next test starts with nothing due.
 */
afterEach(async () => {
  await owner.$executeRawUnsafe(
    `update public.failed_operations
        set status = 'cancelled', next_attempt_at = null,
            closed_at = now(), closed_reason = 'test cleanup'
      where organization_id = $1::uuid and status in ('failed', 'retrying')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `update public.webhook_deliveries
        set status = 'cancelled', next_attempt_at = null, claimed_until = null, lease_id = null
      where organization_id = $1::uuid and status in ('pending', 'retrying')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `delete from public.webhook_endpoint_secrets
      where endpoint_id in (select id from public.webhook_endpoints
                             where organization_id = $1::uuid and status = 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `update public.webhook_endpoints
        set status = 'removed', removed_at = now()
      where organization_id = $1::uuid and status = 'active'`,
    ORG,
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
  await prisma.$disconnect();
  await workerDb.$disconnect();
  await owner.$disconnect();
});

describe("registering an endpoint", () => {
  it("INT-S1-51: the secret is returned once and nothing the application role can read holds it", async () => {
    const registered = await integrations.registerEndpoint(MANAGER, {
      organizationId: ORG,
      name: "Channel manager",
      url: "https://hooks.example.test/channel-manager",
      eventTypes: ["reservation.created", "stay.checked_in"],
    });
    expect(registered.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);

    const view = await integrations.endpoints(MANAGER, ORG);
    const listed = view.endpoints.find(
      (endpoint) => endpoint.id === registered.endpointId,
    );
    expect(listed).toMatchObject({
      name: "Channel manager",
      url: "https://hooks.example.test/channel-manager",
      health: "unused",
      queued: 0,
      openFailures: 0,
    });
    expect(view.mayManage).toBe(true);
    expect(JSON.stringify(view)).not.toContain(registered.secret);

    await expect(
      withOrganizationContext(prisma, { userId: MANAGER }, (tx) =>
        (tx as unknown as typeof prisma).$queryRawUnsafe(
          "select secret from public.webhook_endpoint_secrets",
        ),
      ),
    ).rejects.toThrow(/permission denied|42501/);

    const [stored] = await owner.$queryRawUnsafe<{ secret: string }[]>(
      "select secret from public.webhook_endpoint_secrets where endpoint_id = $1::uuid",
      registered.endpointId,
    );
    expect(stored?.secret).toBe(registered.secret);
  });

  it("INT-S1-52: registering is audited with who, where and which events, and never the secret", async () => {
    const registered = await integrations.registerEndpoint(MANAGER, {
      organizationId: ORG,
      name: "Audited",
      url: "https://hooks.example.test/audited",
      eventTypes: ["stay.checked_out"],
    });
    const record = await latestRecord(
      owner,
      "webhook_endpoint.registered",
      registered.endpointId,
    );
    expect(record?.context).toEqual({
      host: "hooks.example.test",
      eventTypes: ["stay.checked_out"],
    });
    expect(JSON.stringify(record)).not.toContain(registered.secret);
  });

  it("INT-S1-18: an address the worker could never send to is refused before anything is written", async () => {
    const attempt = (url: string) =>
      integrations.registerEndpoint(MANAGER, {
        organizationId: ORG,
        name: "Refused",
        url,
        eventTypes: ["stay.checked_in"],
      });

    const rejection = async (url: string) => {
      const error = await attempt(url).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(EndpointInputError);
      return (error as EndpointInputError).rejection;
    };

    expect(await rejection("http://hooks.example.test/plain")).toEqual({
      field: "url",
      reason: "not_https",
    });
    expect(await rejection("https://user:pw@hooks.example.test/x")).toEqual({
      field: "url",
      reason: "has_credentials",
    });
    expect(await rejection("https://localhost/x")).toEqual({
      field: "url",
      reason: "blocked_host",
    });
    expect(await rejection("https://169.254.169.254/latest/meta-data")).toEqual(
      {
        field: "url",
        reason: "blocked_host",
      },
    );
    expect(await rejection("https://10.1.2.3/x")).toEqual({
      field: "url",
      reason: "blocked_host",
    });
    expect(await rejection("https://[::1]/x")).toEqual({
      field: "url",
      reason: "blocked_host",
    });
    expect(await rejection("https://service.internal/x")).toEqual({
      field: "url",
      reason: "blocked_host",
    });
    expect(await rejection("not a url")).toEqual({
      field: "url",
      reason: "invalid",
    });
  });

  it("INT-S1-19: an event nobody can subscribe to, or none at all, is refused", async () => {
    const withEvents = (eventTypes: string[]) =>
      integrations.registerEndpoint(MANAGER, {
        organizationId: ORG,
        name: "Events",
        url: "https://hooks.example.test/events",
        eventTypes,
      });
    await expect(withEvents([])).rejects.toMatchObject({
      rejection: { field: "events", reason: "none" },
    });
    await expect(withEvents(["staff.reach_changed"])).rejects.toMatchObject({
      rejection: { field: "events", reason: "unknown" },
    });
  });

  it("INT-S1-17: one address is registered once, and a Staff Member without integrations.manage is refused", async () => {
    const url = `https://hooks.example.test/${randomUUID()}`;
    await integrations.registerEndpoint(MANAGER, {
      organizationId: ORG,
      name: "First",
      url,
      eventTypes: ["stay.checked_in"],
    });
    await expect(
      integrations.registerEndpoint(MANAGER, {
        organizationId: ORG,
        name: "Second",
        url,
        eventTypes: ["stay.checked_in"],
      }),
    ).rejects.toMatchObject({ reason: "duplicate_url" });

    await expect(
      integrations.registerEndpoint(HOUSEKEEPER, {
        organizationId: ORG,
        name: "Not allowed",
        url: `https://hooks.example.test/${randomUUID()}`,
        eventTypes: ["stay.checked_in"],
      }),
    ).rejects.toBeInstanceOf(IntegrationsRefusedError);

    const view = await integrations.endpoints(HOUSEKEEPER, ORG);
    expect(view).toEqual({ endpoints: [], mayManage: false });
  });
});

describe("delivering an event", () => {
  it("INT-S1-53: a published event reaches the endpoint signed, with its ids and none of its free text", async () => {
    const { endpointId, secret } = await endpointToReceiver(
      "Signed",
      ["reservation.created"],
      "/signed",
    );
    const eventId = await publishReservation();
    await drainOutbox();

    const [report] = await settle();
    expect(report?.outcomes.map((outcome) => outcome.status)).toContain(
      "delivered",
    );

    const [request] = requestsTo("/signed");
    expect(request).toBeDefined();
    const timestamp = String(request!.headers["x-ranza-timestamp"]);
    expect(
      verifyDelivery(
        secret,
        timestamp,
        request!.body,
        String(request!.headers["x-ranza-signature"]),
      ),
    ).toBe(true);
    expect(
      verifyDelivery(
        `${secret}x`,
        timestamp,
        request!.body,
        String(request!.headers["x-ranza-signature"]),
      ),
    ).toBe(false);
    expect(
      verifyDelivery(
        secret,
        timestamp,
        `${request!.body} `,
        String(request!.headers["x-ranza-signature"]),
      ),
    ).toBe(false);

    expect(request!.headers["idempotency-key"]).toBe(eventId);
    expect(request!.headers["x-ranza-event-id"]).toBe(eventId);
    expect(request!.headers["x-ranza-event"]).toBe("reservation.created");
    expect(request!.headers["x-ranza-attempt"]).toBe("1");
    expect(request!.headers["content-type"]).toBe("application/json");
    expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(60);

    const body = JSON.parse(request!.body) as {
      id: string;
      type: string;
      organizationId: string;
      propertyId: string;
      data: Record<string, unknown>;
    };
    expect(body).toMatchObject({
      id: eventId,
      type: "reservation.created",
      organizationId: ORG,
      propertyId: PROPERTY,
    });
    expect(Object.keys(body.data).sort()).toEqual([
      "accommodationUnitId",
      "propertyId",
      "reservationId",
    ]);
    expect(request!.body).not.toContain("quiet room");
    expect(request!.body).not.toContain("guestId");

    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "delivered",
      attempts: 1,
      lastStatusCode: 200,
    });
    const view = await integrations.endpoints(MANAGER, ORG);
    expect(
      view.endpoints.find((endpoint) => endpoint.id === endpointId),
    ).toMatchObject({ health: "delivering", queued: 0, openFailures: 0 });
  });

  it("INT-S1-25: the same event is never delivered twice to the same endpoint", async () => {
    const { endpointId } = await endpointToReceiver(
      "Once",
      ["reservation.created"],
      "/once",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    await settle();
    expect(requestsTo("/once")).toHaveLength(1);

    // The handler runs again for the same event, as it does after a crash
    // between "queued" and "marked delivered".
    await workerDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "select app.set_worker_context($1::uuid, 'integrations.test')",
        ORG,
      );
      const [again] = await tx.$queryRawUnsafe<{ queued: number }[]>(
        "select queued_count as queued from app.enqueue_webhook_deliveries($1::uuid)",
        eventId,
      );
      expect(again?.queued).toBe(0);
    });
    await settle();
    expect(requestsTo("/once")).toHaveLength(1);
    const [count] = await owner.$queryRawUnsafe<{ count: number }[]>(
      "select count(*)::int as count from public.webhook_deliveries where endpoint_id = $1::uuid",
      endpointId,
    );
    expect(count?.count).toBe(1);
  });

  it("INT-S1-33: a 503 is retried on the schedule and the failure is shown with its next attempt, then clears when it arrives", async () => {
    const { endpointId } = await endpointToReceiver(
      "Flaky",
      ["reservation.created"],
      "/flaky",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    script.push({ status: 503, body: "upstream\nunavailable" });
    await settle();

    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "retrying",
      attempts: 1,
      lastStatusCode: 503,
      lastFailure: "http_error",
    });
    const failures = await openFailures();
    const failure = failures.find((item) => item.endpointId === endpointId);
    expect(failure).toMatchObject({
      status: "retrying",
      attempts: 1,
      error: "http_error",
      lastStatusCode: 503,
      lastResponseExcerpt: "upstream unavailable",
      endpointName: "Flaky",
      operation: "reservation.created",
    });
    const retryIn = failure!.nextAttemptAt!.getTime() - Date.now();
    expect(retryIn).toBeGreaterThan(40_000);
    expect(retryIn).toBeLessThan(70_000);

    // Nothing is sent before it is due.
    await settle();
    expect(requestsTo("/flaky")).toHaveLength(1);

    await makeDue(endpointId);
    await settle();
    expect(requestsTo("/flaky")).toHaveLength(2);
    expect(requestsTo("/flaky")[1]!.headers["x-ranza-attempt"]).toBe("2");
    expect(requestsTo("/flaky")[1]!.headers["idempotency-key"]).toBe(eventId);
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "delivered",
      attempts: 2,
    });
    const after = await openFailures();
    expect(
      after.find((item) => item.endpointId === endpointId),
    ).toBeUndefined();
  });

  it("INT-S1-38: a 400 is permanent, is not retried, and Retry sends it again as attempt two", async () => {
    const { endpointId } = await endpointToReceiver(
      "Strict receiver",
      ["reservation.created"],
      "/strict",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    script.push({ status: 400, body: "bad shape" });
    await settle();

    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastStatusCode: 400,
    });
    await makeDue(endpointId);
    await settle();
    expect(requestsTo("/strict")).toHaveLength(1);

    const [failure] = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );
    expect(failure).toMatchObject({ status: "failed", nextAttemptAt: null });

    await integrations.retryOperation(MANAGER, { operationId: failure!.id });
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "retrying",
      attempts: 1,
    });
    // Retry resolved nothing: the failure stands until a delivery arrives.
    expect(
      (await openFailures()).filter((item) => item.endpointId === endpointId),
    ).toHaveLength(1);

    script.push({ status: 200 });
    await settle();
    expect(requestsTo("/strict")).toHaveLength(2);
    expect(requestsTo("/strict")[1]!.headers["x-ranza-attempt"]).toBe("2");
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "delivered",
      attempts: 2,
    });
    expect(
      (await openFailures()).filter((item) => item.endpointId === endpointId),
    ).toEqual([]);
    const record = await latestRecord(
      owner,
      "failed_operation.retried",
      failure!.id,
    );
    expect(record?.locationId).toBe(PROPERTY);
  });

  it("INT-S1-09: a retry that fails again counts the attempt and keeps the failure", async () => {
    const { endpointId } = await endpointToReceiver(
      "Still down",
      ["reservation.created"],
      "/down",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    script.push({ status: 404 });
    await settle();
    const [failure] = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );

    await integrations.retryOperation(MANAGER, { operationId: failure!.id });
    script.push({ status: 404 });
    await settle();

    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "failed",
      attempts: 2,
    });
    const [after] = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );
    expect(after).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("INT-S1-45: Cancel and Resolve record who and why, and refuse a reason that says nothing", async () => {
    const { endpointId } = await endpointToReceiver(
      "Closing",
      ["reservation.created"],
      "/closing",
    );
    await publishReservation();
    await publishReservation();
    await drainOutbox();
    script.push({ status: 503 }, { status: 400 });
    await settle();
    const failures = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );
    const retrying = failures.find((item) => item.status === "retrying")!;
    const failed = failures.find((item) => item.status === "failed")!;

    await expect(
      integrations.cancelOperation(MANAGER, {
        operationId: retrying.id,
        reason: "no",
      }),
    ).rejects.toMatchObject({ reason: "reason_too_short" });

    await integrations.cancelOperation(MANAGER, {
      operationId: retrying.id,
      reason: "The receiver was switched off for good",
    });
    await integrations.resolveOperation(MANAGER, {
      operationId: failed.id,
      reason: "Re-sent by hand from their portal",
    });

    const cancelled = await latestRecord(
      owner,
      "failed_operation.cancelled",
      retrying.id,
    );
    expect(cancelled).toMatchObject({
      locationId: PROPERTY,
      reason: "The receiver was switched off for good",
    });
    const resolved = await latestRecord(
      owner,
      "failed_operation.resolved",
      failed.id,
    );
    expect(resolved?.reason).toBe("Re-sent by hand from their portal");

    const [row] = await owner.$queryRawUnsafe<
      { status: string; closedBy: string; closedReason: string }[]
    >(
      `select status, closed_by as "closedBy", closed_reason as "closedReason"
         from public.failed_operations where id = $1::uuid`,
      retrying.id,
    );
    expect(row).toEqual({
      status: "cancelled",
      closedBy: MANAGER,
      closedReason: "The receiver was switched off for good",
    });
    await expect(
      integrations.cancelOperation(MANAGER, {
        operationId: failed.id,
        reason: "Not retrying any more",
      }),
    ).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("INT-S1-41: Send test event delivers a signed webhook.test, once at a time, and shows it was delivered", async () => {
    const { endpointId, secret } = await endpointToReceiver(
      "Tested",
      ["stay.checked_in"],
      "/test",
    );
    await integrations.sendTestEvent(MANAGER, {
      endpointId,
      propertyId: PROPERTY,
    });
    await expect(
      integrations.sendTestEvent(MANAGER, { endpointId, propertyId: PROPERTY }),
    ).rejects.toMatchObject({ reason: "test_in_flight" });
    await settle();

    const [request] = requestsTo("/test");
    expect(request).toBeDefined();
    expect(request!.headers["x-ranza-event"]).toBe("webhook.test");
    expect(
      verifyDelivery(
        secret,
        String(request!.headers["x-ranza-timestamp"]),
        request!.body,
        String(request!.headers["x-ranza-signature"]),
      ),
    ).toBe(true);
    expect(JSON.parse(request!.body)).toMatchObject({
      type: "webhook.test",
      organizationId: ORG,
      propertyId: PROPERTY,
      data: {},
    });
    expect(request!.headers["idempotency-key"]).toBe(
      request!.headers["x-ranza-delivery"],
    );

    const view = await integrations.endpoints(MANAGER, ORG);
    const listed = view.endpoints.find(
      (endpoint) => endpoint.id === endpointId,
    );
    expect(listed?.health).toBe("delivering");
    expect(listed?.lastDeliveredAt).toBeInstanceOf(Date);
    expect(
      await latestRecord(owner, "webhook_endpoint.test_sent", endpointId),
    ).toMatchObject({ locationId: PROPERTY });
  });

  it("INT-S1-50: a removed endpoint stops receiving, loses its secret, and what was on its way is cancelled", async () => {
    const { endpointId } = await endpointToReceiver(
      "Removed",
      ["reservation.created"],
      "/removed",
    );
    await publishReservation();
    await drainOutbox();
    await integrations.removeEndpoint(MANAGER, endpointId);
    await settle();
    expect(requestsTo("/removed")).toHaveLength(0);

    const [row] = await owner.$queryRawUnsafe<
      { status: string; secrets: number }[]
    >(
      `select endpoint.status,
              (select count(*)::int from public.webhook_endpoint_secrets
                where endpoint_id = endpoint.id) as secrets
         from public.webhook_endpoints as endpoint where endpoint.id = $1::uuid`,
      endpointId,
    );
    expect(row).toEqual({ status: "removed", secrets: 0 });
    const view = await integrations.endpoints(MANAGER, ORG);
    expect(view.endpoints.some((endpoint) => endpoint.id === endpointId)).toBe(
      false,
    );

    await publishReservation();
    await drainOutbox();
    await settle();
    expect(requestsTo("/removed")).toHaveLength(0);
    expect(
      await latestRecord(owner, "webhook_endpoint.removed", endpointId),
    ).toBeDefined();
  });
});

describe("where a delivery may go", () => {
  it("INT-S1-54: a worker without the test allowance refuses plain http to this machine and sends nothing", async () => {
    const { endpointId } = await endpointToReceiver(
      "Loopback",
      ["reservation.created"],
      "/strict-pass",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    await settle(strictDelivery);

    expect(requestsTo("/strict-pass")).toHaveLength(0);
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastFailure: "invalid_target",
    });
  });

  it("INT-S1-54: an address in a private range is refused at connect time, whatever the table holds", async () => {
    const { endpointId } = await endpointToReceiver("Metadata", [
      "reservation.created",
    ]);
    await owner.$executeRawUnsafe(
      `update public.webhook_endpoints set url = 'https://169.254.169.254/latest/meta-data'
        where id = $1::uuid`,
      endpointId,
    );
    const eventId = await publishReservation();
    await drainOutbox();
    const before = received.length;
    await settle(strictDelivery);

    expect(received.length).toBe(before);
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "failed",
      lastFailure: "blocked_address",
    });
  });

  it("INT-S1-55: a redirect is not followed", async () => {
    const { endpointId } = await endpointToReceiver(
      "Redirecting",
      ["reservation.created"],
      "/redirecting",
    );
    const eventId = await publishReservation();
    await drainOutbox();
    script.push({
      status: 302,
      headers: { Location: `${receiverOrigin}/elsewhere` },
    });
    await settle();

    expect(requestsTo("/redirecting")).toHaveLength(1);
    expect(requestsTo("/elsewhere")).toHaveLength(0);
    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "failed",
      lastStatusCode: 302,
      lastFailure: "redirect_refused",
    });
  });
});

describe("what is sent is what happened", () => {
  it("INT-S1-27: an event that does not match its source is never sent, is on the screen as a failure, and cannot be retried", async () => {
    const { endpointId } = await endpointToReceiver(
      "Forged",
      ["reservation.created"],
      "/forged",
    );
    const nothing = await publishEvent("reservation.created", {
      reservationId: randomUUID(),
      propertyId: PROPERTY,
    });
    const { reservationId } = await bookReservation();
    const wrongProperty = await publishEvent("reservation.created", {
      reservationId,
      propertyId: randomUUID(),
    });
    await drainOutbox();
    await settle();

    expect(requestsTo("/forged")).toHaveLength(0);
    for (const eventId of [nothing, wrongProperty]) {
      expect(await deliveryOf(endpointId, eventId)).toMatchObject({
        status: "failed",
        attempts: 0,
        lastFailure: "source_mismatch",
      });
      const [event] = await owner.$queryRawUnsafe<
        { published: boolean; dead: boolean }[]
      >(
        `select published_at is not null as published, dead_at is not null as dead
           from outbox.events where id = $1::uuid`,
        eventId,
      );
      expect(event).toEqual({ published: true, dead: false });
    }
    const [bodies] = await owner.$queryRawUnsafe<{ empty: number }[]>(
      `select count(*)::int as empty from public.webhook_deliveries
        where endpoint_id = $1::uuid and body = '{}'::jsonb`,
      endpointId,
    );
    expect(bodies?.empty).toBe(2);

    const failures = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );
    expect(failures).toHaveLength(2);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          error: "source_mismatch",
          attempts: 0,
          operation: "reservation.created",
        }),
      ]),
    );

    await expect(
      integrations.retryOperation(MANAGER, { operationId: failures[0]!.id }),
    ).rejects.toMatchObject({ reason: "unavailable" });
    await integrations.resolveOperation(MANAGER, {
      operationId: failures[0]!.id,
      reason: "Looked into it; the event was a test",
    });
    expect(
      (await openFailures()).filter((item) => item.endpointId === endpointId),
    ).toHaveLength(1);

    // A true event after the false ones is not held up by them.
    const real = await publishReservation();
    await drainOutbox();
    await settle();
    expect(requestsTo("/forged")).toHaveLength(1);
    expect(await deliveryOf(endpointId, real)).toMatchObject({
      status: "delivered",
    });
  });

  it("INT-S1-63: the body carries the reservation as it is, not as the event described it", async () => {
    await endpointToReceiver("Truthful", ["reservation.created"], "/truthful");
    const { reservationId, unitId } = await bookReservation();
    await publishEvent("reservation.created", {
      reservationId,
      propertyId: PROPERTY,
      accommodationUnitId: randomUUID(),
      guestId: GUEST,
      description: "Mr Example asked for a quiet room",
      amountMinor: 999999,
    });
    await drainOutbox();
    await settle();

    const [request] = requestsTo("/truthful");
    const body = JSON.parse(request!.body) as {
      propertyId: string;
      data: Record<string, unknown>;
    };
    expect(body.propertyId).toBe(PROPERTY);
    expect(body.data).toEqual({
      reservationId,
      propertyId: PROPERTY,
      accommodationUnitId: unitId,
    });
    expect(request!.body).not.toContain("999999");
  });

  it("INT-S1-63: a cancellation of a reservation that is not cancelled is refused", async () => {
    const { endpointId } = await endpointToReceiver(
      "Cancellations",
      ["reservation.cancelled"],
      "/cancelled",
    );
    const standing = await bookReservation("confirmed");
    const gone = await bookReservation("cancelled");
    const forged = await publishEvent("reservation.cancelled", {
      reservationId: standing.reservationId,
      propertyId: PROPERTY,
    });
    const true_ = await publishEvent("reservation.cancelled", {
      reservationId: gone.reservationId,
      propertyId: PROPERTY,
    });
    await drainOutbox();
    await settle();

    expect(requestsTo("/cancelled")).toHaveLength(1);
    expect(JSON.parse(requestsTo("/cancelled")[0]!.body)).toMatchObject({
      id: true_,
      type: "reservation.cancelled",
    });
    expect(await deliveryOf(endpointId, forged)).toMatchObject({
      status: "failed",
      lastFailure: "source_mismatch",
    });
  });
});

describe("one delivery on the wire per endpoint", () => {
  it("INT-S1-76: a second pass sends nothing to an endpoint that is mid-request, and the endpoint receives its events oldest first", async () => {
    const { endpointId } = await endpointToReceiver(
      "Ordered",
      ["reservation.created"],
      "/ordered",
    );
    const first = await publishReservation();
    await drainOutbox();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await publishReservation();
    await drainOutbox();

    const held = gate();
    script.push({ status: 200, hold: held.held });
    const onePass = delivery.processDueDeliveries();
    await until(() => received.length === 1, "the first request to arrive");

    const otherReplica = createWebhookDelivery({
      db: workerDb,
      allowLoopbackHttp: true,
    });
    const meanwhile = await otherReplica.processDueDeliveries();
    expect(meanwhile.outcomes).toEqual([]);
    expect(received).toHaveLength(1);
    expect(await deliveryOf(endpointId, second)).toMatchObject({
      status: "pending",
      attempts: 0,
    });

    held.release();
    await onePass;
    await settle();

    expect(
      received.map((request) => request.headers["x-ranza-event-id"]),
    ).toEqual([first, second]);
    expect(mostInFlight).toBe(1);
  });

  it("INT-S1-76: two replicas claiming two deliveries of one endpoint at the same moment end with one lease", async () => {
    const { endpointId } = await endpointToReceiver(
      "Contended",
      ["reservation.created"],
      "/contended",
    );
    const first = await publishReservation();
    const second = await publishReservation();
    await drainOutbox();

    const claim = (deliveryId: string) =>
      workerDb.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "select app.set_worker_context($1::uuid, 'integrations.test')",
          ORG,
        );
        const rows = await tx.$queryRawUnsafe<{ leaseId: string }[]>(
          `select lease_id as "leaseId" from app.claim_webhook_delivery($1::uuid)`,
          deliveryId,
        );
        return rows.length;
      });

    const ids = [
      (await deliveryOf(endpointId, first))!.id,
      (await deliveryOf(endpointId, second))!.id,
    ];
    for (let round = 0; round < 30; round += 1) {
      await owner.$executeRawUnsafe(
        `update public.webhook_deliveries set claimed_until = null, lease_id = null
          where endpoint_id = $1::uuid`,
        endpointId,
      );
      const claimed = await Promise.all(ids.map(claim));
      expect(claimed.reduce((sum, rows) => sum + rows, 0)).toBeLessThanOrEqual(
        1,
      );
    }
  }, 120_000);

  it("INT-S1-77: an attempt that outlived its lease cannot record over the one that replaced it", async () => {
    const { endpointId } = await endpointToReceiver(
      "Lapsed",
      ["reservation.created"],
      "/lapsed",
    );
    const eventId = await publishReservation();
    await drainOutbox();

    const held = gate();
    script.push({ status: 500, body: "too late", hold: held.held });
    const slow = delivery.processDueDeliveries();
    await until(() => received.length === 1, "the slow request to arrive");

    await owner.$executeRawUnsafe(
      `update public.webhook_deliveries
          set claimed_until = now() - interval '1 minute'
        where endpoint_id = $1::uuid`,
      endpointId,
    );
    const replacement = await delivery.processDueDeliveries();
    expect(replacement.outcomes.map((outcome) => outcome.status)).toEqual([
      "delivered",
    ]);

    held.release();
    const report = await slow;
    expect(report.outcomes.map((outcome) => outcome.status)).toEqual([null]);

    expect(await deliveryOf(endpointId, eventId)).toMatchObject({
      status: "delivered",
      attempts: 1,
      lastStatusCode: 200,
    });
    expect(
      (await openFailures()).filter((item) => item.endpointId === endpointId),
    ).toEqual([]);
  });
});

describe("a screenful of failures", () => {
  it("INT-S1-71: Retry all puts every stopped delivery back, skips what cannot be sent, audits each, and refuses someone who may not", async () => {
    const { endpointId } = await endpointToReceiver(
      "Many stopped",
      ["reservation.created"],
      "/many",
    );
    const sent: string[] = [];
    for (let n = 0; n < 3; n += 1) sent.push(await publishReservation());
    await drainOutbox();
    script.push({ status: 400 }, { status: 400 }, { status: 400 });
    await settle();
    await publishEvent("reservation.created", {
      reservationId: randomUUID(),
      propertyId: PROPERTY,
    });
    await drainOutbox();

    const stopped = (
      await integrations.failedOperations(MANAGER, PROPERTY, {
        view: "open",
        limit: 50,
        offset: 0,
      })
    ).records.filter((item) => item.endpointId === endpointId);
    expect(stopped.filter((item) => item.retryable)).toHaveLength(3);
    expect(stopped.filter((item) => !item.retryable)).toHaveLength(1);

    await expect(
      integrations.retryAllOperations(VIEWER, { propertyId: PROPERTY }),
    ).rejects.toMatchObject({ reason: "not_permitted" });
    expect(await deliveryOf(endpointId, sent[0]!)).toMatchObject({
      status: "failed",
    });

    expect(
      await integrations.retryAllOperations(MANAGER, { propertyId: PROPERTY }),
    ).toBe(3);
    for (const eventId of sent) {
      expect(await deliveryOf(endpointId, eventId)).toMatchObject({
        status: "retrying",
        attempts: 1,
      });
    }
    const [audited] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from audit.records
        where action = 'failed_operation.retried'
          and subject_id = any ($1::uuid[])`,
      stopped.filter((item) => item.retryable).map((item) => item.id),
    );
    expect(audited?.count).toBe(3);

    await settle();
    expect(requestsTo("/many")).toHaveLength(6);
    expect(
      (
        await integrations.failedOperations(MANAGER, PROPERTY, {
          view: "open",
          limit: 50,
          offset: 0,
        })
      ).records.filter((item) => item.endpointId === endpointId),
    ).toHaveLength(1);
    expect(
      await integrations.retryAllOperations(MANAGER, { propertyId: PROPERTY }),
    ).toBe(0);
  });

  it("INT-S1-73: failures come a page at a time with the total, the closed ones are their own list, and a closed one says who and why", async () => {
    const { endpointId } = await endpointToReceiver(
      "Paged",
      ["reservation.created"],
      "/paged",
    );
    for (let n = 0; n < 5; n += 1) await publishReservation();
    await drainOutbox();
    script.push(...Array.from({ length: 5 }, () => ({ status: 400 }) as Reply));
    await settle();

    const page = (view: "open" | "closed", offset: number) =>
      integrations.failedOperations(MANAGER, PROPERTY, {
        view,
        limit: 2,
        offset,
      });
    const first = await page("open", 0);
    const second = await page("open", 2);
    const third = await page("open", 4);
    expect(first.total).toBe(5);
    expect(first.records).toHaveLength(2);
    expect(third.records).toHaveLength(1);
    const ids = [...first.records, ...second.records, ...third.records].map(
      (record) => record.id,
    );
    expect(new Set(ids).size).toBe(5);
    expect((await page("open", 10)).records).toEqual([]);
    const closedBefore = (await page("closed", 0)).total;

    await integrations.resolveOperation(MANAGER, {
      operationId: ids[0]!,
      reason: "Re-sent by hand",
    });
    const closed = await page("closed", 0);
    expect(closed.total).toBe(closedBefore + 1);
    expect(closed.records[0]).toMatchObject({
      id: ids[0],
      status: "resolved",
      closedBy: MANAGER,
      closedReason: "Re-sent by hand",
      endpointId,
    });
    expect(closed.records[0]!.closedAt).toBeInstanceOf(Date);
    expect((await page("open", 0)).total).toBe(4);
  });

  it("INT-S1-74: a delivery that is due and not being sent is counted as overdue on its endpoint", async () => {
    const { endpointId } = await endpointToReceiver(
      "Stalled",
      ["reservation.created"],
      "/stalled",
    );
    await publishReservation();
    await drainOutbox();
    const find = async () =>
      (await integrations.endpoints(MANAGER, ORG)).endpoints.find(
        (endpoint) => endpoint.id === endpointId,
      );
    expect(await find()).toMatchObject({ queued: 1, overdue: 0 });

    await owner.$executeRawUnsafe(
      `update public.webhook_deliveries
          set next_attempt_at = now() - interval '6 minutes'
        where endpoint_id = $1::uuid`,
      endpointId,
    );
    expect(await find()).toMatchObject({ queued: 1, overdue: 1 });

    await settle();
    expect(await find()).toMatchObject({ queued: 0, overdue: 0 });
  });
});

describe("the ten-endpoint cap", () => {
  it("INT-S1-21: two people registering the tenth endpoint at the same moment end with ten", async () => {
    const register = (name: string) =>
      integrations.registerEndpoint(MANAGER, {
        organizationId: ORG,
        name,
        url: `https://hooks.example.test/${randomUUID()}`,
        eventTypes: ["stay.checked_in"],
      });

    for (let round = 0; round < 3; round += 1) {
      await owner.$executeRawUnsafe(
        `update public.webhook_endpoints
            set status = 'removed', removed_at = now()
          where organization_id = $1::uuid and status = 'active'`,
        ORG,
      );
      for (let n = 0; n < 9; n += 1) await register(`Filler ${n}`);

      const outcomes = await Promise.allSettled([
        register("Racer one"),
        register("Racer two"),
      ]);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const refused = outcomes.find((o) => o.status === "rejected");
      expect((refused as PromiseRejectedResult).reason).toMatchObject({
        reason: "too_many_endpoints",
      });
      const [count] = await owner.$queryRawUnsafe<{ active: number }[]>(
        `select count(*)::int as active from public.webhook_endpoints
          where organization_id = $1::uuid and status = 'active'`,
        ORG,
      );
      expect(count?.active).toBe(10);
    }
  }, 120_000);
});

describe("what a viewer is shown", () => {
  it("INT-S1-67: someone who can only view reads an address without its query string, and cannot read the column", async () => {
    await integrations.registerEndpoint(MANAGER, {
      organizationId: ORG,
      name: "Tokened",
      url: "https://hooks.example.test/tokened?token=s3cret-token#top",
      eventTypes: ["stay.checked_in"],
    });

    const seen = await integrations.endpoints(VIEWER, ORG);
    expect(seen.mayManage).toBe(false);
    expect(seen.endpoints).toHaveLength(1);
    expect(seen.endpoints[0]).toMatchObject({
      url: "https://hooks.example.test/tokened",
      urlMasked: true,
    });
    expect(JSON.stringify(seen)).not.toContain("s3cret-token");

    const managed = await integrations.endpoints(MANAGER, ORG);
    expect(managed.endpoints[0]).toMatchObject({
      url: "https://hooks.example.test/tokened?token=s3cret-token#top",
      urlMasked: false,
    });

    await expect(
      withOrganizationContext(prisma, { userId: VIEWER }, (tx) =>
        (tx as unknown as typeof prisma).$queryRawUnsafe(
          "select url from public.webhook_endpoints",
        ),
      ),
    ).rejects.toThrow(/permission denied|42501/);
  });
});

describe("what the database refuses on its own", () => {
  it("INT-S1-65: a missing reason is refused inside the function, and the refusal reaches the module as the SQLSTATE it is", async () => {
    const { endpointId } = await endpointToReceiver(
      "Reasonless",
      ["reservation.created"],
      "/reasonless",
    );
    await publishReservation();
    await drainOutbox();
    script.push({ status: 400 });
    await settle();
    const [failure] = (await openFailures()).filter(
      (item) => item.endpointId === endpointId,
    );

    const error = await withOrganizationContext(
      prisma,
      { userId: MANAGER },
      (tx) =>
        (tx as unknown as typeof prisma).$queryRawUnsafe(
          "select app.resolve_failed_operation($1::uuid, null)",
          failure!.id,
        ),
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      meta: { driverAdapterError: { cause: { originalCode: "23514" } } },
    });
    expect(
      (await openFailures()).filter((item) => item.endpointId === endpointId),
    ).toHaveLength(1);
  });
});

describe("the catalogue", () => {
  it("INT-S1-26: the events the module offers are exactly the events the database will deliver", async () => {
    const candidates = [
      ...WEBHOOK_EVENT_TYPES,
      "staff.reach_changed",
      "stay.moved",
      "stay.departure_changed",
      "business_day.closed",
      "unit.returned_to_service",
      "data_export.expired",
    ];
    const rows = await owner.$queryRawUnsafe<{ eventType: string }[]>(
      `select candidate as "eventType"
         from unnest($1::text[]) as candidate
        where app.webhook_event_keys(candidate) is not null`,
      candidates,
    );
    expect(rows.map((row) => row.eventType).sort()).toEqual(
      [...WEBHOOK_EVENT_TYPES].sort(),
    );
  });
});
