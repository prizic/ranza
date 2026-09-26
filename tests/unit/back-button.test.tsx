import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BackButton } from "../../packages/ui/src";

describe("BackButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("is a link one level up, named for assistive technology", () => {
    render(<BackButton href="/en/today?property=p1" label="Back" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link.getAttribute("href")).toBe("/en/today?property=p1");
    expect(link.getAttribute("title")).toBe("Back");
  });

  it("points its arrow the other way in a right-to-left reading", () => {
    render(<BackButton href="/ar/today" label="رجوع" />);
    const icon = screen
      .getByRole("link", { name: "رجوع" })
      .querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("rtl:rotate-180");
  });
});
