/**
 * The Finance list: what a row says, how a tab with nothing in it reads, and
 * what a sortable header announces (FIN-01, FIN-02, FIN-03, FIN-10, FIN-11).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { FolioSummary } from "../../packages/ranza/folios/src";
import { supportedLocales } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { FoliosTable } from "../../apps/operator-workspace/src/features/finance/components/folios-table";
import { FolioTabs } from "../../apps/operator-workspace/src/features/finance/components/folio-tabs";
import {
  cancelledLine,
  FOLIO_TABS,
  folioOverdueDays,
  nightsNote,
  parseFolioTab,
} from "../../apps/operator-workspace/src/features/finance/derive";

afterEach(cleanup);

const ROW: FolioSummary = {
  folioId: "d9200007-0000-4000-8000-000000000001",
  propertyId: "d9200007-0000-4000-8000-000000000003",
  stayId: "d9200007-0000-4000-8000-000000000002",
  reservationId: "d9200007-0000-4000-8000-000000000004",
  reference: "R96J74P",
  stayType: "guest",
  status: "open",
  currency: "TRY",
  guestName: "Ada Lovelace",
  unitName: "101",
  startsOn: "2026-10-01",
  endsOn: "2026-10-03",
  chargedMinor: 0,
  paidMinor: 0,
  balanceMinor: 0,
  lineCount: 0,
  lastPostedAt: null,
  roomNightLines: 0,
  stayInHouse: true,
  today: "2026-10-11",
  lastClosedOn: null,
  nightlyRateMinor: 12000,
  pendingNights: 8,
  pendingMinor: 96000,
};

function table(
  folios: readonly FolioSummary[],
  {
    locale = "en",
    tab = "all",
    total = folios.length,
  }: {
    locale?: (typeof supportedLocales)[number];
    tab?: (typeof FOLIO_TABS)[number];
    total?: number;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <FoliosTable
        allHref="/en/finance?property=p"
        folioHref="/en/finance?property=p"
        folios={folios}
        locale={locale}
        tab={tab}
        total={total}
      />
    </NextIntlClientProvider>,
  );
}

describe("a row says whose folio it is and what is owed (FIN-03)", () => {
  it("names the Guest, the room, the booking and the stay, and that the Guest is overdue", () => {
    table([ROW]);
    const row = screen.getByRole("row", { name: /Ada Lovelace/ });
    expect(row).toHaveTextContent("101");
    expect(row).toHaveTextContent("R96J74P");
    expect(row).toHaveTextContent("Oct 1, 2026 – Oct 3, 2026");
    expect(row).toHaveTextContent("Overdue · 8 days");
  });

  it("says what check-out will still charge under the balance, and when anything was last posted", () => {
    table([ROW]);
    const row = screen.getByRole("row", { name: /Ada Lovelace/ });
    expect(row.textContent!.replace(/ /g, " ")).toContain(
      "+ TRY 960.00 for 8 nights at check-out",
    );
    expect(row).toHaveTextContent("Nothing posted yet");
  });

  it("links the row to its folio", () => {
    table([ROW]);
    expect(screen.getByRole("link", { name: /Ada Lovelace/ })).toHaveAttribute(
      "href",
      `/en/finance?property=p&folio=${ROW.folioId}`,
    );
  });

  it("does not call a settled, closed folio overdue or owing", () => {
    table([
      {
        ...ROW,
        status: "closed",
        stayInHouse: false,
        pendingNights: 0,
        pendingMinor: 0,
      },
    ]);
    const row = screen.getByRole("row", { name: /Ada Lovelace/ });
    expect(row).not.toHaveTextContent("Overdue");
    expect(row).not.toHaveTextContent("at check-out");
    expect(row).toHaveTextContent("Closed");
  });
});

describe("a folio is found by what the desk says (FIN-01)", () => {
  const OTHER: FolioSummary = {
    ...ROW,
    folioId: "d9200007-0000-4000-8000-000000000011",
    guestName: "Grace Hopper",
    unitName: "202",
    reference: "RXYZ123",
  };

  it("matches the room and the booking reference as well as the name", () => {
    table([ROW, OTHER]);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "202" } });
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    fireEvent.change(search, { target: { value: "r96j74p" } });
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Grace Hopper")).toBeNull();
  });

  it("says what it searches", () => {
    table([ROW]);
    expect(screen.getByRole("searchbox")).toHaveAttribute(
      "placeholder",
      messages.en.searchGuestRoomReference,
    );
  });
});

describe("a sortable header says what a click will do (FIN-10)", () => {
  for (const locale of supportedLocales) {
    it(`never calls sorting 'next' or 'previous': ${locale}`, () => {
      table([ROW], { locale });
      const guest = screen.getByRole("button", {
        name: new RegExp(messages[locale].guest),
      });
      expect(guest).toHaveAccessibleName(
        `${messages[locale].guest} — ${messages[locale].table.sortAscending}`,
      );
      fireEvent.click(guest);
      expect(guest).toHaveAccessibleName(
        `${messages[locale].guest} — ${messages[locale].table.sortDescending}`,
      );
      fireEvent.click(guest);
      expect(guest).toHaveAccessibleName(
        `${messages[locale].guest} — ${messages[locale].table.clearSort}`,
      );
      expect(guest.getAttribute("aria-label")).not.toContain(
        messages[locale].table.next,
      );
    });
  }
});

describe("a tab with nothing in it is not an empty Property (FIN-02)", () => {
  it.each([
    ["owing", "Nobody owes anything"],
    ["open", "No open folios"],
    ["closed", "No closed folios"],
  ] as const)("the %s tab says %s and offers the whole list", (tab, title) => {
    table([], { tab });
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText("No folios yet")).toBeNull();
    expect(screen.getByRole("link", { name: "Show all" })).toHaveAttribute(
      "href",
      "/en/finance?property=p",
    );
  });

  it("the whole list with nothing in it says there are no folios yet", () => {
    table([], { tab: "all" });
    expect(screen.getByText("No folios yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Show all" })).toBeNull();
  });

  for (const locale of supportedLocales) {
    it(`has every tab's empty words in ${locale}`, () => {
      for (const tab of ["owing", "open", "closed"] as const) {
        table([], { locale, tab });
        expect(
          screen.getByText(messages[locale].finance.empty[`${tab}Title`]),
        ).toBeTruthy();
        cleanup();
      }
    });
  }
});

describe("the tabs", () => {
  const hrefs = {
    all: "/en/finance?property=p",
    owing: "/en/finance?property=p&show=owing",
    open: "/en/finance?property=p&show=open",
    closed: "/en/finance?property=p&show=closed",
  };

  it("are links to the same list narrowed, with the open one marked", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioTabs current="owing" hrefs={hrefs} />
      </NextIntlClientProvider>,
    );
    for (const tab of FOLIO_TABS) {
      const link = screen.getByRole("link", {
        name: messages.en.finance.tabs[tab],
      });
      expect(link).toHaveAttribute("href", hrefs[tab]);
      if (tab === "owing") expect(link).toHaveAttribute("aria-current", "page");
      else expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("is named for a screen reader in every language", () => {
    for (const locale of supportedLocales) {
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <FolioTabs current="all" hrefs={hrefs} />
        </NextIntlClientProvider>,
      );
      expect(
        screen.getByRole("navigation", {
          name: messages[locale].finance.tabsLabel,
        }),
      ).toBeTruthy();
      cleanup();
    }
  });
});

describe("what the screen derives from a folio", () => {
  it("reads ?show= as a tab, and Today's open link as the open tab", () => {
    expect(parseFolioTab("owing")).toBe("owing");
    expect(parseFolioTab("open")).toBe("open");
    expect(parseFolioTab("closed")).toBe("closed");
    expect(parseFolioTab("everything")).toBe("all");
    expect(parseFolioTab(undefined)).toBe("all");
  });

  it("counts overdue days only for a Guest still in house", () => {
    expect(folioOverdueDays(ROW)).toBe(8);
    expect(folioOverdueDays({ ...ROW, stayInHouse: false })).toBe(0);
    expect(folioOverdueDays({ ...ROW, endsOn: null })).toBe(0);
    expect(folioOverdueDays({ ...ROW, endsOn: "2026-10-11" })).toBe(0);
  });

  it("says what a Guest's open folio can say about the nights", () => {
    expect(nightsNote({ ...ROW, roomNightLines: 0 })).toBe("none_yet");
    expect(nightsNote({ ...ROW, roomNightLines: 2 })).toBe("so_far");
    expect(nightsNote({ ...ROW, nightlyRateMinor: null })).toBe("unpriced");
    expect(nightsNote({ ...ROW, status: "closed" })).toBeNull();
    expect(nightsNote({ ...ROW, stayInHouse: false })).toBeNull();
    expect(nightsNote({ ...ROW, stayType: "resident" })).toBeNull();
  });

  it("finds the line a reversal cancels on the same folio", () => {
    const original = { lineId: "a", lineType: "charge", reversesLineId: null };
    const reversal = {
      lineId: "b",
      lineType: "reversal",
      reversesLineId: "a",
    };
    const lines = [original, reversal] as never;
    expect(cancelledLine(reversal, lines)).toBe(original);
    expect(cancelledLine(original, lines)).toBeNull();
    expect(
      cancelledLine({ ...reversal, reversesLineId: "zz" }, lines),
    ).toBeNull();
  });
});
