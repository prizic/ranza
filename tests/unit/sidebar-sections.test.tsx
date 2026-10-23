import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar, type NavEntry, type NavLeaf } from "../../packages/ui/src";

const Icon = (() => <svg />) as unknown as NavLeaf["icon"];

// The package resolves its own copy of Next, so both are named.
vi.mock("../../packages/ui/node_modules/next/navigation", () => ({
  usePathname: () => "/en/today",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/today",
}));

const entries: NavEntry[] = [
  { href: "/en/today", icon: Icon, label: "Today", section: "operations" },
  {
    href: "/en/audit-log",
    icon: Icon,
    label: "Audit log",
    section: "system",
  },
  { href: "/en/portfolio", icon: Icon, label: "Portfolio" },
];

function show(sections: Record<string, string> | undefined) {
  render(
    <AppSidebar
      brand={<span>R</span>}
      entries={entries}
      labels={{
        collapse: "Collapse",
        expand: "Expand",
        home: "Ranza",
        mainNavigation: "Main navigation",
        ...(sections ? { sections } : {}),
      }}
      root="/en/today"
    />,
  );
}

/**
 * The sidebar names each group of destinations. A heading a sighted reader
 * sees is a name a screen-reader user hears on the list instead, once.
 */
describe("the sidebar's section headings", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("names a section with its heading, and its list with the same name", () => {
    show({ operations: "Operations", system: "System" });
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("System")).toBeDefined();
    expect(screen.getByRole("list", { name: "Operations" })).toBeDefined();
    expect(screen.getByRole("list", { name: "System" })).toBeDefined();
  });

  it("sets apart, by a rule alone, a section the labels do not name", () => {
    show({ operations: "Operations" });
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.queryByText("System")).toBeNull();
    expect(screen.getAllByRole("list")).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "System" })).toBeNull();
  });

  it("draws no heading at all when the host names none", () => {
    show(undefined);
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.getByText("Today")).toBeDefined();
  });

  it("keeps the names for assistive technology, and drops the words, once folded to icons", async () => {
    localStorage.setItem("ranza-sidebar-collapsed", "true");
    show({ operations: "Operations", system: "System" });
    expect(
      await screen.findByRole("list", { name: "Operations" }),
    ).toBeDefined();
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.queryByText("System")).toBeNull();
  });
});
