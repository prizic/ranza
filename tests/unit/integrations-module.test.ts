import { describe, expect, it, vi } from "vitest";
import {
  ClosureInputError,
  createIntegrationsModule,
  EndpointInputError,
  IntegrationsRefusedError,
  INTEGRATIONS_CAPABILITY,
  WEBHOOK_EVENT_TYPES,
} from "../../packages/ranza/integrations/src";

const USER = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "aa111111-1111-4111-8111-111111111111";
const OPERATION = "ff111111-1111-4111-8111-111111111111";

/** A client that fails the test if anything reaches the database. */
function untouchedDb() {
  const touched = vi.fn(() => {
    throw new Error("the database was reached");
  });
  return {
    db: {
      $transaction: touched,
      $queryRaw: touched,
      $executeRawUnsafe: touched,
    } as never,
    touched,
  };
}

/**
 * A client whose transaction fails the way a function in the database fails:
 * the adapter puts the SQLSTATE the server sent in `originalCode`, and only some
 * kinds of error also repeat it in `code` (a unique violation does not).
 */
function failingWith(sqlstate: string) {
  const error = Object.assign(new Error("raised"), {
    meta: { driverAdapterError: { cause: { originalCode: sqlstate } } },
  });
  return { $transaction: vi.fn().mockRejectedValue(error) } as never;
}

const valid = {
  organizationId: ORGANIZATION,
  name: "Channel manager",
  url: "https://hooks.example.test/ranza",
  eventTypes: ["stay.checked_in"],
};

describe("Integrations module", () => {
  it("exports the capability reference matching blueprint 5.15", () => {
    expect(INTEGRATIONS_CAPABILITY).toEqual({
      moduleKey: "platform_core",
      capabilityKey: "integrations",
    });
  });

  it("INT-S1-19: offers exactly the six events the database will deliver", () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([
      "reservation.created",
      "reservation.cancelled",
      "reservation.no_show",
      "stay.checked_in",
      "stay.checked_out",
      "folio.line_posted",
    ]);
  });
});

describe("what is refused before the database is asked", () => {
  it.each([
    ["an empty name", { name: "   " }, { field: "name", reason: "empty" }],
    [
      "a long name",
      { name: "x".repeat(81) },
      { field: "name", reason: "too_long" },
    ],
    ["no events", { eventTypes: [] }, { field: "events", reason: "none" }],
    [
      "an event nobody can subscribe to",
      { eventTypes: ["stay.checked_in", "staff.reach_changed"] },
      { field: "events", reason: "unknown" },
    ],
    [
      "plain http",
      { url: "http://hooks.example.test/x" },
      { field: "url", reason: "not_https" },
    ],
    [
      "a private address",
      { url: "https://10.0.0.5/x" },
      { field: "url", reason: "blocked_host" },
    ],
  ])("INT-S1-18: registering with %s", async (_label, change, rejection) => {
    const { db, touched } = untouchedDb();
    const module = createIntegrationsModule({ db });

    await expect(
      module.registerEndpoint(USER, { ...valid, ...change }),
    ).rejects.toEqual(expect.objectContaining({ rejection }));
    await expect(
      module.registerEndpoint(USER, { ...valid, ...change }),
    ).rejects.toBeInstanceOf(EndpointInputError);
    expect(touched).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "no", " x "])(
    "INT-S1-43: a reason of %j says nothing and is refused",
    async (reason) => {
      const { db, touched } = untouchedDb();
      const module = createIntegrationsModule({ db });

      await expect(
        module.cancelOperation(USER, { operationId: OPERATION, reason }),
      ).rejects.toBeInstanceOf(ClosureInputError);
      await expect(
        module.resolveOperation(USER, { operationId: OPERATION, reason }),
      ).rejects.toBeInstanceOf(ClosureInputError);
      expect(touched).not.toHaveBeenCalled();
    },
  );

  it("INT-S1-43: a reason of more than five hundred characters is refused", async () => {
    const { db } = untouchedDb();
    await expect(
      createIntegrationsModule({ db }).cancelOperation(USER, {
        operationId: OPERATION,
        reason: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ reason: "reason_too_long" });
  });
});

describe("what the database refuses", () => {
  it.each([
    ["42501", "not_permitted"],
    ["23505", "duplicate_url"],
    ["23514", "reason_required"],
    ["54000", "too_many_endpoints"],
    ["55000", "test_in_flight"],
    ["22023", "unavailable"],
  ])("INT-S1-16: SQLSTATE %s is %s", async (sqlstate, reason) => {
    const module = createIntegrationsModule({ db: failingWith(sqlstate) });

    for (const command of [
      () => module.registerEndpoint(USER, valid),
      () => module.removeEndpoint(USER, OPERATION),
      () =>
        module.sendTestEvent(USER, {
          endpointId: OPERATION,
          propertyId: OPERATION,
        }),
      () => module.retryOperation(USER, { operationId: OPERATION }),
      () =>
        module.cancelOperation(USER, {
          operationId: OPERATION,
          reason: "No longer needed",
        }),
      () =>
        module.resolveOperation(USER, {
          operationId: OPERATION,
          reason: "Handled by phone",
        }),
    ]) {
      const error = await command().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(IntegrationsRefusedError);
      expect((error as IntegrationsRefusedError).reason).toBe(reason);
    }
  });

  it("INT-S1-68: a refusal is read from the SQLSTATE and never from the words of a message", async () => {
    const lookalike = Object.assign(
      new Error("the connection to 10.42501.5.22023 was reset"),
      { meta: { driverAdapterError: { cause: { originalCode: "08006" } } } },
    );
    const withoutCode = new Error("ERROR: 42501 permission denied");
    for (const failure of [lookalike, withoutCode]) {
      const db = { $transaction: vi.fn().mockRejectedValue(failure) } as never;
      await expect(
        createIntegrationsModule({ db }).removeEndpoint(USER, OPERATION),
      ).rejects.toBe(failure);
    }
  });

  it("INT-S1-16: a failure that is not a refusal is passed on to be reported, not disguised", async () => {
    const outage = new Error("connection reset");
    const db = { $transaction: vi.fn().mockRejectedValue(outage) } as never;

    await expect(
      createIntegrationsModule({ db }).registerEndpoint(USER, valid),
    ).rejects.toBe(outage);
  });
});
