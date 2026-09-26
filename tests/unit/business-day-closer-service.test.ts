/**
 * The worker's close job, without a database: what it says, and when it runs.
 *
 * `@ranza/business-day`'s closer is proved against a real database in
 * `tests/integration/business-day-closer.test.ts`. What is left is this class,
 * which decides only when a pass runs and what gets logged — and a failure it
 * swallowed, or a pass it ran twice at once, would not show up anywhere else.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DayCloser,
  DayCloserReport,
} from "../../packages/ranza/business-day/src";
import { BusinessDayCloserService } from "../../apps/worker/src/business-day/business-day.closer";

/** The service's own Nest logger, which this test can watch but not import. */
function loggerOf(service: BusinessDayCloserService) {
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

function serviceReturning(report: Promise<DayCloserReport>) {
  const closeDueDays = vi.fn(() => report);
  const service = new BusinessDayCloserService({ closeDueDays } as DayCloser);
  return { service, closeDueDays, ...loggerOf(service) };
}

/** A report that arrives when the test says so, for a pass that is running. */
function pendingReport() {
  let finish!: (report: DayCloserReport) => void;
  const report = new Promise<DayCloserReport>((resolve) => {
    finish = resolve;
  });
  return {
    report,
    finish: () => finish({ due: 0, closed: 0, open: 0, failures: [] }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the pass reports what it did", () => {
  it("says nothing when nothing closed and nothing failed", async () => {
    const { service, log, error } = serviceReturning(
      Promise.resolve({ due: 3, closed: 0, open: 3, failures: [] }),
    );

    await service.tick();

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("logs what it closed, and every failure with its Property", async () => {
    const { service, log, error } = serviceReturning(
      Promise.resolve({
        due: 3,
        closed: 1,
        open: 1,
        failures: [{ propertyId: "p-broken", error: new Error("boom") }],
      }),
    );

    await service.tick();

    expect(log).toHaveBeenCalledWith(
      "due 3, closed 1, waiting on their desk 1, failed 1",
    );
    expect(error).toHaveBeenCalledWith(
      "closing the business day at Property p-broken failed: boom",
    );
  });

  it("logs a pass that could not start, and does not throw it", async () => {
    const { service, error } = serviceReturning(
      Promise.reject(new Error("no database")),
    );

    await expect(service.tick()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("close pass failed: no database");
  });
});

describe("one pass at a time", () => {
  it("does not start a second pass while one is running", async () => {
    const pending = pendingReport();
    const { service, closeDueDays } = serviceReturning(pending.report);

    const first = service.tick();
    await service.tick();
    pending.finish();
    await first;

    expect(closeDueDays).toHaveBeenCalledTimes(1);
  });

  it("lets the current pass finish on shutdown, and starts no other", async () => {
    const pending = pendingReport();
    const { service, closeDueDays } = serviceReturning(pending.report);

    const running = service.tick();
    let stopped = false;
    const stopping = service.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    pending.finish();
    await running;
    await stopping;
    await service.tick();

    expect(stopped).toBe(true);
    expect(closeDueDays).toHaveBeenCalledTimes(1);
  });
});
