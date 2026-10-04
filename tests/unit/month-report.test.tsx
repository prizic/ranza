/**
 * The month on the analytics screen, rendered (docs/features/analytics, slice 2
 * interface rows AN-S2-20 and AN-S2-21).
 *
 * The report is given — the query is proved against a database elsewhere. What
 * is decided here is what the screen does with it: that a headline shows the
 * division it is, that a month with nothing in it says so instead of showing
 * zero, that a viewer without money sees none anywhere in the page, and that
 * all three languages carry the same words and mirror by construction.
 */
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  directionFor,
  formatMoney,
  formatNumber,
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import type {
  DayRow,
  Figures,
  MonthReport,
  PriorMonth,
} from "../../apps/operator-workspace/src/server/analytics";

vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  usePathname: () => "/en/analytics",
  useSearchParams: () =>
    new URLSearchParams("property=90c161fa-b6e7-4a42-8060-352e23f05a09"),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { MonthReportView } =
  await import("../../apps/operator-workspace/src/features/analytics/components/month-report-view");
const { default: AnalyticsLoading } =
  await import("../../apps/operator-workspace/src/app/[locale]/(workspace)/analytics/loading");

afterEach(cleanup);

const PROPERTY = "90c161fa-b6e7-4a42-8060-352e23f05a09";
const NAME = "Demo Otel İstanbul";

// Ten closed days of twenty available nights, fifteen of them occupied, and
// 5 900.00 of room revenue over 118 charged Guest nights: every division
// below comes out exact, so a reader's pocket calculator agrees with the page.
const CURRENT: Figures = {
  availableNights: 200,
  occupiedNights: 150,
  guestNights: 120,
  residentNights: 30,
  chargedGuestNights: 118,
  occupancyPercent: 75,
  roomRevenue: {
    grossMinor: 600_000,
    correctionsMinor: -10_000,
    netMinor: 590_000,
  },
  otherRevenueMinor: 40_000,
  totalRevenueMinor: 630_000,
  adrMinor: 5_000,
  revParMinor: 2_950,
  collectedMinor: 500_000,
  payments: {
    cashMinor: 300_000,
    cardMinor: 150_000,
    bankTransferMinor: 30_000,
    otherMinor: 20_000,
    totalMinor: 500_000,
  },
  revenueBookedMinor: 630_000,
  differenceMinor: 130_000,
};

const PRIOR: Figures = {
  ...CURRENT,
  occupancyPercent: 70,
  occupiedNights: 140,
  roomRevenue: { grossMinor: 530_000, correctionsMinor: 0, netMinor: 530_000 },
  adrMinor: 4_800,
  revParMinor: 2_650,
  totalRevenueMinor: 570_000,
  otherRevenueMinor: 0,
  collectedMinor: 515_000,
};

function days(month: string, closed: number, total: number): DayRow[] {
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (day <= closed) {
      return {
        date,
        state: "closed" as const,
        occupiedNights: day === 4 ? 0 : 15,
        availableNights: 20,
        occupancyPercent: day === 4 ? 0 : 75,
        roomRevenueMinor: day === 4 ? 0 : 59_000,
      };
    }
    if (day === closed + 1) {
      return {
        date,
        state: "open" as const,
        occupiedNights: 16,
        availableNights: 20,
        occupancyPercent: 80,
        roomRevenueMinor: null,
      };
    }
    return {
      date,
      state: "future" as const,
      occupiedNights: 0,
      availableNights: 20,
      occupancyPercent: null,
      roomRevenueMinor: null,
    };
  });
}

const PRIOR_MONTH: PriorMonth = {
  month: "2026-08",
  figures: PRIOR,
  sameElapsedDays: true,
  changes: {
    occupancyPoints: 5,
    roomRevenuePercent: 11.3,
    otherRevenuePercent: null,
    totalRevenuePercent: 10.5,
    adrPercent: 4.2,
    revParPercent: 11.3,
    collectedPercent: -2.9,
  },
};

