import { describe, expect, it } from "vitest";
import {
  calendarDay,
  defaultLocale,
  directionFor,
  formatTime,
  formatWeekday,
  isSupportedLocale,
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

describe("localizeHref", () => {
  it("prefixes the locale without doubling slashes", () => {
    expect(localizeHref("ar", "/properties")).toBe("/ar/properties");
    expect(localizeHref("en", "properties")).toBe("/en/properties");
    expect(localizeHref("tr", "/")).toBe("/tr");
  });
});

describe("Property-local formatting", () => {
  // A Property in Istanbul is already on Tuesday while the reader's own clock
  // still says Monday. The screen must show the Property's day, not the
  // reader's, which is the whole reason these take a timezone.
  const lateMondayUtc = new Date("2026-09-14T22:30:00Z");

  it("names the weekday at the Property, not at the reader", () => {
    expect(formatWeekday(lateMondayUtc, "tr", "Europe/Istanbul")).toBe("Salı");
    expect(formatWeekday(lateMondayUtc, "en", "America/New_York")).toBe(
      "Monday",
    );
  });

  it("gives each language its own weekday name", () => {
    expect(formatWeekday(lateMondayUtc, "ar", "Europe/Istanbul")).toBe(
      "الثلاثاء",
    );
  });

  it("reads the clock at the Property", () => {
    expect(formatTime(lateMondayUtc, "en", "Europe/Istanbul")).toBe("01:30");
    expect(formatTime(lateMondayUtc, "en", "UTC")).toBe("22:30");
  });
});

describe("calendarDay", () => {
  // 22:30 UTC on the 25th is already the 26th in Istanbul and still the 25th
  // in New York — the case a reader's clock gets wrong.
  const lateEvening = new Date("2026-09-25T22:30:00Z");

  it("is the day at the Property, not in UTC", () => {
    expect(calendarDay("Europe/Istanbul", lateEvening)).toBe("2026-09-26");
    expect(calendarDay("America/New_York", lateEvening)).toBe("2026-09-25");
  });

  it("pads the month and day, as a date field submits them", () => {
    expect(calendarDay("UTC", new Date("2026-01-05T12:00:00Z"))).toBe(
      "2026-01-05",
    );
  });
});
