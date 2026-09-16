/**
 * The route handler a live screen polls.
 *
 * A client hook cannot call `src/server/` directly, so this is the one new
 * entrance to the funnel that ADR 0019 opens. What is asserted here is that it
 * is narrow: no session gets nothing, a malformed id gets nothing, and an
 * unreachable Property is answered exactly as a quiet day is.
 *
 * The funnel itself is mocked, because what it returns is decided by policies
 * that `tests/integration` already exercises against a real database. What
 * cannot be tested there is a handler's behaviour when the session is absent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentViewer = vi.fn();
const arrivals = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  arrivals,
  currentViewer,
}));

const { GET } =
  await import("../../apps/operator-workspace/src/app/api/front-office/arrivals/route");

const PROPERTY = "d4000003-0000-4000-8000-000000000001";

function get(query: string): Request {
  return new Request(`http://workspace.test/api/front-office/arrivals${query}`);
}

beforeEach(() => {
  currentViewer.mockReset();
  arrivals.mockReset();
});

describe("GET arrivals", () => {
  it("returns 401 and no body without a session", async () => {
    currentViewer.mockResolvedValue(null);

    const response = await GET(get(`?property=${PROPERTY}`));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    // And never reached the funnel, so nothing was read on behalf of nobody.
    expect(arrivals).not.toHaveBeenCalled();
  });

  it("answers a malformed Property id the same way an empty day looks", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });

    const response = await GET(get("?property=not-a-uuid"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ arrivals: [] });
    // Rather than letting it reach the database as a failed cast and come back
    // as a 500, which would tell the caller their guess was the wrong shape.
    expect(arrivals).not.toHaveBeenCalled();
  });

  it("answers a missing Property id the same way", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });

    expect(await (await GET(get(""))).json()).toEqual({ arrivals: [] });
  });

  // The funnel returns an empty list for a Property in another Organization,
  // because the policies filtered it. The handler must not turn that into
  // anything more informative.
  it("passes the funnel's answer through unchanged, including empty", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    arrivals.mockResolvedValue([]);

    const response = await GET(get(`?property=${PROPERTY}`));

    expect(await response.json()).toEqual({ arrivals: [] });
    expect(arrivals).toHaveBeenCalledWith(PROPERTY);
  });
});