const OPEN: MonthReport = {
  propertyId: PROPERTY,
  currency: "TRY",
  mayReadMoney: true,
  today: "2026-09-11",
  month: "2026-09",
  state: "open",
  daysInMonth: 30,
  daysClosed: 10,
  closedThrough: "2026-09-10",
  figures: CURRENT,
  prior: PRIOR_MONTH,
  days: days("2026-09", 10, 30),
  previousMonth: "2026-08",
  nextMonth: null,
};

const CLOSED: MonthReport = {
  ...OPEN,
  month: "2026-08",
  state: "closed",
  daysInMonth: 31,
  daysClosed: 31,
  closedThrough: "2026-08-31",
  prior: { ...PRIOR_MONTH, month: "2026-07", sameElapsedDays: false },
  days: days("2026-08", 31, 31),
  previousMonth: "2026-07",
  nextMonth: "2026-09",
};

const NO_ACTIVITY: MonthReport = {
  ...OPEN,
  month: "2026-03",
  state: "no_activity",
  daysInMonth: 31,
  daysClosed: 0,
  closedThrough: null,
  figures: null,
  prior: null,
  days: [],
  previousMonth: null,
  nextMonth: "2026-04",
};

/** The same month as a viewer without finance.manage_folio receives it. */
function masked(report: MonthReport): MonthReport {
  const hide = (figures: Figures | null): Figures | null =>
    figures && {
      ...figures,
      roomRevenue: null,
      otherRevenueMinor: null,
      totalRevenueMinor: null,
      adrMinor: null,
      revParMinor: null,
      collectedMinor: null,
      payments: null,
      revenueBookedMinor: null,
      differenceMinor: null,
    };
  return {
    ...report,
    mayReadMoney: false,
    figures: hide(report.figures),
    prior: report.prior && {
      ...report.prior,
      figures: hide(report.prior.figures),
      changes: report.prior.changes && {
        ...report.prior.changes,
        roomRevenuePercent: null,
        otherRevenuePercent: null,
        totalRevenuePercent: null,
        adrPercent: null,
        revParPercent: null,
        collectedPercent: null,
      },
    },
    days: report.days.map((day) => ({ ...day, roomRevenueMinor: null })),
  };
}

function show(
  report: MonthReport,
  locale: SupportedLocale = "en",
): ReturnType<typeof render> {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <div dir={directionFor(locale)}>
        <MonthReportView locale={locale} propertyName={NAME} report={report} />
      </div>
    </NextIntlClientProvider>,
  );
}

// Intl separates a currency from its digits with a no-break space, and the
// matcher collapses whitespace in the page's text but not in what it is given.
const plain = (text: string) => text.replace(/\s+/g, " ");
const money = (minor: number, locale: SupportedLocale = "en") =>
  plain(formatMoney(minor, "TRY", locale));
const count = (value: number, locale: SupportedLocale = "en") =>
  plain(formatNumber(value, locale));

/** The text of the figure whose eyebrow label is `label`. */
function figure(label: string): HTMLElement {
  const found = screen
    .getAllByText(label)
    .map((node) => node.closest("[data-figure]"))
    .find((node): node is HTMLElement => node instanceof HTMLElement);
  if (!found) throw new Error(`no figure labelled ${label}`);
  return found;
}

