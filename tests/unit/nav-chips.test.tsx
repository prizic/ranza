import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppPageBar,
  NavChips,
  toChips,
  type NavEntry,
} from "../../packages/ui/src";
import {
  navModeFor,
  TOP_NAV_MAX_PAGES,
} from "../../apps/operator-workspace/src/lib/nav-mode";

/** An icon is a component; nothing here depends on what it draws. */
const Icon = (() => <svg />) as never;
const Home = Icon;
const Sparkles = Icon;
const Wrench = Icon;

const { route, navigation } = vi.hoisted(() => {
  const route = { pathname: "/en/housekeeping" };
  return {
    route,
    navigation: () => ({
      usePathname: () => route.pathname,
      useSearchParams: () => new URLSearchParams(),
    }),
  };
});
vi.mock("next/navigation", navigation);
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);

const CHIPS = [
  { href: "/en/today?property=p1", label: "Today", icon: Home },
  {
    href: "/en/housekeeping?property=p1",
    label: "Housekeeping",
    icon: Sparkles,
  },
  { href: "/en/maintenance?property=p1", label: "Maintenance", icon: Wrench },
];

afterEach(cleanup);

describe("navModeFor (SP-S6-07)", () => {
  it("offers a role's pages as chips up to the limit, and as a sidebar beyond it", () => {
    const pages = (count: number) =>
      Array.from({ length: count }, (_, index) => `page-${index}`);
    expect(navModeFor(pages(0))).toBe("chips");
    expect(navModeFor(pages(TOP_NAV_MAX_PAGES))).toBe("chips");
    expect(navModeFor(pages(TOP_NAV_MAX_PAGES + 1))).toBe("sidebar");
  });
});

describe("toChips (SP-S6-08)", () => {
  it("lists a category's pages in its place, each under its own name, and keeps the order", () => {
    const entries: NavEntry[] = [
      CHIPS[0]!,
      {
        label: "Front Office",
        icon: Home,
        children: [
          { href: "/en/reservations", label: "Reservations", icon: Home },
          { href: "/en/rooms", label: "Rooms", icon: Home },
        ],
      },
      CHIPS[2]!,
    ];
    expect(toChips(entries).map((chip) => chip.label)).toEqual([
      "Today",
      "Reservations",
      "Rooms",
      "Maintenance",
    ]);
  });
});

describe("NavChips (SP-S6-09)", () => {
  it("names its landmark and lists every page as a link that keeps its Property", () => {
    render(<NavChips entries={CHIPS} label="Main navigation" />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelectorAll("a")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Maintenance" })).toHaveAttribute(
      "href",
      "/en/maintenance?property=p1",
    );
  });

  it("marks only the page the person is on, whatever its link carries", () => {
    route.pathname = "/en/housekeeping";
    render(<NavChips entries={CHIPS} label="Main navigation" />);
    expect(screen.getByRole("link", { name: "Housekeeping" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Today" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("stays lit on a page's own sub-route, and not on a page that merely starts the same", () => {
    route.pathname = "/en/housekeeping/rooms";
    render(<NavChips entries={CHIPS} label="Main navigation" />);
    expect(screen.getByRole("link", { name: "Housekeeping" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    cleanup();
    route.pathname = "/en/housekeeping-extra";
    render(<NavChips entries={CHIPS} label="Main navigation" />);
    expect(
      screen
        .getByRole("link", { name: "Housekeeping" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("draws nothing for a role with no pages", () => {
    const { container } = render(<NavChips entries={[]} label="Main" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AppPageBar with chips (SP-S6-10)", () => {
  const bar = (display: boolean) => (
    <AppPageBar
      brand={<span data-testid="brand" />}
      breadcrumbLabel="Breadcrumb"
      chips={<NavChips entries={CHIPS} label="Main navigation" />}
      crumbs={[{ href: "/en/today", label: "Workspace" }]}
      display={display}
      title="Housekeeping"
    />
  );

  it("carries the brand and the chips in the bar, and no breadcrumb trail beside them", () => {
    render(bar(true));
    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByTestId("brand"));
    expect(header).toContainElement(
      screen.getAllByRole("navigation", { name: "Main navigation" })[0]!,
    );
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("still has exactly one h1, under the bar, with the bar's own copy of the name left to assistive technology", () => {
    const { container } = render(bar(true));
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.closest("header")).toBeNull();
  });

  it("keeps the h1 in the bar, unseen, for a page that sets its own display type", () => {
    const { container } = render(bar(false));
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.closest("header")).not.toBeNull();
    expect(headings[0]).toHaveClass("sr-only");
  });
});
