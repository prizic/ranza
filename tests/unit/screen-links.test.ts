/**
 * The one answer to "may this viewer be sent to that screen from here"
 * (audit 2026-11-07, GATE).
 *
 * A link built by hand from a weaker check than the destination's own gate
 * sent people to refusals: Arrivals offered "New booking" to a viewer who may
 * check in but not book, Configuration offered People to one who may not open
 * it. This helper asks each screen's own gate, `gateOf`, which the rail and the
 * destination page ask too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));

const screenProperties = vi.fn();
const permittedProperties = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  screenProperties,
  permittedProperties,
}));

const { holdsAt, opensAt, screenLinks } =
  await import("../../apps/operator-workspace/src/server/screen-links");

const HERE = "d9000001-0000-4000-8000-0000000000aa";
const ELSEWHERE = "d9000001-0000-4000-8000-0000000000bb";

beforeEach(() => {
  screenProperties.mockReset();
  permittedProperties.mockReset();
});

describe("opensAt", () => {
  it("is true only for a Property the gate listed", () => {
    expect(opensAt([{ propertyId: HERE }], HERE)).toBe(true);
    expect(opensAt([{ propertyId: ELSEWHERE }], HERE)).toBe(false);
    expect(opensAt([], HERE)).toBe(false);
  });
});

describe("screenLinks", () => {
  it("gives the address, with the Property, of each screen the viewer may open here", async () => {
    screenProperties.mockResolvedValue([{ propertyId: HERE }]);

    expect(
      await screenLinks("en", HERE, ["reservations", "maintenance"]),
    ).toEqual({
      reservations: `/en/reservations?property=${HERE}`,
      maintenance: `/en/maintenance?property=${HERE}`,
    });
  });

  it("gives null for a screen that is open at another Property only, or nowhere", async () => {
    screenProperties
      .mockResolvedValueOnce([{ propertyId: ELSEWHERE }])
      .mockResolvedValueOnce([]);

    expect(await screenLinks("en", HERE, ["people", "hr"])).toEqual({
      people: null,
      hr: null,
    });
  });

  it("asks each screen's own gate, not one gate for all of them", async () => {
    screenProperties.mockResolvedValue([]);

    await screenLinks("tr", HERE, ["people", "room-calendar"]);

    const asked = screenProperties.mock.calls.map(([gate]) => gate);
    expect(asked).toHaveLength(2);
    expect(asked[0]).not.toEqual(asked[1]);
  });

  it("writes the address in the viewer's language", async () => {
    screenProperties.mockResolvedValue([{ propertyId: HERE }]);

    expect((await screenLinks("ar", HERE, ["rooms"])).rooms).toBe(
      `/ar/rooms?property=${HERE}`,
    );
  });
});

describe("holdsAt", () => {
  it("is true when the permission is held at this Property", async () => {
    permittedProperties.mockResolvedValue([{ propertyId: HERE }]);
    expect(await holdsAt("front_desk.book", HERE)).toBe(true);
    expect(permittedProperties).toHaveBeenCalledWith("front_desk.book");
  });

  it("is false when it is held at another Property only", async () => {
    permittedProperties.mockResolvedValue([{ propertyId: ELSEWHERE }]);
    expect(await holdsAt("front_desk.book", HERE)).toBe(false);
  });
});
