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

const { default: PortfolioError } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/portfolio/error");
const { default: PortfolioLoading } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/portfolio/loading");

afterEach(() => {
  cleanup();
  document.cookie = "ranza_property=; Max-Age=0; Path=/";
});

function show(data: Portfolio, locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <div dir={directionFor(locale)}>
        <PortfolioView
          asOf="Figures as of 12:30"
          data={data}
          locale={locale}
          organizationName="Prizic Demo"
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
    expect(screen.getByText(/You reach one Property, Kadıköy/)).toBeVisible();
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
    expect(screen.getByText("50.0%")).toBeVisible();
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
    const english = messages.en.portfolio;
    for (const locale of supportedLocales) {
      const words = messages[locale].portfolio;
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        expect(words[key], `${locale}.${key}`).toBeTruthy();
        expect(placeholders(words[key]), `${locale}.${key}`).toEqual(
          placeholders(english[key]),
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