describe("a headline shows its arithmetic (AN-S2-20)", () => {
  it("headline_shows_its_arithmetic", () => {
    show(CLOSED);

    const occupancy = figure("Occupancy");
    expect(occupancy).toHaveTextContent("75.0%");
    expect(occupancy).toHaveTextContent(
      `${count(150)} occupied ÷ ${count(200)} available nights`,
    );

    const adr = figure("Average daily rate (ADR)");
    expect(adr).toHaveTextContent(money(5_000));
    expect(adr).toHaveTextContent(
      `${money(590_000)} room revenue ÷ ${count(118)} charged Guest nights`,
    );

    const revPar = figure("Revenue per available night (RevPAR)");
    expect(revPar).toHaveTextContent(money(2_950));
    expect(revPar).toHaveTextContent(
      `${money(590_000)} room revenue ÷ ${count(200)} available nights`,
    );
  });

  it("states the arithmetic in every language, with that language's numerals", () => {
    for (const locale of supportedLocales) {
      show(CLOSED, locale);
      const adr = screen
        .getAllByText(messages[locale].analytics.month.adr)
        .map((node) => node.closest("[data-figure]"))[0];
      expect(adr).toHaveTextContent(money(590_000, locale));
      expect(adr).toHaveTextContent(count(118, locale));
      cleanup();
    }
  });

  it("says a rate it cannot divide is a dash, with the reason", () => {
    const none: Figures = {
      ...CURRENT,
      chargedGuestNights: 0,
      adrMinor: null,
    };
    show({ ...CLOSED, figures: none });
    const adr = figure("Average daily rate (ADR)");
    expect(adr).toHaveTextContent("—");
    expect(adr).toHaveTextContent("No charged Guest nights");
    expect(adr).not.toHaveTextContent("Infinity");
  });
});

