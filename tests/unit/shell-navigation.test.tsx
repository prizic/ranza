/**
 * What the shell tells a person about the places they can go, and about their
 * session ending (SHELL-01, -02, -06, -07, -15). The browser spec proves the
 * same things against a real layout; these hold them without one.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// The workspace is the only package that depends on TanStack Query, and the
// provider under test reaches it through that package. Named by file so this
// test and the provider share one copy: through the folder Vite loads a second,
// and the hook then finds no client.
import { useQuery } from "../../apps/operator-workspace/node_modules/@tanstack/react-query/build/modern/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppBottomNav,
  AppSidebar,
  NavChips,
  type NavEntry,
  type NavLeaf,
} from "../../packages/ui/src";

const Icon = (() => <svg />) as unknown as NavLeaf["icon"];

const { route, navigation } = vi.hoisted(() => {
  const route = { pathname: "/en/today" };
  return {
    route,
    navigation: () => ({
      usePathname: () => route.pathname,
      useSearchParams: () => new URLSearchParams(),
    }),
  };
});
vi.mock("next/navigation", navigation);
vi.mock("../../packages/ui/node_modules/next/navigation", navigation);
vi.mock(
  "../../apps/operator-workspace/node_modules/next/navigation",
  navigation,
);

const { WorkspaceSession } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/workspace-session");

const GROUP_KEY = "ranza-sidebar-closed-groups";

const entries: NavEntry[] = [
  { href: "/en/today", icon: Icon, label: "Today" },
  {
    children: [
      { href: "/en/departures", icon: Icon, label: "Departures" },
      { href: "/en/arrivals", icon: Icon, label: "Arrivals" },
    ],
    icon: Icon,
    label: "Front Office",
  },
];

const labels = {
  collapse: "Collapse",
  expand: "Expand",
  home: "Ranza",
  mainNavigation: "Main navigation",
};

function showSidebar() {
  return render(
    <AppSidebar
      brand={<span>R</span>}
      entries={entries}
      labels={labels}
      root="/en/today"
    />,
  );
}

beforeEach(() => {
  route.pathname = "/en/today";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the sidebar's groups (SHELL-06)", () => {
  it("opens a group nobody has closed, even when the page is not inside it", () => {
    showSidebar();
    expect(screen.getByRole("link", { name: "Departures" })).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: /Front Office/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("remembers a group the person closed, on this device", async () => {
    showSidebar();
    fireEvent.click(screen.getByRole("button", { name: /Front Office/ }));
    expect(screen.queryByRole("link", { name: "Departures" })).toBeNull();
    expect(JSON.parse(localStorage.getItem(GROUP_KEY) ?? "[]")).toEqual([
      "Front Office",
    ]);

    cleanup();
    showSidebar();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Departures" })).toBeNull(),
    );
  });

  it("opens a closed group again when the person goes to a page inside it", async () => {
    localStorage.setItem(GROUP_KEY, JSON.stringify(["Front Office"]));
    route.pathname = "/en/arrivals";
    showSidebar();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Departures" })).toBeDefined(),
    );
  });

  it("starts with every group open when what was stored is not a list", () => {
    localStorage.setItem(GROUP_KEY, "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    showSidebar();
    expect(screen.getByRole("link", { name: "Departures" })).toBeDefined();
  });
});

function sizeScroller(
  property: "scrollHeight" | "scrollWidth",
  client: "clientHeight" | "clientWidth",
  sizes: { content: number; frame: number },
) {
  vi.spyOn(HTMLElement.prototype, property, "get").mockReturnValue(
    sizes.content,
  );
  vi.spyOn(HTMLElement.prototype, client, "get").mockReturnValue(sizes.frame);
}

describe("a list that scrolls says so (SHELL-01, SHELL-02)", () => {
  it("shows a cue at the foot of the sidebar while there is more below it", async () => {
    sizeScroller("scrollHeight", "clientHeight", {
      content: 900,
      frame: 600,
    });
    const { container } = showSidebar();
    await waitFor(() =>
      expect(container.querySelector('[data-cue-end="true"]')).not.toBeNull(),
    );
  });

  it("shows no cue when the whole list fits", () => {
    sizeScroller("scrollHeight", "clientHeight", {
      content: 600,
      frame: 600,
    });
    const { container } = showSidebar();
    expect(container.querySelector('[data-cue-end="true"]')).toBeNull();
  });

  it("shows the dock's far edge while items are out of sight, and not the near one", async () => {
    sizeScroller("scrollWidth", "clientWidth", { content: 1208, frame: 351 });
    render(
      <AppBottomNav
        entries={entries}
        label="Main navigation"
        root="/en/today"
      />,
    );
    const dock = screen.getByRole("navigation", { name: "Main navigation" });
    await waitFor(() => expect(dock.getAttribute("data-cue-end")).toBe("true"));
    expect(dock.getAttribute("data-cue-start")).toBe("false");
  });
});

describe("the page you are on is in view (SHELL-02, SHELL-15)", () => {
  it("scrolls the current chip into view", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    route.pathname = "/en/maintenance";
    render(
      <NavChips
        entries={[
          { href: "/en/today", icon: Icon, label: "Today" },
          { href: "/en/housekeeping", icon: Icon, label: "Housekeeping" },
          { href: "/en/maintenance", icon: Icon, label: "Maintenance" },
        ]}
        label="Pages"
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "center",
    });
  });

  it("scrolls the dock to the current item when it opens", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    route.pathname = "/en/departures";
    render(
      <AppBottomNav
        entries={entries}
        label="Main navigation"
        root="/en/today"
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

function Reader({ status }: { status: number }) {
  const { isError } = useQuery({
    queryFn: () => Promise.reject(Object.assign(new Error("no"), { status })),
    queryKey: ["probe", status],
    retry: false,
  });
  return <p>{isError ? "failed" : "loading"}</p>;
}

function showSession(status: number) {
  return render(
    <WorkspaceSession
      copy={{
        description: "Sign in again to carry on.",
        signIn: "Sign in",
        title: "You were signed out",
      }}
      locale="en"
      scope="user-1"
    >
      <Reader status={status} />
    </WorkspaceSession>,
  );
}

describe("a session that ends while a page is open (SHELL-07)", () => {
  it("opens a dialog that cannot be dismissed when a read is answered 401", async () => {
    window.history.pushState({}, "", "/en/today?property=p1");
    showSession(401);
    const dialog = await screen.findByRole("dialog", {
      name: "You were signed out",
    });
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe(
      "/en/sign-in?next=%2Fen%2Ftoday%3Fproperty%3Dp1",
    );

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("stays quiet for an error that is not the session ending", async () => {
    showSession(500);
    await screen.findByText("failed");
    await act(async () => undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
