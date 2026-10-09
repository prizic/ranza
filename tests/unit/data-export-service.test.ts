/**
 * The worker's export jobs, without a database: what they say, and when they run.
 *
 * `@ranza/data-export`'s runner is proved against a real database in
 * `tests/integration/data-export.test.ts`. What is left is this class, which
 * decides only when a pass runs and what gets logged — and an export failure
 * it swallowed would leave a row saying `internal_error` and no log saying why.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportRunner } from "../../packages/ranza/data-export/src";
import { DataExportService } from "../../apps/worker/src/export/data-export.service";

function loggerOf(service: DataExportService) {
  const { logger } = service as unknown as {
    logger: {
      log: (message: string) => void;
      error: (message: string) => void;
    };
  };
  return {
    log: vi.spyOn(logger, "log").mockImplementation(() => {}),
    error: vi.spyOn(logger, "error").mockImplementation(() => {}),
  };
}

function serviceRunning(runner: Partial<ExportRunner>) {
  const service = new DataExportService(runner as ExportRunner);
  return { service, ...loggerOf(service) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a pass over the waiting exports", () => {
  it("EXP-S1-44: says nothing when nothing was waiting", async () => {
    const { service, log, error } = serviceRunning({
      processPendingExports: async () => ({
        processed: 0,
        succeeded: 0,
        failures: [],
        unrecorded: [],
      }),
    });

    await service.tickPending();

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("EXP-S1-44: names every failure with the reason the row holds and the exception behind it", async () => {
    const { service, log, error } = serviceRunning({
      processPendingExports: async () => ({
        processed: 3,
        succeeded: 1,
        failures: [
          {
            exportId: "e-1",
            reason: "internal_error",
            error: new Error("relation does not exist"),
          },
          {
            exportId: "e-2",
            reason: "requester_not_permitted",
            error: new Error("export_refused:requester_not_permitted"),
          },
        ],
        unrecorded: [{ exportId: "e-1", error: new Error("no database") }],
      }),
    });

    await service.tickPending();

    expect(log).toHaveBeenCalledWith(
      "data_export.pass: 3 waiting, 1 finished, 2 failed",
    );
    expect(error).toHaveBeenCalledWith(
      "data_export.failed: export e-1 as internal_error: relation does not exist",
    );
    expect(error).toHaveBeenCalledWith(
      "data_export.failed: export e-2 as requester_not_permitted: export_refused:requester_not_permitted",
    );
    expect(error).toHaveBeenCalledWith(
      "data_export.failure_unrecorded: export e-1 is still not marked failed and will be swept: no database",
    );
  });

  it("EXP-S1-44: logs a pass that could not start, and does not throw it", async () => {
    const { service, error } = serviceRunning({
      processPendingExports: async () => {
        throw new Error("no database");
      },
    });

    await expect(service.tickPending()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("data_export.pass_failed: no database");
  });

  it("EXP-S1-44: does not start a second pass while one is running", async () => {
    let finish!: () => void;
    const processPendingExports = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ExportRunner["processPendingExports"]>>>(
          (resolve) => {
            finish = () =>
              resolve({ processed: 0, succeeded: 0, failures: [], unrecorded: [] });
          },
        ),
    );
    const { service } = serviceRunning({ processPendingExports });

    const first = service.tickPending();
    await service.tickPending();
    expect(processPendingExports).toHaveBeenCalledTimes(1);

    finish();
    await first;
  });
});

describe("the schedule and sweep passes", () => {
  it("EXP-S1-44: name a schedule that could not start and an export the sweep could not settle", async () => {
    const { service, error } = serviceRunning({
      processDueSchedules: async () => ({
        schedulesEvaluated: 1,
        exportsTriggered: 0,
        failures: [{ scheduleId: "s-1", error: new Error("boom") }],
      }),
      sweepExports: async () => ({
        stalled: 0,
        expired: 0,
        failures: [{ exportId: "e-9", error: new Error("locked") }],
      }),
    });

    await service.tickSchedules();
    await service.tickSweep();

    expect(error).toHaveBeenCalledWith(
      "data_export.schedule_failed: schedule s-1: boom",
    );
    expect(error).toHaveBeenCalledWith(
      "data_export.sweep_failed: export e-9: locked",
    );
  });
});
