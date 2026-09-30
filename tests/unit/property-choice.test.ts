/**
 * Which Property the Workspace works in, and where choosing another lands
 * (OA-S3-05, OA-S3-07). Pure, so every order of URL, remembered choice and
 * reach is asked here; the resolver that reads the cookie is
 * front-desk-property.test.ts, the switcher that writes it
 * property-switcher.test.tsx.
 */
import { describe, expect, it } from "vitest";
import {
  chooseProperty,
  organizationFor,
  switchableProperties,
  switchTarget,
  workingProperty,
} from "../../apps/operator-workspace/src/lib/property-choice";

const kadikoy = { propertyId: "k" };
const besiktas = { propertyId: "b" };

describe("chooseProperty", () => {
  it("opens on the Property remembered on this device when the URL names none", () => {
    expect(chooseProperty([kadikoy, besiktas], undefined, "b")).toBe(besiktas);
  });

  it("lets ?property= win over the remembered choice", () => {
    expect(chooseProperty([kadikoy, besiktas], "k", "b")).toBe(kadikoy);
  });

  it("shows nothing for a ?property= it does not list, whatever is remembered", () => {
    expect(chooseProperty([kadikoy, besiktas], "gone", "b")).toBeUndefined();
  });

  it("falls back to the first, silently, when the remembered Property is out of reach", () => {
    expect(chooseProperty([kadikoy, besiktas], undefined, "gone")).toBe(
      kadikoy,
    );
  });

  it("opens on the first when nothing is remembered", () => {
    expect(chooseProperty([kadikoy, besiktas], undefined, undefined)).toBe(
      kadikoy,
    );
  });

  it("chooses nothing from nothing", () => {
    expect(chooseProperty([], undefined, "k")).toBeUndefined();
  });
});

describe("switchableProperties", () => {
  const property = (
    propertyId: string,
    propertyName: string,
    org = "Deniz",
  ) => ({
    propertyId,
    propertyName,
    organizationName: org,
  });

  it("lists the union of every destination's Properties, each once, with what is open there", () => {
    expect(
      switchableProperties([
        { segment: "today", properties: [property("k", "Kadıköy")] },
        {
          segment: "housekeeping",
          properties: [property("k", "Kadıköy"), property("m", "Moda")],
        },
        { segment: "audit-log", properties: [property("m", "Moda")] },
      ]),
    ).toEqual([
      { ...property("k", "Kadıköy"), segments: ["today", "housekeeping"] },
      { ...property("m", "Moda"), segments: ["housekeeping", "audit-log"] },
    ]);
  });

  it("orders by Organization, then Property", () => {
    expect(
      switchableProperties([
        {
          segment: "today",
          properties: [
            property("z", "Zeytin", "Ada"),
            property("b", "Beşiktaş", "Deniz"),
            property("a", "Arnavutköy", "Deniz"),
          ],
        },
      ]).map((entry) => entry.propertyId),
    ).toEqual(["z", "a", "b"]);
  });

  it("lists nothing when no destination is open anywhere", () => {
    expect(
      switchableProperties([{ segment: "today", properties: [] }]),
    ).toEqual([]);
  });
});

describe("switchTarget", () => {
  it("keeps the page being viewed when it is open at the chosen Property", () => {
    expect(switchTarget("housekeeping", ["today", "housekeeping"])).toBe(
      "housekeeping",
    );
  });

  it("opens Today when the page is not open there", () => {
    expect(switchTarget("finance", ["today", "housekeeping"])).toBe("today");
  });

  it("opens the first destination open there when Today is not either", () => {
    expect(switchTarget("finance", ["housekeeping", "audit-log"])).toBe(
      "housekeeping",
    );
  });
});

describe("workingProperty", () => {
  const moda = { propertyId: "m" };

  it("names the remembered Property when Today is open there", () => {
    expect(
      workingProperty([kadikoy, besiktas], [kadikoy, besiktas, moda], "b"),
    ).toBe(besiktas);
  });

  it("names Today's first, as a bare Today does, when Today is off at the remembered one", () => {
    expect(
      workingProperty([kadikoy, besiktas], [kadikoy, besiktas, moda], "m"),
    ).toBe(kadikoy);
  });

  it("names the remembered one among the rest when the viewer has Today nowhere", () => {
    expect(workingProperty([], [kadikoy, moda], "m")).toBe(moda);
  });

  it("names nothing for a viewer who can use nothing", () => {
    expect(workingProperty([], [], "m")).toBeUndefined();
  });
});

describe("organizationFor", () => {
  const organizations = { k: "Deniz Otelleri", m: "Ada Otelleri" };

  it("names the Organization of the Property the URL names", () => {
    expect(organizationFor("m", organizations, "Deniz Otelleri")).toBe(
      "Ada Otelleri",
    );
  });

  it("names the working Property's when the URL names none, or one it does not list", () => {
    expect(organizationFor(null, organizations, "Deniz Otelleri")).toBe(
      "Deniz Otelleri",
    );
    expect(organizationFor("gone", organizations, "Deniz Otelleri")).toBe(
      "Deniz Otelleri",
    );
  });
});
