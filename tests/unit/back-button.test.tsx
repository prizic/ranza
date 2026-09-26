import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackButton } from "../../packages/ui/src";

const back = vi.fn();
vi.mock("../../packages/ui/node_modules/next/navigation", () => ({
  useRouter: () => ({
    back,
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function arriveFrom(referrer: string) {
  vi.spyOn(document, "referrer", "get").mockReturnValue(referrer);
  window.history.pushState({}, "", "/en/rooms");
}

describe("BackButton", () => {
  afterEach(() => {
    cleanup();
    back.mockClear();
    vi.restoreAllMocks();
  });

  it("goes back in history when the page was reached from another page of the application", () => {
    arriveFrom(`${window.location.origin}/en/today`);
    render(<BackButton href="/en/today" label="Back" />);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("is a plain link when the page was opened directly", () => {
    arriveFrom("");
    render(<BackButton href="/en/today" label="Back" />);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(back).not.toHaveBeenCalled();
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
