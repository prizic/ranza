import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BackButton } from "../../packages/ui/src";

describe("BackButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a link with destination and accessible label", () => {
    render(<BackButton fallbackHref="/en/today" label="Back" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link.getAttribute("href")).toBe("/en/today");
    expect(link.getAttribute("title")).toBe("Back");
  });

  it("prefers explicit href over fallbackHref", () => {
    render(
      <BackButton
        fallbackHref="/en/today"
        href="/en/audit-log"
        label="Return to log"
      />,
    );
    const link = screen.getByRole("link", { name: "Return to log" });
    expect(link.getAttribute("href")).toBe("/en/audit-log");
  });

  it("renders an arrow icon that rotates in RTL", () => {
    const { container } = render(<BackButton fallbackHref="/en/today" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class")).toContain("rtl:rotate-180");
  });
});
