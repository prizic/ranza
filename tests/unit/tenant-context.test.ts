import { describe, expect, it, vi } from "vitest";
import {
  TenantContextError,
  withOrganizationContext,
} from "../../packages/db/src/context";

const userId = "11111111-1111-4111-8111-111111111111";

function fakePrisma() {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const client = {
    $executeRawUnsafe: vi.fn(async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      return 1;
    }),
  };
  return {
    calls,
    client,
    prisma: {
      $transaction: vi.fn(
        async <T>(run: (c: typeof client) => Promise<T>): Promise<T> =>
          run(client),
      ),
    },
  };
}

describe("withOrganizationContext", () => {
  it("publishes the acting user before running the query", async () => {
    const { calls, prisma } = fakePrisma();
    const order: string[] = [];

    await withOrganizationContext(prisma, { userId }, async () => {
      order.push("query");
      return "result";
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain("app.set_request_context");
    expect(order).toEqual(["query"]);
  });

  it("binds the user id instead of interpolating it", async () => {
    const { calls, prisma } = fakePrisma();

    await withOrganizationContext(prisma, { userId }, async () => null);

    expect(calls[0]?.query).not.toContain(userId);
    expect(calls[0]?.values).toEqual([userId]);
  });

  it("runs the query inside the same transaction that set the context", async () => {
    const { prisma } = fakePrisma();

    const result = await withOrganizationContext(
      prisma,
      { userId },
      async () => "inside",
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(result).toBe("inside");
  });

  it("rejects a malformed user id before reaching the database", async () => {
    const { calls, prisma } = fakePrisma();

    await expect(
      withOrganizationContext(
        prisma,
        { userId: "'; drop table organizations; --" },
        async () => null,
      ),
    ).rejects.toBeInstanceOf(TenantContextError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
