/**
 * The room calendar's refresh route: narrow in the same ways the arrivals
 * route is (RC-S1-47), and a failed read is logged with who and where before
 * the screen is told (RC-S1-53).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentViewer = vi.fn();
const roomCalendar = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer,
  roomCalendar,
}));

const { GET } =
  await import("../../apps/operator-workspace/src/app/api/front-office/room-calendar/route");

const PROPERTY = "dc000003-0000-4000-8000-000000000001";

function get(query: string): Request {
  return new Request(
    `http://workspace.test/api/front-office/room-calendar${query}`,
  );
}

beforeEach(() => {
  currentViewer.mockReset();
  roomCalendar.mockReset();
});

describe("GET room-calendar", () => {
  it("RC-S1-47: refuses a signed-out request with 401 and no body", async () => {
    currentViewer.mockResolvedValue(null);
    const response = await GET(get(`?property=${PROPERTY}`));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(roomCalendar).not.toHaveBeenCalled();
  });

  it("answers a malformed Property id with no calendar, never reaching the read", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    expect(await (await GET(get("?property=nope"))).json()).toEqual({
      calendar: null,
    });
    expect(roomCalendar).not.toHaveBeenCalled();
  });

  it("passes a valid window through and drops an invalid one", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    roomCalendar.mockResolvedValue({ units: [] });

    await GET(get(`?property=${PROPERTY}&from=2026-09-21&days=30`));
    expect(roomCalendar).toHaveBeenLastCalledWith(PROPERTY, {
      from: "2026-09-21",
      days: 30,
    });

    await GET(get(`?property=${PROPERTY}&from=monday&days=many`));
    expect(roomCalendar).toHaveBeenLastCalledWith(PROPERTY, {
      from: null,
      days: null,
    });
  });

  it("RC-S1-53: logs a failed read with the Property and viewer, and answers 500", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    roomCalendar.mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(get(`?property=${PROPERTY}`));

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledWith(
      "room_calendar.read_failed",
      expect.objectContaining({ propertyId: PROPERTY, userId: "user-1" }),
    );
    logged.mockRestore();
  });
});
