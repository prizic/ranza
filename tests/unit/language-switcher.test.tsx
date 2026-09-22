import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "../../packages/ui/src";

function open() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Change language" }), {
    key: "ArrowDown",
  });
}

describe("LanguageSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the current language's flag in the page bar", () => {
    render(
      <LanguageSwitcher
        currentLocale="tr"
        hrefPattern="/{locale}/today"
        label="Change language"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Change language" });
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
    const trigger = screen.getByRole("button", { name: "Change language" });
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

    const turkish = screen.getByRole("menuitem", { name: /Türkçe/ });
    expect(turkish.getAttribute("href")).toBe("/tr/sign-in");
    expect(turkish.getAttribute("hreflang")).toBe("tr");
    expect(turkish.getAttribute("aria-current")).toBeNull();

    const english = screen.getByRole("menuitem", { name: /English/ });
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
