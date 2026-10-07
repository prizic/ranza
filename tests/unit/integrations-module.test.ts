import { describe, expect, it, vi } from "vitest";
import {
  createIntegrationsModule,
  INTEGRATIONS_CAPABILITY,
} from "../../packages/ranza/integrations/src";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

describe("Integrations Module Unit Tests (INT-S1-*)", () => {
  it("exports capability reference matching Blueprint 5.15", () => {
    expect(INTEGRATIONS_CAPABILITY).toEqual({
      moduleKey: "platform_core",
      capabilityKey: "integrations",
    });
  });

  it("lists integrations and maps row structures", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "aa111111-1111-4111-8111-111111111111",
          property_id: "bb111111-1111-4111-8111-111111111111",
          key: "channel_manager",
          name: "Channel manager",
          category: "Distribution",
          status: "connected",
          detail: null,
          config: {},
          last_sync_at: new Date("2026-10-07T12:00:00Z"),
          created_at: new Date("2026-10-07T10:00:00Z"),
          updated_at: new Date("2026-10-07T12:00:00Z"),
        },
      ]),
    };

    const mod = createIntegrationsModule({ db: mockDb });
    const list = await mod.integrations(
      TEST_USER_ID,
      "bb111111-1111-4111-8111-111111111111",
    );

    expect(list).toHaveLength(1);
    expect(list[0]?.key).toBe("channel_manager");
    expect(list[0]?.status).toBe("connected");
    expect(list[0]?.category).toBe("Distribution");
  });

  it("lists failed operations and maps attempt counts", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "ff111111-1111-4111-8111-111111111111",
          organization_id: "aa111111-1111-4111-8111-111111111111",
          property_id: "bb111111-1111-4111-8111-111111111111",
          integration_id: "11111111-1111-4111-8111-111111111111",
          integration_name: "Channel manager",
          operation: "Push availability",
          error: "Rate plan not mapped",
          status: "failed",
          attempts: 3,
          payload: { room: 305 },
          last_attempt_at: new Date("2026-10-07T12:00:00Z"),
          created_at: new Date("2026-10-07T11:45:00Z"),
          updated_at: new Date("2026-10-07T12:00:00Z"),
        },
      ]),
    };

    const mod = createIntegrationsModule({ db: mockDb });
    const failed = await mod.failedOperations(
      TEST_USER_ID,
      "bb111111-1111-4111-8111-111111111111",
    );

    expect(failed).toHaveLength(1);
    expect(failed[0]?.operation).toBe("Push availability");
    expect(failed[0]?.error).toBe("Rate plan not mapped");
    expect(failed[0]?.attempts).toBe(3);
    expect(failed[0]?.status).toBe("failed");
  });

  it("retrying an operation updates operation and clears integration error if 0 remain", async () => {
    let executeCalls = 0;
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "ff111111-1111-4111-8111-111111111111",
            organization_id: "aa111111-1111-4111-8111-111111111111",
            property_id: "bb111111-1111-4111-8111-111111111111",
            integration_name: "Channel manager",
            operation: "Push availability",
            error: "Rate plan not mapped",
            status: "failed",
            attempts: 1,
            payload: {},
            last_attempt_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([{ count: 0n }]),
      $executeRaw: vi.fn().mockImplementation(async () => {
        executeCalls++;
        return 1;
      }),
    };

    const mod = createIntegrationsModule({ db: mockDb });
    const result = await mod.retryOperation(TEST_USER_ID, {
      propertyId: "bb111111-1111-4111-8111-111111111111",
      operationId: "ff111111-1111-4111-8111-111111111111",
    });

    expect(result.ok).toBe(true);
    expect(result.integrationName).toBe("Channel manager");
    expect(executeCalls).toBe(2); // 1 to mark resolved, 1 to restore integration connected status
  });
});
