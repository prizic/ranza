/**
 * Arrivals on a screen that stays open (CI-S3-15, ADR 0019).
 *
 * Another desk checks somebody in and this one shows it on its next read,
 * every thirty seconds, and not while the tab is hidden. Asserted by what the
 * screen fetches as time passes rather than by reading the option, so a poll
 * that stopped working for any reason goes red — not only a changed number.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frontOfficeKeys } from "../../apps/operator-workspace/src/features/front-office/query-keys";

// The table is what the rows are handed to; its own tests render it.
vi.mock(
  "../../apps/operator-workspace/src/features/front-office/components/arrivals-table",
  () => ({ ArrivalsTable: () => null }),
);

const { QueryProvider } =
  await import("../../apps/operator-workspace/src/app/providers/query-provider");
const { Hydrated, requestQueryClient } =
  await import("../../apps/operator-workspace/src/app/providers/hydrate");
const { LiveArrivals } =
  await import("../../apps/operator-workspace/src/features/front-office/components/live-arrivals");

const scope = {
  organizationId: "org-1",
  propertyId: "dc000003-0000-4000-8000-000000000001",
  userId: "user-1",
};

let fetched: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetched = vi.fn(async () => new Response(JSON.stringify({ arrivals: [] })));
  vi.stubGlobal("fetch", fetched);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderArrivals(): void {
  const prefetched = requestQueryClient();
  prefetched.setQueryData(frontOfficeKeys.arrivals(scope), []);
  render(
    <QueryProvider scope={scope.userId}>
      <Hydrated client={prefetched}>
        <LiveArrivals locale="en" scope={scope} />
      </Hydrated>
    </QueryProvider>,
  );
}

describe("the arrivals screen", () => {
  it("arrivals_are_read_again_every_30_seconds_while_visible", async () => {
    renderArrivals();
    // No visibility or focus event: only the interval can cause a read.
    await act(() => vi.advanceTimersByTimeAsync(29_000));
    expect(fetched).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(String(fetched.mock.calls[0]?.[0])).toContain(
      `/api/front-office/arrivals?property=${scope.propertyId}`,
    );
  });

  it("arrivals_are_not_polled_while_the_tab_is_hidden", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    try {
      renderArrivals();
      await act(() => vi.advanceTimersByTimeAsync(95_000));
      expect(fetched).not.toHaveBeenCalled();
    } finally {
      visibility.mockRestore();
    }
  });
});
