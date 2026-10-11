/**
 * Which identifiers the two logo routes look up (RANZ-47, BR-S1-40).
 *
 * A route that takes an id from the path decides first whether it is one. The
 * pattern both routes used was the one for UUID versions 1 to 5, which a v7 or
 * a v8 does not match, so a valid Stay would have been a 404 for no reason a
 * database could be asked about. What the routes then answer, and with which
 * headers, is read over HTTP in tests/browser/branding.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoOfStay = vi.fn();
const logoOf = vi.fn();

vi.mock("../../apps/guest-portal/node_modules/server-only", () => ({}));
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/guest-portal/src/server/viewer", () => ({
  currentViewer: async () => ({
    userId: "d9300001-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../../apps/operator-workspace/src/server/viewer", () => ({
  currentViewer: async () => ({
    userId: "d9300001-0000-4000-8000-000000000001",
  }),
}));
vi.mock("../../apps/guest-portal/src/server/composition", () => ({
  getComposition: () => ({ branding: { logoOfStay } }),
}));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ branding: { logoOf } }),
}));

const portal = await import("../../apps/guest-portal/src/server/brand");
const workspace =
  await import("../../apps/operator-workspace/src/server/brand-logo");

const BYTES = new Uint8Array([1, 2, 3]);
const request = new Request("http://localhost/logo");

// One of each version a database can hold, and the nil and max forms.
const UUIDS = {
  v1: "c232ab00-9414-11ec-b3c8-9f6bdeced846",
  v4: "5a8b2c1e-6d3f-4e7a-9b1c-2d4e6f8a0b3c",
  v7: "0190a5c6-7e8f-7abc-8def-0123456789ab",
  v8: "00000000-0000-8000-8000-000000000000",
};

beforeEach(() => {
  logoOfStay.mockReset().mockResolvedValue({
    bytes: BYTES,
    contentType: "image/png",
    hash: "0".repeat(64),
  });
  logoOf.mockReset().mockResolvedValue({
    bytes: BYTES,
    contentType: "image/png",
    hash: "0".repeat(64),
  });
});

describe("the logo routes' identifiers", () => {
  it("BR-S1-40: the Portal's route looks up a Stay named by a UUID of any version", async () => {
    for (const [version, id] of Object.entries(UUIDS)) {
      const answer = await portal.brandLogoResponse(request, id);
      expect(answer.status, version).toBe(200);
      expect(logoOfStay).toHaveBeenLastCalledWith(
        "d9300001-0000-4000-8000-000000000001",
        id,
      );
    }
  });

  it("BR-S1-40: the Workspace's route looks up an Organization named by a UUID of any version", async () => {
    for (const [version, id] of Object.entries(UUIDS)) {
      const answer = await workspace.brandLogoResponse(request, id);
      expect(answer.status, version).toBe(200);
      expect(logoOf).toHaveBeenLastCalledWith(
        "d9300001-0000-4000-8000-000000000001",
        id,
      );
    }
  });

  it("BR-S1-40: and neither looks up anything that is not one", async () => {
    for (const id of [
      "not-a-uuid",
      "",
      "5a8b2c1e6d3f4e7a9b1c2d4e6f8a0b3c",
      `${UUIDS.v4}0`,
    ]) {
      expect((await portal.brandLogoResponse(request, id)).status, id).toBe(
        404,
      );
      expect((await workspace.brandLogoResponse(request, id)).status, id).toBe(
        404,
      );
    }
    expect(logoOfStay).not.toHaveBeenCalled();
    expect(logoOf).not.toHaveBeenCalled();
  });
});
