import { describe, expect, it, vi } from "vitest";
import {
  createDataExportModule,
  DATA_EXPORT_CAPABILITY,
  EXPORT_RESOURCE_TYPES,
} from "../../packages/ranza/data-export/src";

const TEST_USER_ID = "81111111-1111-4111-8111-111111111111";

describe("Data Export Module Unit Tests (EXP-S1-*)", () => {
  it("exports capability reference matching Blueprint Phase 1", () => {
    expect(DATA_EXPORT_CAPABILITY).toBe("data_export");
    expect(EXPORT_RESOURCE_TYPES).toContain("residents_guests");
    expect(EXPORT_RESOURCE_TYPES).toContain("reservations_stays");
    expect(EXPORT_RESOURCE_TYPES).toContain("rooms_beds");
    expect(EXPORT_RESOURCE_TYPES).toContain("folios_payments");
    expect(EXPORT_RESOURCE_TYPES).toContain("audit_log");
  });

  it("lists exports and maps row structure", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: "ee111111-1111-4111-8111-111111111111",
          organization_id: "aa111111-1111-4111-8111-111111111111",
          requester_id: TEST_USER_ID,
          requester_name: "Export Manager",
          resource_types: ["residents_guests"],
          format: "csv",
          status: "ready",
          trigger_type: "on_demand",
          schedule_id: null,
          file_name: "export-ee111111.csv",
          file_size_bytes: 512,
          file_content: "id,firstName\n1,Alice",
          record_counts: { residents_guests: 1 },
          error: null,
          expires_at: new Date("2026-10-15T00:00:00Z"),
          requested_at: new Date("2026-10-08T10:00:00Z"),
          completed_at: new Date("2026-10-08T10:01:00Z"),
          created_at: new Date("2026-10-08T10:00:00Z"),
        },
      ]),
    };

    const mod = createDataExportModule({ db: mockDb });
    const list = await mod.listExports(TEST_USER_ID);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("ee111111-1111-4111-8111-111111111111");
    expect(list[0]?.status).toBe("ready");
    expect(list[0]?.format).toBe("csv");
    expect(list[0]?.recordCounts).toEqual({ residents_guests: 1 });
  });

  it("creates an on-demand export request with pending status", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi
        .fn()
        // 1. fetch user
        .mockResolvedValueOnce([
          { name: "Export Manager", email: "mgr@test.com" },
        ])
        // 2. fetch membership
        .mockResolvedValueOnce([
          { organization_id: "aa111111-1111-4111-8111-111111111111" },
        ])
        // 3. insert export
        .mockResolvedValueOnce([
          {
            id: "ee222222-2222-4222-8222-222222222222",
            organization_id: "aa111111-1111-4111-8111-111111111111",
            requester_id: TEST_USER_ID,
            requester_name: "Export Manager",
            resource_types: ["rooms_beds"],
            format: "json",
            status: "pending",
            trigger_type: "on_demand",
            schedule_id: null,
            file_name: null,
            file_size_bytes: null,
            file_content: null,
            record_counts: {},
            error: null,
            expires_at: null,
            requested_at: new Date("2026-10-08T10:00:00Z"),
            completed_at: null,
            created_at: new Date("2026-10-08T10:00:00Z"),
          },
        ]),
    };

    const mod = createDataExportModule({ db: mockDb });
    const result = await mod.requestExport(TEST_USER_ID, {
      resourceTypes: ["rooms_beds"],
      format: "json",
    });

    expect(result.status).toBe("pending");
    expect(result.format).toBe("json");
    expect(result.resourceTypes).toEqual(["rooms_beds"]);
  });

  it("lists and creates export schedules", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi
        .fn()
        // 1. fetch membership
        .mockResolvedValueOnce([
          { organization_id: "aa111111-1111-4111-8111-111111111111" },
        ])
        // 2. insert schedule
        .mockResolvedValueOnce([
          {
            id: "ff111111-1111-4111-8111-111111111111",
            organization_id: "aa111111-1111-4111-8111-111111111111",
            created_by: TEST_USER_ID,
            name: "Weekly Folios",
            resource_types: ["folios_payments"],
            format: "csv",
            frequency: "weekly",
            status: "active",
            last_run_at: null,
            next_run_at: new Date("2026-10-15T10:00:00Z"),
            created_at: new Date("2026-10-08T10:00:00Z"),
          },
        ]),
    };

    const mod = createDataExportModule({ db: mockDb });
    const schedule = await mod.createSchedule(TEST_USER_ID, {
      name: "Weekly Folios",
      resourceTypes: ["folios_payments"],
      format: "csv",
      frequency: "weekly",
    });

    expect(schedule.name).toBe("Weekly Folios");
    expect(schedule.frequency).toBe("weekly");
    expect(schedule.status).toBe("active");
  });

  it("worker processes pending exports to ready with calculated metrics", async () => {
    const mockDb: any = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (run: (c: any) => Promise<any>) => run(mockDb)),
      $queryRaw: vi
        .fn()
        // 1. pending_data_exports
        .mockResolvedValueOnce([
          {
            export_id: "ee111111-1111-4111-8111-111111111111",
            organization_id: "aa111111-1111-4111-8111-111111111111",
          },
        ])
        // 2. fetch exportRow inside transaction
        .mockResolvedValueOnce([
          {
            id: "ee111111-1111-4111-8111-111111111111",
            organization_id: "aa111111-1111-4111-8111-111111111111",
            requester_id: TEST_USER_ID,
            requester_name: "Export Manager",
            resource_types: ["residents_guests"],
            format: "json",
            status: "pending",
            trigger_type: "on_demand",
            schedule_id: null,
            file_name: null,
            file_size_bytes: null,
            file_content: null,
            record_counts: {},
            error: null,
            expires_at: null,
            requested_at: new Date("2026-10-08T10:00:00Z"),
            completed_at: null,
            created_at: new Date("2026-10-08T10:00:00Z"),
          },
        ])
        // 3. fetch guests for residents_guests dataset
        .mockResolvedValueOnce([
          {
            id: "g1",
            firstName: "Jane",
            lastName: "Doe",
            email: "jane@test.com",
            phone: "+1234567890",
            nationality: "US",
            idNumber: "P12345",
            createdAt: new Date(),
          },
        ]),
    };

    const mod = createDataExportModule({ db: mockDb });
    const report = await mod.processPendingExports();

    expect(report.processed).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(mockDb.$executeRawUnsafe).toHaveBeenCalledWith(
      "select app.set_worker_context($1::uuid, 'data_export')",
      "aa111111-1111-4111-8111-111111111111",
    );
  });
});
