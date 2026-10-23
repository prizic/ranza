import { describe, expect, it } from "vitest";
import { negotiateLocale } from "../../apps/guest-portal/src/lib/negotiate-locale";

describe("a Portal link with no language opens in the one the visitor wants", () => {
  it("remembers the language last chosen over what the browser asks for", () => {
    expect(negotiateLocale("ar", "en-GB,en;q=0.9")).toBe("ar");
  });

  it("ignores a remembered language the Portal does not speak", () => {
    expect(negotiateLocale("fr", "en;q=0.9")).toBe("en");
  });

  it("takes the browser's first language the Portal speaks, by quality", () => {
    expect(negotiateLocale(undefined, "de,ar-EG;q=0.8,en;q=0.5")).toBe("ar");
    expect(negotiateLocale(undefined, "en;q=0.4,tr;q=0.9")).toBe("tr");
  });

  it("counts a regional tag as its language and keeps written order for equal quality", () => {
    expect(negotiateLocale(undefined, "en-GB, ar")).toBe("en");
  });

  it("skips a language the browser refuses outright", () => {
    expect(negotiateLocale(undefined, "ar;q=0, en")).toBe("en");
  });

  it("falls back to Turkish when nothing matches or nothing is sent", () => {
    expect(negotiateLocale(undefined, "de,fr")).toBe("tr");
    expect(negotiateLocale(undefined, null)).toBe("tr");
    expect(negotiateLocale(undefined, "")).toBe("tr");
  });
});
