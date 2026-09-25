/**
 * The route Today polls (TD-S1-05 to TD-S1-07). The summary itself is mocked:
 * what it contains is decided on the server and asserted in today-derive and
 * the integration suite. What only this handler decides is its narrowness.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentViewer = vi.fn();
const todaySummary = vi.fn();

vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer,
  todaySummary,
}));

const { GET } =
  await import("../../apps/operator-workspace/src/app/api/today/route");

const PROPERTY = "d4000003-0000-4000-8000-000000000001";
const get = (query: string) =>
  new Request(`http://workspace.test/api/today${query}`);

beforeEach(() => {
  currentViewer.mockReset();
  todaySummary.mockReset();
});

describe("GET today", () => {
  it("the_summary_route_refuses_without_a_session", async () => {
    currentViewer.mockResolvedValue(null);
    const response = await GET(get(`?property=${PROPERTY}`));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(todaySummary).not.toHaveBeenCalled();
  });

  it("a_malformed_property_id_is_an_empty_answer", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    const response = await GET(get("?property=not-a-uuid"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ summary: null });
    expect(todaySummary).not.toHaveBeenCalled();
  });

  it("a_property_out_of_reach_summarises_nothing", async () => {
    currentViewer.mockResolvedValue({ userId: "user-1" });
    todaySummary.mockResolvedValue(null);
    const response = await GET(get(`?property=${PROPERTY}`));
    expect(await response.json()).toEqual({ summary: null });
    expect(todaySummary).toHaveBeenCalledWith(PROPERTY);
  });
});
