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

  it("TODAY-21: keeps the bar's name of a page with display type of its own on a phone, and hides it only where the title is set under the bar", () => {
    const { container, rerender } = render(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        display={false}
        title="Today"
      />,
    );
    expect(container.querySelector("h1")?.className).not.toContain("sr-only");

    rerender(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        title="Arrivals"
      />,
    );
    expect(
      screen.getByText("Arrivals", { selector: "[aria-current=page]" })
        .className,
    ).toContain("max-sm:sr-only");
  });

  it("HOUSEKEEPING-01: draws the chips twice, inline for a laptop and on a row of their own below it", () => {
    const { container } = render(
      <AppPageBar
        chips={<nav aria-label="Pages" />}
        crumbs={crumbs}
        title="Housekeeping"
      />,
    );
    const rows = container.querySelectorAll("nav[aria-label=Pages]");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.parentElement?.className).toContain("xl:block");
    expect(rows[1]?.parentElement?.className).toContain("xl:hidden");
  });

  it("keeps the section's tabs out of the bar, which holds only the trail and its controls", () => {
    render(
      <AppPageBar
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        tabs={<nav aria-label="Sections" />}
        title="Arrivals"
      />,
    );
    const tabs = screen.getByRole("navigation", { name: "Sections" });
    expect(tabs.closest("header")).toBeNull();
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

  it("renders a leading back button when provided for inner pages", () => {
    render(
      <AppPageBar
        back={<a href="/en/today">Back</a>}
        breadcrumbLabel="Breadcrumb"
        crumbs={crumbs}
        title="Audit log"
      />,
    );
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toBeDefined();
    expect(back.closest("header")).not.toBeNull();
  });
});
