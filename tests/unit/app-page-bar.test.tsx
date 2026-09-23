import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppPageBar } from "../../packages/ui/src";

/**
 * The bar owns the page's one heading. Today and a resident's Stay open with
 * display type of their own and pass `display={false}`; every other page gets
 * its title set large under the bar. Either way there must be exactly one h1,
 * or a screen reader lands on two page names — or none.
 */
describe("AppPageBar", () => {
  afterEach(() => {
    cleanup();
  });

  const crumbs = [{ href: "/en/today", label: "Workspace" }];

  it("sets the title as the page's only h1, under the bar", () => {
    const { container } = render(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        title="Arrivals"
      />,
    );
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.closest("header")).toBeNull();
    expect(
      screen.getByText("Arrivals", { selector: "[aria-current=page]" }),
    ).toBeDefined();
  });

  it("makes the bar's last crumb the h1 when the page sets its own display type", () => {
    const { container } = render(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        display={false}
        title="Today"
      />,
    );
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.closest("header")).not.toBeNull();
    expect(headings[0]?.textContent).toBe("Today");
  });

  it("names the trail as a landmark and keeps the way back as a link", () => {
    render(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        title="Arrivals"
      />,
    );
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(trail.querySelector("a")?.getAttribute("href")).toBe("/en/today");
  });
});
