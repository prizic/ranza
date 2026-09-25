import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "../../packages/ui/src";

function open() {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Change language/ }), {
    key: "ArrowDown",
  });
}

describe("LanguageSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the current language's flag in the page bar, and says which it is", () => {
    render(
      <LanguageSwitcher
        currentLocale="tr"
        hrefPattern="/{locale}/today"
        label="Change language"
      />,
    );
    // The flag is decoration; the name is what a screen reader announces.
    const trigger = screen.getByRole("button", {
      name: "Change language: Türkçe",
    });
    expect(trigger.textContent).toContain("🇹🇷");
    expect(trigger.textContent).not.toContain("Türkçe");
  });

  it("names the current language in its own script on the sign-in pill", () => {
    render(
      <LanguageSwitcher
        currentLocale="ar"
        hrefPattern="/{locale}/sign-in"
        label="Change language"
        variant="pill"
      />,
    );
    // The name holds the words on the pill, so saying them reaches it.
    const trigger = screen.getByRole("button", {
      name: "Change language: العربية",
    });
    expect(trigger.textContent).toContain("🇸🇦");
    expect(trigger.textContent).toContain("العربية");
  });

  it("links every language to the same page and marks the current one", () => {
    render(
      <LanguageSwitcher
        currentLocale="en"
        hrefPattern="/{locale}/sign-in"
        label="Change language"
      />,
    );
    open();

    // Exact names: the flag beside each is hidden, so it is not read out as
    // "flag: Turkey" — or as "T R" where the platform draws no flags.
    const turkish = screen.getByRole("menuitem", { name: "Türkçe" });
    expect(turkish.getAttribute("href")).toBe("/tr/sign-in");
    expect(turkish.getAttribute("hreflang")).toBe("tr");
    expect(turkish.getAttribute("aria-current")).toBeNull();

    const english = screen.getByRole("menuitem", { name: "English" });
    expect(english.getAttribute("href")).toBe("/en/sign-in");
    expect(english.getAttribute("aria-current")).toBe("true");
  });

  it("takes each link from the host when it builds them itself", () => {
    render(
      <LanguageSwitcher
        currentLocale="tr"
        getHref={(locale) => `/${locale}/arrivals?property=p-1`}
        label="Change language"
      />,
    );
    open();

    expect(
      screen.getByRole("menuitem", { name: /العربية/ }).getAttribute("href"),
    ).toBe("/ar/arrivals?property=p-1");
  });
});