describe("month_screen_empty_loading_refused_and_rtl", () => {
  it("month_screen_empty_loading_refused_and_rtl", () => {
    // Empty: nothing happened is said, and not shown as zero percent.
    show(NO_ACTIVITY);
    expect(screen.getByText("Nothing happened in March 2026")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/%|ADR|RevPAR/);
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();

    // Loading: the route's own boundary, shapes and no words.
    const loading = render(<AnalyticsLoading />);
    expect(loading.container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(loading.container.textContent).toBe("");
    cleanup();

    // Arabic mirrors: the screen's own direction is the layout's.
    const { container } = show(CLOSED, "ar");
    expect(container.querySelector("[dir]")?.getAttribute("dir")).toBe("rtl");
    // That direction is the layout's own: the page never names one itself.
    expect(readFileSync(`${SRC}/app/[locale]/layout.tsx`, "utf8")).toContain(
      "dir={directionFor(locale)}",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("says month to date, and how many days have closed, in an open month", () => {
    show(OPEN);
    expect(
      screen.getByText("Month to date · 10 of 30 days closed"),
    ).toBeVisible();
    expect(
      screen.getByText(/Today is still open: its nights are not charged/),
    ).toBeVisible();
  });

  it("says a closed month is as of today, so a correction can still move it", () => {
    show(CLOSED);
    expect(screen.queryByText(/days closed/)).toBeNull();
    expect(
      screen.getByText(/A correction counts on the night it corrects/),
    ).toBeVisible();
  });

  it("compares with the same elapsed days while the month is open", () => {
    show(OPEN);
    expect(screen.getByText(/same elapsed days of August 2026/)).toBeVisible();
    cleanup();
    show(CLOSED);
    expect(screen.queryByText(/same elapsed days/)).toBeNull();
  });

  it("shows occupancy in points and money in percent, and a dash for a missing change", () => {
    show(CLOSED);
    expect(figure("Occupancy")).toHaveTextContent("+5.0 points");
    expect(figure("Average daily rate (ADR)")).toHaveTextContent("+4.2%");
    const other = screen.getByText("Other revenue (net)").closest("[data-row]");
    expect(other).toHaveTextContent("—");
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it("says there is no earlier month to compare, and shows no change", () => {
    show({
      ...CLOSED,
      prior: {
        month: "2026-07",
        figures: null,
        sameElapsedDays: false,
        changes: null,
      },
    });
    expect(
      screen.getByText("There is no earlier month to compare with."),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/\+5\.0 points/);
  });

  it("gives every day of the month a row, quiet days included", () => {
    show(OPEN);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // header, 30 days, and the month's own total
    expect(rows).toHaveLength(1 + 30 + 1);
    const quiet = rows.find(
      (row) => row.getAttribute("data-date") === "2026-09-04",
    );
    expect(quiet).toBeDefined();
    expect(quiet).toHaveTextContent(money(0));
  });

  it("marks the open day as not yet charged and mutes the days to come", () => {
    show(OPEN);
    const open = document.querySelector("[data-date='2026-09-11']");
    expect(open).toHaveAttribute("data-day-state", "open");
    expect(open).toHaveTextContent("Open day");
    expect(open).toHaveTextContent("Not yet charged");
    const future = document.querySelector("[data-date='2026-09-12']");
    expect(future).toHaveAttribute("data-day-state", "future");
    expect(future).not.toHaveTextContent("Not yet charged");
  });

  it("shows revenue booked, money collected and the change in what Guests owe", () => {
    show(CLOSED);
    expect(screen.getByText("The change in what Guests owe")).toBeVisible();
    const owe = screen
      .getByText("The change in what Guests owe")
      .closest("[data-row]");
    expect(owe).toHaveTextContent(money(130_000));
    expect(screen.getByText(/not a receivables report/i)).toBeVisible();
    expect(screen.getByText("Revenue booked")).toBeVisible();
    expect(screen.getByText("Money collected")).toBeVisible();
  });

  it("splits Guest and Resident nights, and says why a Resident Property reads low", () => {
    show(CLOSED);
    const nights = screen.getByText("Guest nights").closest("[data-row]");
    expect(nights).toHaveTextContent(count(120));
    expect(
      screen.getByText("Resident nights").closest("[data-row]"),
    ).toHaveTextContent(count(30));
    expect(screen.getByText(/Residents are billed monthly/)).toBeVisible();
  });

  it("lists payments by method", () => {
    show(CLOSED);
    for (const [label, minor] of [
      ["Cash", 300_000],
      ["Card", 150_000],
      ["Bank Transfer", 30_000],
      ["Other", 20_000],
    ] as const) {
      expect(screen.getByText(label).closest("[data-row]")).toHaveTextContent(
        money(minor),
      );
    }
  });

  it("shows no money anywhere to a viewer without finance.manage_folio, and says so once", () => {
    const { container } = show(masked(OPEN));
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/₺|TRY|RevPAR|ADR|Revenue booked|collected|Cash/);
    expect(text).not.toContain("•");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      messages.en.analytics.financialsMaskedNotice,
    );
    expect(figure("Occupancy")).toHaveTextContent("75.0%");
    expect(screen.getByRole("table")).not.toHaveTextContent("Room revenue");
    expect(container.querySelector("svg.lucide-lock")).toBeNull();
  });

  it("keeps the Property and drops the range when it moves to another month", () => {
    show(CLOSED);
    const previous = screen.getByRole("link", { name: /Previous month/ });
    expect(previous.getAttribute("href")).toBe(
      `/en/analytics?property=${PROPERTY}&month=2026-07`,
    );
    const next = screen.getByRole("link", { name: /Next month/ });
    expect(next.getAttribute("href")).toBe(
      `/en/analytics?property=${PROPERTY}&month=2026-09`,
    );
  });

  it("offers no next month past the current one, and no previous before the first", () => {
    show(OPEN);
    expect(screen.queryByRole("link", { name: /Next month/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    cleanup();
    show(NO_ACTIVITY);
    expect(screen.queryByRole("link", { name: /Previous month/ })).toBeNull();
  });

  it("keeps today, 7 days and 30 days as a second control, and no month-to-date chip", () => {
    show(OPEN);
    const windows = screen.getByRole("navigation", {
      name: "Reporting period",
    });
    expect(
      within(windows)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Month", "Today", "Last 7 days", "Last 30 days"]);
    expect(within(windows).getByText("Month")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("names the month in the locale's own words", () => {
    show(CLOSED, "tr");
    expect(screen.getByRole("heading", { name: /Ağustos 2026/ })).toBeVisible();
    cleanup();
    show(CLOSED, "ar");
    expect(
      screen.getByRole("heading", {
        name: new Intl.DateTimeFormat("ar-TR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date("2026-08-01T12:00:00Z")),
      }),
    ).toBeVisible();
  });
});

const SRC = "apps/operator-workspace/src";

const component = (name: string): string =>
  readFileSync(`${SRC}/features/analytics/components/${name}.tsx`, "utf8");

const COMPONENTS = [
  "month-report-view",
  "month-header",
  "month-control",
  "headline-figures",
  "money-sections",
  "nights-section",
  "month-days-table",
  "month-section",
  "range-selector",
];

describe("the month screen's source (AN-S2-21)", () => {
  const FILES = COMPONENTS.map((name) => component(name));

  // A class that names a side rather than a direction: it does not mirror.
  const PHYSICAL =
    /(?:^|[\s"'`:])-?(?:(?:m|p)[lr]-|text-(?:left|right)\b|border-[lr]\b|border-[lr]-|rounded-[lr]\b|rounded-[lr]-|(?:left|right)-)/;

  it("names no physical direction, so Arabic mirrors by construction", () => {
    for (const source of FILES) {
      const classes = [
        ...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g),
      ]
        .map((match) => match[1] ?? match[2] ?? "")
        .join(" ");
      expect(classes).not.toMatch(PHYSICAL);
      expect(source).not.toMatch(/\bdir=["']ltr["']/);
    }
  });

  it("writes no CSS and no colour of its own: the theme's tokens only", () => {
    for (const source of FILES) {
      expect(source).not.toMatch(
        /\b(?:text|bg|border)-(?:blue|purple|amber|emerald|rose|red|green)-\d/,
      );
      expect(source).not.toMatch(
        /\bstyle=\{\{[^}]*(?:color|background|gradient)/,
      );
    }
  });
});

describe("the month screen's copy, in three languages (AN-S2-21)", () => {
  type Tree = { [key: string]: string | Tree };
  const keysOf = (tree: Tree, prefix = ""): string[] =>
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string"
        ? [`${prefix}${key}`]
        : keysOf(value, `${prefix}${key}.`),
    );

  it("defines every key in Turkish, English and Arabic alike", () => {
    const english = keysOf(messages.en.analytics as unknown as Tree).sort();
    expect(english).toContain("month.previousMonth");
    for (const locale of ["tr", "ar"] as const) {
      expect(
        keysOf(messages[locale].analytics as unknown as Tree).sort(),
      ).toEqual(english);
    }
  });

  it("leaves no month key unused and no key a component asks for undefined", () => {
    const page = readFileSync(
      `${SRC}/app/[locale]/(workspace)/analytics/page.tsx`,
      "utf8",
    );
    const used = new Set<string>();
    const collect = (source: string, scope: string) => {
      for (const match of source.matchAll(/\b(tm?)\(\s*"([A-Za-z0-9.]+)"/g)) {
        // `tm` reads the whole analytics catalogue; `t` the scope its file opened.
        used.add(match[1] === "tm" ? (match[2] ?? "") : `${scope}${match[2]}`);
      }
      for (const match of source.matchAll(/\blabelKey: "([A-Za-z0-9.]+)"/g)) {
        used.add(match[1] ?? "");
      }
    };
    for (const name of COMPONENTS) {
      const source = component(name);
      collect(
        source,
        /useTranslations\("analytics\.month"\)/.test(source) ? "month." : "",
      );
    }
    // The page asks the whole catalogue, so its analytics keys name themselves.
    for (const match of page.matchAll(
      /\bt\(\s*"analytics\.([A-Za-z0-9.]+)"/g,
    )) {
      used.add(match[1] ?? "");
    }

    const defined = new Set(keysOf(messages.en.analytics as unknown as Tree));
    for (const key of used) expect(defined, key).toContain(key);
    for (const key of [...defined].filter((key) => key.startsWith("month."))) {
      expect(used, key).toContain(key);
    }
  });
});
