/**
 * A room night on a Folio, as the Finance screen shows it (ADR 0038, RT-S3-14).
 *
 * The database writes "Room night" as a room night's description, in English,
 * because a description is data and a Folio is read in three languages. The
 * panel names the line in the reader's language for the night it is for — and
 * names a reversal of one the same way, because a reversal copies the
 * description of the line it cancels.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolioDetail } from "../../packages/ranza/folios/src";
import { supportedLocales } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/finance", () => ({
  closeFolio: vi.fn(),
  postCharge: vi.fn(),
  reverseLine: vi.fn(),
}));

const { FolioPanel } =
  await import("../../apps/operator-workspace/src/features/finance/components/folio-panel");

afterEach(cleanup);

const FOLIO: FolioDetail = {
  folioId: "d9000007-0000-4000-8000-000000000001",
  stayId: "d9000007-0000-4000-8000-000000000002",
  status: "open",
  currency: "TRY",
  guestName: "Ada Lovelace",
  unitName: "101",
  balanceMinor: 25000,
  lineCount: 4,
  stayInHouse: true,
  lines: [
    {
      lineId: "d9000007-0000-4000-8000-000000000013",
      lineType: "reversal",
      description: "Room night",
      amountMinor: -10000,
      reversesLineId: "d9000007-0000-4000-8000-000000000011",
      reversed: false,
      postedAt: new Date("2026-09-27T09:00:00Z"),
      roomNightOf: null,
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000012",
      lineType: "charge",
      description: "Minibar",
      amountMinor: 15000,
      reversesLineId: null,
      reversed: false,
      postedAt: new Date("2026-09-26T20:00:00Z"),
      roomNightOf: null,
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000011",
      lineType: "charge",
      description: "Room night",
      amountMinor: 10000,
      reversesLineId: null,
      reversed: true,
      postedAt: new Date("2026-09-26T01:05:00Z"),
      roomNightOf: "2026-09-25",
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000010",
      lineType: "charge",
      description: "Room night",
      amountMinor: 10000,
      reversesLineId: null,
      reversed: false,
      postedAt: new Date("2026-09-25T01:05:00Z"),
      roomNightOf: "2026-09-24",
    },
  ],
};

describe("a room night on a Folio", () => {
  it("a_room_night_reads_as_the_night_it_is_for", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel folio={FOLIO} locale="en" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Room night · Sep 24, 2026")).toBeTruthy();
    // The charge and the reversal that cancels it both name the night.
    expect(screen.getAllByText("Room night · Sep 25, 2026")).toHaveLength(2);
    // Anything else keeps what somebody wrote.
    expect(screen.getByText("Minibar")).toBeTruthy();
    expect(screen.queryByText("Room night")).toBeNull();
  });

  for (const locale of supportedLocales) {
    it(`a_room_night_reads_in_every_locale: ${locale}`, () => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <FolioPanel folio={FOLIO} locale={locale} />
        </NextIntlClientProvider>,
      );
      const word = messages[locale].roomNightLine.split(" · ")[0]!;
      expect(screen.getAllByText(new RegExp(`^${word} · `))).toHaveLength(3);
    });
  }
});

describe("closing a Folio (FO-S5-01)", () => {
  it("a Folio whose Guest is in house offers no close, and says why", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel folio={FOLIO} locale="en" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Close folio" })).toBeNull();
    expect(screen.getByText(/The Guest is still in house/)).toBeTruthy();
  });

  it("after check-out it can be closed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel folio={{ ...FOLIO, stayInHouse: false }} locale="en" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Close folio" })).toBeTruthy();
    expect(screen.queryByText(/The Guest is still in house/)).toBeNull();
  });
});
