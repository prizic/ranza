/**
 * Which language the bare address opens in (SIGN-03): the one last used, then
 * the browser's, then Turkish.
 */
import { describe, expect, it } from "vitest";
import {
  openingLocale,
  preferredLocale,
} from "../../apps/operator-workspace/src/lib/locale-choice";

describe("preferredLocale", () => {
  it("SIGN-03: takes the first supported language of the header", () => {
    expect(preferredLocale("en-US,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(preferredLocale("ar")).toBe("ar");
  });

  it("SIGN-03: orders by quality, not by position", () => {
    expect(preferredLocale("tr;q=0.4, ar;q=0.9")).toBe("ar");
  });

  it("SIGN-03: passes over what is not supported, and a language ruled out", () => {
    expect(preferredLocale("de-DE,fr;q=0.9,*;q=0.1")).toBeUndefined();
    expect(preferredLocale("en;q=0, tr;q=0.1")).toBe("tr");
  });

  it("SIGN-03: reads a missing or odd header as no preference", () => {
    expect(preferredLocale(undefined)).toBeUndefined();
    expect(preferredLocale("")).toBeUndefined();
    expect(preferredLocale(";;;,q=x")).toBeUndefined();
  });
});

describe("openingLocale", () => {
  it("SIGN-03: the last language used wins over the browser's", () => {
    expect(openingLocale("ar", "en-US")).toBe("ar");
  });

  it("SIGN-03: then the browser's", () => {
    expect(openingLocale(undefined, "en-GB,en;q=0.9")).toBe("en");
  });

  it("SIGN-03: then Turkish, and a cookie of nonsense is no choice", () => {
    expect(openingLocale(undefined, undefined)).toBe("tr");
    expect(openingLocale("xx", "de")).toBe("tr");
  });
});
