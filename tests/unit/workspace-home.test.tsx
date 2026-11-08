/**
 * Where "up" and "Go to Today" lead at a Property that has Today switched off
 * (audit 2026-11-07, D-01). They used to lead to `/today` regardless, and a
 * Property without Today sent the person to another Property's day, a switch
 * nobody asked for.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { homeSegment } from "../../apps/operator-workspace/src/lib/property-choice";

const { route } = vi.hoisted(() => ({
  route: { pathname: "/en/today", search: "" },
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

const { WorkspacePageBar } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/workspace-page-bar");
const { WorkspaceHomeProvider, HomeButton } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/workspace-home");

const SEGMENTS = {
  kadikoy: ["today", "rooms", "housekeeping"],
  moda: ["rooms", "housekeeping"],
};

function inShell(locale: "en" | "tr" | "ar", children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <WorkspaceHomeProvider
        defaultProperty="kadikoy"
        segmentsByProperty={SEGMENTS}
      >
        {children}
      </WorkspaceHomeProvider>
    </NextIntlClientProvider>,
  );
}

function pageBar(locale: "en" | "tr" | "ar" = "en") {
  inShell(
    locale,
    <WorkspacePageBar
      defaultProperty="kadikoy"
      dormitoryIds={[]}
      locale={locale}
      mode="sidebar"
      reachable={["today", "rooms", "housekeeping"]}
      segmentsByProperty={SEGMENTS}
    />,
  );
}

afterEach(() => {
  cleanup();
  route.pathname = "/en/today";
  route.search = "";
});

describe("homeSegment", () => {
  it("is Today where Today is open", () => {
    expect(homeSegment(["rooms", "today"])).toBe("today");
  });

  it("is the page a switch lands on where Today is off", () => {
    expect(homeSegment(["rooms", "housekeeping"])).toBe("rooms");
  });

  it("is Today for a Property nothing is known about", () => {
    expect(homeSegment(undefined)).toBe("today");
    expect(homeSegment([])).toBe("today");
  });
});

describe("the page bar's way up (D-01)", () => {
  it("D-01: leads to Today, keeping the Property, where Today is open", () => {
    route.pathname = "/en/rooms";
    route.search = "property=kadikoy";
    pageBar();
    expect(
      screen.getByRole("link", { name: messages.en.back }),
    ).toHaveAttribute("href", "/en/today?property=kadikoy");
  });

  it("D-01: leads to the Property's first open page where Today is off", () => {
    route.pathname = "/en/housekeeping";
    route.search = "property=moda";
    pageBar();
    expect(
      screen.getByRole("link", { name: messages.en.back }),
    ).toHaveAttribute("href", "/en/rooms?property=moda");
  });

  it("D-01: has no way up on the page that stands in for Today", () => {
    route.pathname = "/en/rooms";
    route.search = "property=moda";
    pageBar();
    expect(screen.queryByRole("link", { name: messages.en.back })).toBeNull();
  });

  it("D-01: still has none on Today itself", () => {
    pageBar();
    expect(screen.queryByRole("link", { name: messages.en.back })).toBeNull();
  });

  it("D-01: a page that is Today's stand-in at another Property still has a way up here", () => {
    route.pathname = "/en/rooms";
    route.search = "property=kadikoy";
    pageBar();
    expect(
      screen.getByRole("link", { name: messages.en.back }),
    ).toHaveAttribute("href", "/en/today?property=kadikoy");
  });
});

describe("the refusal's way on (D-01)", () => {
  for (const locale of ["en", "tr", "ar"] as const) {
    it(`D-01: ${locale} says Today and links to it where Today is open`, () => {
      route.search = "property=kadikoy";
      inShell(locale, <HomeButton locale={locale} />);
      expect(
        screen.getByRole("link", { name: messages[locale].denied.goToToday }),
      ).toHaveAttribute("href", `/${locale}/today?property=kadikoy`);
    });

    it(`D-01: ${locale} names the page it leads to where Today is off`, () => {
      route.search = "property=moda";
      inShell(locale, <HomeButton locale={locale} />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", `/${locale}/rooms?property=moda`);
      expect(link).toHaveTextContent(messages[locale].navigation.rooms);
      expect(link.textContent).not.toMatch(/[{}]/);
    });
  }
});
