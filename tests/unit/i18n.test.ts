import { describe, expect, it } from "vitest";

import {
  defaultLocale,
  directionFor,
  formatDate,
  formatNumber,
  isSupportedLocale,
  localeFromPathname,
  localizeHref,
  messagesFor,
} from "../../packages/i18n/src/index";
import { controlAuthMessagesFor } from "../../packages/i18n/src/control-auth";

describe("locale contract", () => {
  it("defaults locale negotiation to Turkish", () => {
    expect(defaultLocale).toBe("tr");
    expect(localeFromPathname("/")).toBe("tr");
    expect(localeFromPathname("/unknown/path")).toBe("tr");
  });

  it.each([
    ["tr", true],
    ["en", true],
    ["ar", true],
    ["de", false],
    [undefined, false],
  ])("recognizes supported locale %s", (locale, supported) => {
    expect(isSupportedLocale(locale)).toBe(supported);
  });

  it("uses RTL only for Arabic", () => {
    expect(directionFor("tr")).toBe("ltr");
    expect(directionFor("en")).toBe("ltr");
    expect(directionFor("ar")).toBe("rtl");
  });

  it("keeps route destinations inside the selected locale", () => {
    expect(localizeHref("ar", "/maintenance")).toBe("/ar/maintenance");
    expect(localizeHref("en", "/")).toBe("/en");
  });

  it("formats numbers and dates in the selected locale and timezone", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatNumber(1234, "tr")).toBe("1.234");
    expect(
      formatDate(new Date("2026-09-06T09:00:00.000Z"), "en", {
        timeZone: "Europe/Istanbul",
      }),
    ).toContain("Sep");
  });

  it("ships complete shell and recovery messages in every locale", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const messages = messagesFor(locale);
      expect(messages.navigation.home).toBeTruthy();
      expect(messages.states.unexpected.title).toBeTruthy();
      expect(messages.states.maintenance.action).toBeTruthy();
      expect(messages.product.install.title).toBeTruthy();
    }
  });

  it("ships localized control-plane invitation messages", () => {
    const titles = (["tr", "en", "ar"] as const).map((locale) => {
      const messages = controlAuthMessagesFor(locale);
      expect(messages.acceptInvite.action).toBeTruthy();
      expect(messages.setPassword.errors.tooLong).toBeTruthy();
      expect(messages.signIn.invalidInvite).toBeTruthy();
      return messages.acceptInvite.title;
    });
    expect(new Set(titles).size).toBe(3);
  });
});
