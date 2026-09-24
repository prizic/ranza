/**
 * Which Property a front desk screen shows (HK-S1-24).
 *
 * Every front desk screen, Housekeeping and Finance and the audit log among
 * them, asks this one helper, and the page bar's switcher reads `?property=`
 * on its own. When the two answered differently, a desk opened Housekeeping at
 * a Property where it was switched off and was shown — and could mark —
 * another Property's rooms under the first one's name. Found by the RANZ-28
 * evidence run, 2026-09-24.
 */
import { describe, expect, it, vi } from "vitest";
import type { EntitledProperty } from "../../packages/ranza/core/src";

// The helper refuses to be bundled for a browser, which is the point of it
// being server code; a unit test is neither, and the guard has nothing to say.
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));

const { frontDeskProperty } =
  await import("../../apps/operator-workspace/src/server/front-desk");

function property(propertyId: string, propertyName: string): EntitledProperty {
  return {
    propertyId,
    propertyName,
    timezone: "Europe/Istanbul",
    organizationId: "aa000000-0000-4000-8000-000000000001",
    organizationName: "Kanıt Otelleri",
  };
}

const kadikoy = property("aa000000-0000-4000-8000-000000000011", "Kadıköy");
const besiktas = property("aa000000-0000-4000-8000-000000000012", "Beşiktaş");
// Moda is reachable, but this screen's capability is switched off there, so
// the list the screen asks with does not carry it.
const moda = "aa000000-0000-4000-8000-000000000013";

describe("frontDeskProperty", () => {
  it("opens on the first Property the viewer may use here when none is named", () => {
    expect(frontDeskProperty([kadikoy, besiktas], {})).toBe(kadikoy);
  });

  it("treats an empty ?property= as none named", () => {
    expect(frontDeskProperty([kadikoy, besiktas], { property: "" })).toBe(
      kadikoy,
    );
  });

  it("shows the Property the URL names when the viewer may use it here", () => {
    expect(
      frontDeskProperty([kadikoy, besiktas], { property: besiktas.propertyId }),
    ).toBe(besiktas);
  });

  it("shows nothing, not another Property, for one where this screen is switched off", () => {
    expect(
      frontDeskProperty([kadikoy, besiktas], { property: moda }),
    ).toBeUndefined();
  });

  it("answers an unknown or forged id exactly as it answers a switched-off one", () => {
    expect(
      frontDeskProperty([kadikoy, besiktas], { property: "not-a-property" }),
    ).toBeUndefined();
  });

  it("shows nothing when the viewer may use this screen nowhere", () => {
    expect(frontDeskProperty([], {})).toBeUndefined();
  });
});
