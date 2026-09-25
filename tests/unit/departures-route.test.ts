/**
 * The departures route a live screen polls — the arrivals route's twin, held
 * to the same narrowness: no session gets nothing, a malformed id gets what a
 * quiet day gets, and the view is one of two or it is the default.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentViewer = vi.fn();
const departures = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer,
  departures,
}));

const { GET } =
  await import("../../apps/operator-workspace/src/app/api/front-office/departures/route");

const PROPERTY = "d4000003-0000-4000-8000-000000000001";

function get(query: string): Request {
  return new Request(
    `http://workspace.test/api/front-office/departures${query}`,
  );
}

beforeEach(() => {
  currentViewer.mockReset();
  departures.mockReset();
});

describe("GET departures", () => {
  it("returns 401 and no body without a session", async () => {
    currentViewer.mockResolvedValue(null);

    const response = await GET(get(`?property=${PROPERTY}`));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(departures).not.toHaveBeenCalled();
  });

  it("answers a malformed Property id the same way an empty day looks", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });

    const response = await GET(get("?property=not-a-uuid&view=in_house"));

    expect(await response.json()).toEqual({ departures: [] });
    expect(departures).not.toHaveBeenCalled();
  });

  it("asks for everybody in house only when told to", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    departures.mockResolvedValue([]);

    await GET(get(`?property=${PROPERTY}&view=in_house`));
    expect(departures).toHaveBeenLastCalledWith(PROPERTY, "in_house");
  });

  // Anything else — absent, misspelt, the hyphenated form the page once used —
  // is the default list, never an error and never a third view.
  it("falls back to the due list for any other view", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    departures.mockResolvedValue([]);

    for (const view of ["", "&view=in-house", "&view=everything"]) {
      await GET(get(`?property=${PROPERTY}${view}`));
      expect(departures).toHaveBeenLastCalledWith(PROPERTY, "due");
    }
  });
});
