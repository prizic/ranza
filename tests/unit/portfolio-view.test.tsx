/**
 * The All Properties screen, rendered (docs/features/portfolio, slice 2).
 *
 * The portfolio is given; the read is proved against a database elsewhere. What
 * is decided here is what the screen does with it: that none, one and many
 * Properties each say the right thing, that money a viewer may not read is
 * hidden and never zero, that two currencies stay two lines, that opening a
 * Property remembers it, and that all three languages carry the same words and
 * mirror by construction.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioView } from "../../apps/operator-workspace/src/features/portfolio";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  directionFor,
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import type { Portfolio } from "../../apps/operator-workspace/src/server/portfolio";
import { aPortfolio, aProperty } from "./portfolio-fixtures";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
  search: "property=00000000-0000-4000-8000-0000000000aa",
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  usePathname: () => "/en/portfolio",
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ refresh: navigation.refresh }),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    replace: _replace,
    scroll: _scroll,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
    replace?: boolean;
    scroll?: boolean;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: PortfolioError } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/portfolio/error");
const { default: PortfolioLoading } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/portfolio/loading");

afterEach(() => {
  cleanup();
  document.cookie = "ranza_property=; Max-Age=0; Path=/";
});

function show(
  data: Portfolio,
  locale: SupportedLocale = "en",
  more: {
    sort?: "name" | "occupancy" | "money" | "maintenance" | "arrivals";
    view?: "cards" | "table";
    peopleHref?: string | null;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <div dir={directionFor(locale)}>
        <PortfolioView
          asOf="Figures as of 12:30"
          data={data}
          locale={locale}
          organizationName="Prizic Demo"
          {...more}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

const card = (name: string) =>
  screen.getByRole("heading", { name }).closest("li") as HTMLElement;

describe("all_properties_states", () => {
  it("no_property_says_so_and_links_to_today", () => {
    show(aPortfolio([]));
    expect(
      screen.getByRole("heading", { name: messages.en.portfolio.noneTitle }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: messages.en.portfolio.goToToday,
    });
    expect(link).toHaveAttribute("href", "/en/today");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("one_property_says_there_is_nothing_to_compare_and_links_to_today_at_it", () => {
    const only = aProperty({ propertyName: "Kadıköy" });
    show(aPortfolio([only]));
    expect(
      screen.getByRole("heading", { name: messages.en.portfolio.oneTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You have one Property, Kadıköy/)).toBeVisible();
    // Said as the Owner would say it: not "reach", and who to ask.
    expect(document.body.textContent).not.toMatch(/reach/);
    expect(screen.getByText(/Ask an Owner/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: messages.en.portfolio.goToToday }),
    ).toHaveAttribute(
      "href",
      `/en/today?property=${encodeURIComponent(only.propertyId)}`,
    );
    // No card, no summary: there is nothing beside it.
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(messages.en.portfolio.occupancyTitle)).toBeNull();
  });

  it("FINANCE-15: one_property_tells_somebody_who_gives_staff_access_where_to_do_it_and_not_to_ask_an_owner", () => {
    const only = aProperty({ propertyName: "Kadıköy" });
    for (const locale of ["en", "tr", "ar"] as const) {
      show(aPortfolio([only]), locale, {
        peopleHref: `/${locale}/people?property=${only.propertyId}`,
      });
      const t = messages[locale].portfolio;
      expect(
        screen.getByText(
          t.oneDescriptionStaffAdmin.replace("{property}", "Kadıköy"),
        ),
      ).toBeVisible();
      expect(
        screen.queryByText(t.oneDescription.replace("{property}", "Kadıköy")),
      ).toBeNull();
      expect(screen.getByRole("link", { name: t.openPeople })).toHaveAttribute(
        "href",
        `/${locale}/people?property=${only.propertyId}`,
      );
      expect(screen.getByRole("link", { name: t.goToToday })).toBeVisible();
      cleanup();
    }
    expect(messages.en.portfolio.oneDescriptionStaffAdmin).not.toMatch(
      /Ask an Owner/,
    );
  });

  it("FINANCE-15: one_property_offers_no_people_link_to_somebody_who_cannot_give_access", () => {
    show(aPortfolio([aProperty({ propertyName: "Kadıköy" })]));
    expect(
      screen.queryByRole("link", { name: messages.en.portfolio.openPeople }),
    ).toBeNull();
  });

  it("many_properties_are_one_card_each_in_the_order_read_with_a_summary", () => {
    const a = aProperty({ propertyName: "Beşiktaş" });
    const b = aProperty({ propertyName: "Kadıköy" });
    const c = aProperty({ propertyName: "Moda" });
    show(aPortfolio([a, b, c]));

    const list = screen.getByRole("list", {
      name: messages.en.portfolio.listLabel,
    });
    const names = within(list)
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(["Beşiktaş", "Kadıköy", "Moda"]);

    // Summary: 30 of 60 units, and the percent worked out from them.
    expect(
      screen.getByText(messages.en.portfolio.occupancyTitle),
    ).toBeVisible();
    const occupancyTile = screen.getByRole("group", {
      name: messages.en.portfolio.occupancyTitle,
    });
    expect(within(occupancyTile).getByText("50.0%")).toBeVisible();
    expect(screen.getByText("Figures as of 12:30")).toBeVisible();
    expect(
      screen.getByText("Prizic Demo: every Property side by side."),
    ).toBeVisible();
  });

  it("a_card_reads_its_own_figures_and_business_date", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          occupiedUnits: 12,
          sellableUnits: 20,
          arrivalsToCome: 3,
          departuresToCome: 2,
          openMaintenanceRequests: 4,
          businessDate: "2026-09-16",
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const kadikoy = within(card("Kadıköy"));
    expect(kadikoy.getByText("60.0%", { exact: false })).toBeVisible();
    expect(
      kadikoy.getByText(messages.en.portfolio.arrivals).nextSibling,
    ).toHaveTextContent("3");
    expect(
      kadikoy.getByText(messages.en.portfolio.departures).nextSibling,
    ).toHaveTextContent("2");
    expect(
      kadikoy.getByText(messages.en.portfolio.maintenance).nextSibling,
    ).toHaveTextContent("4");
    expect(kadikoy.getByText(/Business date .*2026/)).toBeVisible();
  });
});

describe("all_properties_withholding", () => {
  it("money_a_viewer_may_not_read_is_hidden_and_never_zero", () => {
    show(
      aPortfolio([
        aProperty({ propertyName: "Kadıköy", openFolioBalanceMinor: null }),
        aProperty({ propertyName: "Moda", openFolioBalanceMinor: null }),
      ]),
    );
    for (const name of ["Kadıköy", "Moda"]) {
      const owed = within(card(name)).getByText(
        messages.en.portfolio.moneyOwed,
      );
      expect(owed.nextSibling).toHaveTextContent(messages.en.portfolio.hidden);
      expect(owed.nextSibling?.textContent).not.toMatch(/0|₺/);
    }
    expect(screen.getByRole("status")).toHaveTextContent(
      messages.en.portfolio.moneyHiddenNotice,
    );
    // The summary tile says hidden too, and shows no amount.
    const tile = screen.getByRole("group", {
      name: messages.en.portfolio.moneyOwedTitle,
    });
    expect(tile).toHaveTextContent(messages.en.portfolio.hidden);
  });

  it("a_zero_balance_is_shown_as_zero_not_as_hidden", () => {
    show(
      aPortfolio([
        aProperty({ propertyName: "Kadıköy", openFolioBalanceMinor: 0 }),
        aProperty({ propertyName: "Moda", openFolioBalanceMinor: 50_000 }),
      ]),
    );
    const owed = within(card("Kadıköy")).getByText(
      messages.en.portfolio.moneyOwed,
    );
    expect(owed.nextSibling?.textContent).toMatch(/0\.00/);
    expect(owed.nextSibling).not.toHaveTextContent(
      messages.en.portfolio.hidden,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a_disabled_module_is_not_available_and_not_hidden", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          openMaintenanceRequests: null,
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const open = within(card("Kadıköy")).getByText(
      messages.en.portfolio.maintenance,
    );
    expect(open.nextSibling).toHaveTextContent(
      messages.en.portfolio.unavailable,
    );
    // The summary says it was counted at one of two Properties.
    expect(screen.getByText("Counted at 1 of 2 Properties")).toBeVisible();
  });

  it("a_property_without_analytics_is_withheld_whole_but_can_still_be_opened", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          entitled: false,
          sellableUnits: null,
          occupiedUnits: null,
          arrivalsToCome: null,
          departuresToCome: null,
          openMaintenanceRequests: null,
          openFolioBalanceMinor: null,
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const withheld = within(card("Kadıköy"));
    expect(withheld.getByText(messages.en.portfolio.withheld)).toBeVisible();
    expect(withheld.queryByText(messages.en.portfolio.arrivals)).toBeNull();
    expect(
      withheld.getByRole("link", { name: "Open Kadıköy" }),
    ).toBeInTheDocument();
    // One Property is withholding; the other still shows money, so no notice.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("two_currencies_are_two_lines_and_each_card_keeps_its_own", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          currency: "TRY",
          openFolioBalanceMinor: 125_000,
        }),
        aProperty({
          propertyName: "Berlin",
          currency: "EUR",
          openFolioBalanceMinor: 40_000,
        }),
      ]),
    );
    const tile = screen.getByRole("group", {
      name: messages.en.portfolio.moneyOwedTitle,
    });
    const lines = within(tile).getAllByRole("listitem");
    expect(lines.map((line) => line.getAttribute("data-currency"))).toEqual([
      "EUR",
      "TRY",
    ]);
    expect(lines[0]).toHaveTextContent("€400.00");
    expect(lines[1]?.textContent).toMatch(/1,250\.00/);
    expect(within(card("Berlin")).getByText("€400.00")).toBeVisible();
  });

  it("no_sellable_units_shows_the_counts_and_a_note_and_no_percentage", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          occupiedUnits: 0,
          sellableUnits: 0,
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const kadikoy = within(card("Kadıköy"));
    expect(
      kadikoy.getByText(messages.en.portfolio.noSellableUnits),
    ).toBeVisible();
    expect(kadikoy.queryByRole("progressbar")).toBeNull();
    expect(kadikoy.queryByText(/%/)).toBeNull();
  });
});

describe("all_properties_open_property", () => {
  it("open_property_remembers_it_and_opens_today_at_it", () => {
    const moda = aProperty({ propertyName: "Moda" });
    show(aPortfolio([aProperty({ propertyName: "Kadıköy" }), moda]));
    const link = within(card("Moda")).getByRole("link", { name: "Open Moda" });
    expect(link).toHaveAttribute(
      "href",
      `/en/today?property=${encodeURIComponent(moda.propertyId)}`,
    );
    // The click is not followed in jsdom; what it leaves behind is the cookie
    // the switcher leaves, which the next page reads (OA-S3-05).
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(document.cookie).toContain(
      `ranza_property=${encodeURIComponent(moda.propertyId)}`,
    );
  });
});

describe("all_properties_in_every_language", () => {
  it("all_properties_reads_in_every_language_and_mirrors", () => {
    const data = aPortfolio([
      aProperty({ propertyName: "Kadıköy", openFolioBalanceMinor: null }),
      aProperty({ propertyName: "Moda", openFolioBalanceMinor: null }),
    ]);
    for (const locale of supportedLocales) {
      const words = messages[locale].portfolio;
      const view = show(data, locale);
      expect(view.container.querySelector("div[dir]")).toHaveAttribute(
        "dir",
        directionFor(locale),
      );
      expect(screen.getByText(words.occupancyTitle)).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent(
        words.moneyHiddenNotice,
      );
      expect(
        screen.getByRole("link", {
          name: words.open.replace("{property}", "Moda"),
        }),
      ).toBeInTheDocument();
      cleanup();
    }
    expect(directionFor("ar")).toBe("rtl");
  });

  it("every_language_has_the_same_words_with_the_same_placeholders", () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const flatten = (
      tree: Record<string, unknown>,
      prefix = "",
    ): [string, string][] =>
      Object.entries(tree).flatMap(([key, value]) =>
        typeof value === "string"
          ? [[`${prefix}${key}`, value] as [string, string]]
          : flatten(value as Record<string, unknown>, `${prefix}${key}.`),
      );
    const english = new Map(flatten(messages.en.portfolio));
    for (const locale of supportedLocales) {
      const words = new Map(flatten(messages[locale].portfolio));
      expect([...words.keys()].sort()).toEqual([...english.keys()].sort());
      for (const [key, text] of english) {
        expect(words.get(key), `${locale}.${key}`).toBeTruthy();
        expect(placeholders(words.get(key)!), `${locale}.${key}`).toEqual(
          placeholders(text),
        );
      }
    }
  });
});

describe("all_properties_loading_and_failure", () => {
  it("loading_is_shapes_and_claims_nothing", () => {
    const { container } = render(<PortfolioLoading />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(container.textContent).toBe("");
  });

  it("a_failed_read_shows_a_retry_and_is_logged_not_swallowed", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const failure = Object.assign(new Error("boom"), { digest: "d-1" });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <PortfolioError error={failure} reset={reset} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: messages.en.portfolio.failedTitle }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: messages.en.portfolio.retry }),
    );
    expect(reset).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("portfolio.render_failed", {
      digest: "d-1",
      error: failure,
    });
    logged.mockRestore();
  });
});

describe("the money tile says where it was counted (PORTFOLIO-02)", () => {
  const tile = () =>
    screen.getByRole("group", { name: messages.en.portfolio.moneyOwedTitle });

  it("says it was counted at one of two Properties when one hides money", () => {
    show(
      aPortfolio([
        aProperty({ propertyName: "Kadıköy", openFolioBalanceMinor: 100_000 }),
        aProperty({ propertyName: "Moda", openFolioBalanceMinor: null }),
      ]),
    );
    expect(tile()).toHaveTextContent("Counted at 1 of 2 Properties");
  });

  it("says nothing when it was counted at every Property", () => {
    show(aPortfolio([aProperty(), aProperty()]));
    expect(tile()).not.toHaveTextContent("Counted at");
  });
});

describe("a card leads with the share and links its figures (PORTFOLIO-01, 04, 07)", () => {
  it("shows the share as the large figure with the count under it, named the same on the tile and the card", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          occupiedUnits: 12,
          sellableUnits: 20,
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const kadikoy = within(card("Kadıköy"));
    expect(card("Kadıköy").querySelector("[data-share]")).toHaveTextContent(
      "60.0%",
    );
    expect(kadikoy.getByText("12 of 20 units in use")).toBeVisible();
    // One name for one measure: Occupancy, on the tile and on the card.
    expect(
      kadikoy.getByText(messages.en.portfolio.cardOccupancy),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("Units in use");
  });

  it("links each figure to the list behind it at that Property, remembering it", () => {
    const moda = aProperty({ propertyName: "Moda" });
    show(aPortfolio([aProperty({ propertyName: "Kadıköy" }), moda]));
    const id = encodeURIComponent(moda.propertyId);
    const inModa = within(card("Moda"));
    const hrefOf = (name: RegExp) =>
      inModa.getByRole("link", { name }).getAttribute("href");
    expect(hrefOf(/Arrivals still to come at Moda/)).toBe(
      `/en/arrivals?property=${id}`,
    );
    expect(hrefOf(/Departures still to come at Moda/)).toBe(
      `/en/departures?property=${id}`,
    );
    expect(hrefOf(/Open maintenance at Moda/)).toBe(
      `/en/maintenance?property=${id}`,
    );
    expect(hrefOf(/Money owed at Moda/)).toBe(
      `/en/finance?property=${id}&show=owing`,
    );

    const link = inModa.getByRole("link", {
      name: /Arrivals still to come at Moda/,
    });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(document.cookie).toContain(`ranza_property=${id}`);
  });

  it("offers no link for a figure the viewer does not have", () => {
    show(
      aPortfolio([
        aProperty({
          propertyName: "Kadıköy",
          openFolioBalanceMinor: null,
          openMaintenanceRequests: null,
        }),
        aProperty({ propertyName: "Moda" }),
      ]),
    );
    const kadikoy = within(card("Kadıköy"));
    expect(kadikoy.queryByRole("link", { name: /Money owed/ })).toBeNull();
    expect(
      kadikoy.queryByRole("link", { name: /Open maintenance/ }),
    ).toBeNull();
    expect(kadikoy.getByRole("link", { name: /Arrivals/ })).toBeInTheDocument();
  });
});

describe("the Properties in an order, and in a table (PORTFOLIO-01, 06)", () => {
  const A = () =>
    aProperty({
      propertyName: "Alfa",
      occupiedUnits: 18,
      sellableUnits: 20,
      openFolioBalanceMinor: 10_000,
      openMaintenanceRequests: 1,
      arrivalsToCome: 1,
    });
  const B = () =>
    aProperty({
      propertyName: "Beta",
      occupiedUnits: 5,
      sellableUnits: 20,
      openFolioBalanceMinor: 900_000,
      openMaintenanceRequests: 9,
      arrivalsToCome: 7,
    });
  const C = () =>
    aProperty({
      propertyName: "Gama",
      occupiedUnits: 10,
      sellableUnits: 20,
      openFolioBalanceMinor: null,
      openMaintenanceRequests: 3,
      arrivalsToCome: 4,
    });
  const order = () =>
    within(screen.getByRole("list", { name: messages.en.portfolio.listLabel }))
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

  it("puts the Property with the lowest occupancy first", () => {
    show(aPortfolio([A(), B(), C()]), "en", { sort: "occupancy" });
    expect(order()).toEqual(["Beta", "Gama", "Alfa"]);
  });

  it("puts the most owed first, and one that hides money last, never first as a zero", () => {
    show(aPortfolio([A(), B(), C()]), "en", { sort: "money" });
    expect(order()).toEqual(["Beta", "Alfa", "Gama"]);
  });

  it("puts the most open maintenance and the most arrivals to come first", () => {
    show(aPortfolio([A(), B(), C()]), "en", { sort: "maintenance" });
    expect(order()).toEqual(["Beta", "Gama", "Alfa"]);
    cleanup();
    show(aPortfolio([A(), B(), C()]), "en", { sort: "arrivals" });
    expect(order()).toEqual(["Beta", "Gama", "Alfa"]);
  });

  it("keeps name order by default", () => {
    show(aPortfolio([C(), A(), B()]));
    expect(order()).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("offers each order as a link that keeps the Property and drops the default", () => {
    show(aPortfolio([A(), B()]), "en", { sort: "occupancy" });
    const nav = screen.getByRole("navigation", { name: "Sort by" });
    expect(
      within(nav).getByRole("link", { name: "Lowest occupancy" }),
    ).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Name" })).toHaveAttribute(
      "href",
      "/en/portfolio?property=00000000-0000-4000-8000-0000000000aa",
    );
    expect(
      within(nav).getByRole("link", { name: "Most owed" }),
    ).toHaveAttribute(
      "href",
      "/en/portfolio?property=00000000-0000-4000-8000-0000000000aa&sort=money",
    );
  });

  it("draws a row for each Property in the table, with the same figures and links", () => {
    show(aPortfolio([A(), B(), C()]), "en", { view: "table", sort: "money" });
    const table = screen.getByRole("table", {
      name: messages.en.portfolio.listLabel,
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "Beta",
      "Alfa",
      "Gama",
    ]);
    expect(rows[0]).toHaveTextContent("25.0%");
    expect(rows[0]).toHaveTextContent("5 of 20 units in use");
    expect(
      within(rows[0]!).getByRole("link", { name: /Money owed at Beta/ }),
    ).toHaveAttribute("href", expect.stringContaining("show=owing"));
    // Hidden is hidden in a row too, and never a zero.
    expect(rows[2]).toHaveTextContent(messages.en.portfolio.hidden);
    expect(
      screen.queryByRole("list", { name: messages.en.portfolio.listLabel }),
    ).toBeNull();
  });

  it("offers cards and table as links that keep the order", () => {
    show(aPortfolio([A(), B()]), "en", { sort: "money" });
    const nav = screen.getByRole("navigation", { name: "Show as" });
    expect(within(nav).getByRole("link", { name: "Table" })).toHaveAttribute(
      "href",
      "/en/portfolio?property=00000000-0000-4000-8000-0000000000aa&view=table",
    );
  });
});

describe("the figures are one read, and can be read again (PORTFOLIO-05)", () => {
  it("reads them again without leaving the page", () => {
    show(aPortfolio([aProperty(), aProperty()]));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });
});
