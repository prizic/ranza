/**
 * What the audit log says a record was, once it is read by a person (the
 * 2026-10-24 audit, DATA-01 to DATA-06): money as a reader means it, the
 * reason in words, the details table with a name for every row, and the list a
 * whole row opens.
 *
 * Presentation only: which records a reader reaches is the database's. Rows
 * AL-S2-15 .. AL-S2-20 in docs/features/audit-log/edge-cases.csv.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditEntry, AuditPage } from "../../packages/ranza/core/src";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { AuditTable } from "../../apps/operator-workspace/src/features/audit-log/components/audit-table";
import { RecordPanel } from "../../apps/operator-workspace/src/features/audit-log/components/record-panel";

const VIEWER = "d6200001-0000-4000-8000-000000000001";
const FOLIO = "d6200003-0000-4000-8000-000000000001";
const PROPERTY = "d6200004-0000-4000-8000-000000000001";
const LINE = "6c80f7c9-0000-4000-8000-000000000001";
const OPENED = { name: "Demo Otel İstanbul", timezone: "Europe/Istanbul" };
const REACH = {
  finance: true,
  rooms: true,
  configuration: true,
  dataExport: true,
};

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: "d6200009-0000-4000-8000-000000000001",
    organizationId: "d6200002-0000-4000-8000-000000000001",
    locationId: PROPERTY,
    actorId: VIEWER,
    action: "folio.payment_posted",
    subjectType: "folio",
    subjectId: FOLIO,
    context: {},
    occurredAt: new Date("2026-09-20T12:22:00Z"),
    propertyName: OPENED.name,
    timeZone: OPENED.timezone,
    ...overrides,
  } as AuditEntry;
}

function pageOf(entries: AuditEntry[]): AuditPage {
  return {
    entries,
    total: entries.length,
    nextCursor: null,
    searchCapped: false,
    subjectSpan: null,
    labels: { [FOLIO]: "Ayşe Yılmaz · 204" },
    locations: {},
    roles: {},
  };
}

function list(entries: AuditEntry[], locale: SupportedLocale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <AuditTable
        filtered={false}
        locale={locale}
        newestHref={null}
        olderHref={null}
        opened={OPENED}
        page={pageOf(entries)}
        propertyId={PROPERTY}
        reach={REACH}
        recordHref="/en/audit-log?property=x"
        today="2026-10-24"
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

function record(entryOpened: AuditEntry, locale: SupportedLocale = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RecordPanel
        entry={entryOpened}
        locale={locale}
        names={pageOf([entryOpened])}
        openedPropertyName={OPENED.name}
        propertyId={PROPERTY}
        reach={REACH}
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

const PAYMENT = entry({
  context: {
    lineId: LINE,
    amountMinor: -273500,
    currency: "TRY",
    description: "Cash at the desk",
    paymentMethod: "cash",
  },
});

describe("DATA-02: a payment posted is money received", () => {
  it("reads without a minus sign in the list and in the details table, in every language", () => {
    for (const locale of supportedLocales) {
      list([PAYMENT], locale);
      const listed = screen.getAllByRole("row")[1]!.textContent!;
      expect(listed, locale).toMatch(/2[.,]735/);
      expect(listed, locale).not.toMatch(/[-−‐]\s?(TRY|₺)?\s?2[.,]735/);
      expect(listed, locale).not.toMatch(/2[.,]735[.,]00\s?[-−]/);
      cleanup();

      record(PAYMENT, locale);
      const amount = screen
        .getAllByRole("row")
        .find((row) => /2[.,]735/.test(row.textContent ?? ""))!;
      expect(amount.textContent, locale).not.toMatch(/[-−‐]/);
      cleanup();
    }
  });

  it("keeps the sign on a reversal, where it says which way the money went", () => {
    list([
      entry({
        action: "folio.line_reversed",
        context: {
          amountMinor: -50000,
          currency: "TRY",
          description: "Minibar",
        },
      }),
    ]);
    expect(screen.getAllByRole("row")[1]!.textContent).toMatch(
      /-\s?TRY\s?500\.00|TRY\s?-500\.00|-500\.00/,
    );
  });
});

describe("DATA-01: every row of the details table says what it is", () => {
  const CHECK_OUT = entry({
    action: "stay.checked_out",
    subjectType: "stay",
    context: {
      folioId: FOLIO,
      // Recorded as text before the writer sent a number: records are never
      // rewritten, so both are read.
      balanceMinor: "0",
      currency: "TRY",
      folioClosed: true,
      earlyDeparture: false,
      nightsCharged: 2,
    },
  });

  it("names the nights charged and puts the currency on a balance recorded as text", () => {
    record(CHECK_OUT);
    const table = screen.getAllByRole("table")[0]!;
    expect(
      within(table).getByText("Nights charged at check-out"),
    ).toBeVisible();
    expect(within(table).queryByText("nightsCharged")).not.toBeInTheDocument();
    const balance = within(table)
      .getByText("Balance at closing")
      .closest("tr")!;
    expect(balance.textContent).toMatch(/TRY\s?0\.00/);
  });

  it("names the rows of the other writers that were printed as their keys", () => {
    record(
      entry({
        action: "business_day.closed",
        subjectType: "property",
        subjectId: PROPERTY,
        context: { roomNightsCharged: 4, roomNightsNotCharged: 1 },
      }),
    );
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).getByText("Room nights charged")).toBeVisible();
    expect(within(table).queryByText("roomNightsCharged")).toBeNull();
  });

  it("does not print the id of a Folio line, which nobody can look up", () => {
    record(PAYMENT);
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).queryByText("Line")).not.toBeInTheDocument();
    expect(table.textContent).not.toContain("6c80f7c9");
    expect(table.textContent).not.toContain("lineId");
  });
});

describe("DATA-04 and DATA-05: the Why column", () => {
  it("keeps the ordinary empty reason quiet: a dash, with the words for a screen reader", () => {
    list([entry({ action: "stay.checked_out", subjectType: "stay" })]);
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("—")).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("No reason required")).toHaveClass("sr-only");
  });

  it("says in words when a reason was required and is missing", () => {
    list([
      entry({
        action: "folio.line_reversed",
        context: { amountMinor: 100, currency: "TRY" },
      }),
    ]);
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("No reason recorded")).toBeVisible();
    expect(within(row).queryByText("—")).toBeNull();
  });

  it("turns the kind in front of a Guest's move into the words the move dialog gave it", () => {
    list([
      entry({
        action: "stay.moved",
        subjectType: "stay",
        reason: "guest_request: QA-C daha sessiz oda istedi",
        context: { reasonKind: "guest_request" },
      }),
    ]);
    expect(
      screen.getByText("The Guest asked: QA-C daha sessiz oda istedi"),
    ).toBeVisible();
    expect(screen.queryByText(/guest_request/)).toBeNull();
    cleanup();

    list(
      [
        entry({
          action: "stay.moved",
          subjectType: "stay",
          reason: "guest_request: QA-C daha sessiz oda istedi",
          context: { reasonKind: "guest_request" },
        }),
      ],
      "tr",
    );
    expect(
      screen.getByText("Misafir istedi: QA-C daha sessiz oda istedi"),
    ).toBeVisible();
  });

  it("shows only the note for another reason, and the kind alone when there is no note", () => {
    list([
      entry({
        action: "stay.moved",
        subjectType: "stay",
        reason: "other: The pipe in 204 burst",
        context: { reasonKind: "other" },
      }),
      entry({
        id: "d6200009-0000-4000-8000-000000000002",
        action: "stay.moved",
        subjectType: "stay",
        reason: "upgrade",
        context: { reasonKind: "upgrade" },
      }),
    ]);
    expect(screen.getByText("The pipe in 204 burst")).toBeVisible();
    expect(screen.getByText("An upgrade")).toBeVisible();
  });

  it("leaves a note alone when its first word only looks like a kind", () => {
    list([
      entry({
        action: "stay.moved",
        subjectType: "stay",
        reason: "fault: told us at the desk",
        context: { reasonKind: "upgrade" },
      }),
      entry({
        id: "d6200009-0000-4000-8000-000000000002",
        action: "folio.line_reversed",
        reason: "fault: wrong guest",
        context: {},
      }),
    ]);
    expect(screen.getByText("fault: told us at the desk")).toBeVisible();
    expect(screen.getByText("fault: wrong guest")).toBeVisible();
  });

  it("reads the same words on the record itself", () => {
    record(
      entry({
        action: "stay.moved",
        subjectType: "stay",
        reason: "guest_request: quieter room",
        context: { reasonKind: "guest_request" },
      }),
    );
    expect(screen.getByText("The Guest asked: quieter room")).toBeVisible();
  });
});

describe("DATA-03 and DATA-06: the whole row opens the record, on a phone too", () => {
  it("stretches the title link over its row and lifts the subject link above it", () => {
    list([PAYMENT]);
    const row = screen.getAllByRole("row")[1]!;
    expect(row).toHaveClass("relative");
    const title = within(row).getByRole("link", { name: /Payment posted/ });
    expect(title).toHaveClass("after:absolute", "after:inset-0");
    const subject = within(row).getByRole("link", { name: /Ayşe Yılmaz/ });
    expect(subject).toHaveClass("relative", "z-10");
  });

  it("lays a row out as a card below sm: no heading row, who and why labelled, nothing to say takes no room", () => {
    list([
      PAYMENT,
      entry({
        id: "d6200009-0000-4000-8000-000000000002",
        action: "stay.moved",
        subjectType: "stay",
        reason: "upgrade",
        context: { reasonKind: "upgrade" },
      }),
    ]);
    const [header, withoutReason, withReason] = screen.getAllByRole("row");
    expect(header!.closest("thead")).toHaveClass("max-sm:hidden");
    expect(withoutReason).toHaveClass("max-sm:grid");

    const cells = (row: HTMLElement) =>
      within(row).getAllByRole("cell", { hidden: true });
    const dash = cells(withoutReason!).at(-1)!;
    expect(dash).toHaveClass("max-sm:hidden");
    const reasonCell = cells(withReason!).at(-1)!;
    expect(reasonCell).not.toHaveClass("max-sm:hidden");
    expect(reasonCell).toHaveAttribute("data-label", "Why");
    expect(cells(withReason!).at(-2)).toHaveAttribute("data-label", "Who");
  });
});
