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
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitledProperty } from "../../packages/ranza/core/src";

// The helper refuses to be bundled for a browser, which is the point of it
// being server code; a unit test is neither, and the guard has nothing to say.
vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));

// The Property remembered on this device (OA-S3-05), as the request carries it.
let remembered: string | undefined;
vi.mock("../../apps/operator-workspace/node_modules/next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "ranza_property" && remembered !== undefined
        ? { name, value: remembered }
        : undefined,
  }),
}));

// Next's redirect throws; its digest carries where to. Mocked in that shape so
// a test can read the target without a request.
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${to};307;`,
    });
  },
}));

const { frontDeskProperty } =
  await import("../../apps/operator-workspace/src/server/front-desk");

const HERE = "/tr/housekeeping";

/** Where a bare URL was sent, or undefined when the page rendered. */
async function sentTo(
  properties: readonly EntitledProperty[],
  search: Record<string, string | string[] | undefined>,
): Promise<string | undefined> {
  try {
    await frontDeskProperty(properties, search, HERE);
    return undefined;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2];
  }
}

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
  beforeEach(() => {
    remembered = undefined;
  });

  it("shows the Property the URL names when the viewer may use it here", async () => {
    expect(
      await frontDeskProperty(
        [kadikoy, besiktas],
        { property: besiktas.propertyId },
        HERE,
      ),
    ).toBe(besiktas);
  });

  it("shows nothing, not another Property, for one where this screen is switched off", async () => {
    expect(
      await frontDeskProperty([kadikoy, besiktas], { property: moda }, HERE),
    ).toBeUndefined();
  });

  it("answers an unknown or forged id exactly as it answers a switched-off one", async () => {
    expect(
      await frontDeskProperty(
        [kadikoy, besiktas],
        { property: "not-a-property" },
        HERE,
      ),
    ).toBeUndefined();
  });

  it("never redirects a URL that names a Property, listed or not, so it cannot loop", async () => {
    remembered = besiktas.propertyId;
    expect(
      await sentTo([kadikoy, besiktas], { property: "not-a-property" }),
    ).toBeUndefined();
    expect(
      await sentTo([kadikoy, besiktas], { property: kadikoy.propertyId }),
    ).toBeUndefined();
  });

  it("lets ?property= win over the remembered one", async () => {
    remembered = besiktas.propertyId;
    expect(
      await frontDeskProperty(
        [kadikoy, besiktas],
        { property: kadikoy.propertyId },
        HERE,
      ),
    ).toBe(kadikoy);
  });

  it("writes the first Property into the URL when it names none", async () => {
    expect(await sentTo([kadikoy, besiktas], {})).toBe(
      `${HERE}?property=${kadikoy.propertyId}`,
    );
  });

  it("treats an empty ?property= as none named", async () => {
    expect(await sentTo([kadikoy, besiktas], { property: "" })).toBe(
      `${HERE}?property=${kadikoy.propertyId}`,
    );
  });

  it("writes the Property remembered on this device into the URL when this page lists it", async () => {
    remembered = besiktas.propertyId;
    expect(await sentTo([kadikoy, besiktas], {})).toBe(
      `${HERE}?property=${besiktas.propertyId}`,
    );
  });

  it("passes over a remembered Property this screen does not list", async () => {
    remembered = moda;
    expect(await sentTo([kadikoy, besiktas], {})).toBe(
      `${HERE}?property=${kadikoy.propertyId}`,
    );
  });

  it("keeps every other parameter, repeated ones included", async () => {
    const target = new URL(
      (await sentTo([kadikoy, besiktas], {
        from: "2026-09-01",
        actions: ["a", "b"],
      }))!,
      "http://x",
    );
    expect(target.pathname).toBe(HERE);
    expect(target.searchParams.get("from")).toBe("2026-09-01");
    expect(target.searchParams.getAll("actions")).toEqual(["a", "b"]);
    expect(target.searchParams.get("property")).toBe(kadikoy.propertyId);
  });

  it("shows nothing, and sends nowhere, when the viewer may use this screen nowhere", async () => {
    expect(await sentTo([], {})).toBeUndefined();
    expect(await frontDeskProperty([], {}, HERE)).toBeUndefined();
  });
});
