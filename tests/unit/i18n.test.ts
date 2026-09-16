import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  directionFor,
  isSupportedLocale,
  localeFromPathname,
  localizeHref,
  supportedLocales,
} from "../../packages/i18n/src/index";

describe("supported locales", () => {
  it("launches with Turkish, English and Arabic, Turkish by default", () => {
    expect([...supportedLocales]).toEqual(["tr", "en", "ar"]);
    expect(defaultLocale).toBe("tr");
  });

  it("rejects unsupported and non-string values", () => {
    expect(isSupportedLocale("tr")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe("directionFor", () => {
  it("returns rtl only for Arabic", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("tr")).toBe("ltr");
    expect(directionFor("en")).toBe("ltr");
  });
});

describe("localeFromPathname", () => {
  it("reads the leading segment", () => {
    expect(localeFromPathname("/ar/properties")).toBe("ar");
    expect(localeFromPathname("/en")).toBe("en");
  });

  it("falls back to the default when absent or unsupported", () => {
    expect(localeFromPathname("/")).toBe("tr");
    expect(localeFromPathname("/de/properties")).toBe("tr");
    expect(localeFromPathname("")).toBe("tr");
  });
});

describe("localizeHref", () => {
  it("prefixes the locale without doubling slashes", () => {
    expect(localizeHref("ar", "/properties")).toBe("/ar/properties");
    expect(localizeHref("en", "properties")).toBe("/en/properties");
    expect(localizeHref("tr", "/")).toBe("/tr");
  });
});
