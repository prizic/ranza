/**
 * What the audit log says that a person acts on (RANZ-75): the one line that
 * tells a setting change from the next, where a record's subject can be
 * opened, how many places the clock belongs to, and the words a search finds.
 *
 * Rows AL-S2-04 .. AL-S2-11 in docs/features/audit-log/edge-cases.csv.
 * Presentation only; which records a reader reaches is the database's.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { fieldMatches } from "../../packages/ui/src";
import type { AuditEntry, AuditPage } from "../../packages/ranza/core/src";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import {
  actionsNamedBy,
  areaOf,
  AUDIT_AREAS,
  KNOWN_ACTIONS,
} from "../../apps/operator-workspace/src/features/audit-log/actions";
import { AuditTable } from "../../apps/operator-workspace/src/features/audit-log/components/audit-table";
import { RecordPanel } from "../../apps/operator-workspace/src/features/audit-log/components/record-panel";

const OPENED = { name: "Demo Otel İstanbul", timezone: "Europe/Istanbul" };
const VIEWER = "d6100001-0000-4000-8000-000000000001";
const FOLIO = "d6100003-0000-4000-8000-000000000001";
const ROOM = "d6100006-0000-4000-8000-000000000001";
const RESERVATION = "d6100007-0000-4000-8000-000000000001";
const PROPERTY = "d6100004-0000-4000-8000-000000000001";

const REACH = {
  finance: true,
  rooms: true,
  configuration: true,
  dataExport: true,
};
const NO_REACH = {
  finance: false,
  rooms: false,
  configuration: false,
  dataExport: false,
};

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: "d6100009-0000-4000-8000-000000000001",
    organizationId: "d6100002-0000-4000-8000-000000000001",
    locationId: PROPERTY,
    actorId: VIEWER,
    action: "folio.closed",
    subjectType: "folio",
    subjectId: FOLIO,
    context: {},
    occurredAt: new Date("2026-09-20T12:22:00Z"),
    propertyName: "Demo Otel İstanbul",
    timeZone: "Europe/Istanbul",
    ...overrides,
  };
}

function pageOf(entries: AuditEntry[]): AuditPage {
  return {
    entries,
    total: entries.length,
    nextCursor: null,
    searchCapped: false,
    subjectSpan: null,
    labels: { [ROOM]: "204", [FOLIO]: "Ayşe Yılmaz · 204" },
    locations: {},
    roles: {},
  };
}

function show(
  entries: AuditEntry[],
  options: {
    locale?: SupportedLocale;
    reach?: typeof REACH;
  } = {},
) {
  const locale = options.locale ?? "en";
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <AuditTable
        filtered={false}
        locale={locale}
        newestHref={null}
        olderHref={null}
        page={pageOf(entries)}
        propertyId={PROPERTY}
        reach={options.reach ?? REACH}
        recordHref="/en/audit-log?property=x"
        opened={OPENED}
        today="2026-09-21"
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("the line under what happened", () => {
  it("AL-S2-08: a setting switched seven times says to what, so the rows can be told apart", () => {
    show([
      entry({
        id: "d6100009-0000-4000-8000-000000000001",
        action: "housekeeping.inspection_set",
        subjectType: "property",
        subjectId: PROPERTY,
        context: { from: "off", to: "on" },
      }),
      entry({
        id: "d6100009-0000-4000-8000-000000000002",
        action: "housekeeping.inspection_set",
        subjectType: "property",
        subjectId: PROPERTY,
        context: { from: "on", to: "off" },
      }),
    ]);
    expect(screen.getByText("Off → On")).toBeInTheDocument();
    expect(screen.getByText("On → Off")).toBeInTheDocument();
  });

  it("AL-S2-08: a price change names the kind and both prices, and a kind that had none says so", () => {
    show([
      entry({
        action: "price_list.changed",
        subjectType: "property",
        subjectId: PROPERTY,
        context: {
          changes: [
            {
              unitType: "room",
              from: { amountMinor: 150000, currency: "TRY" },
              to: { amountMinor: 175000, currency: "TRY" },
            },
            {
              unitType: "suite",
              from: null,
              to: { amountMinor: 900000, currency: "TRY" },
            },
          ],
        },
      }),
    ]);
    const line = screen.getByText(/Room: /);
    expect(line.textContent).toContain("1,500.00");
    expect(line.textContent).toContain("1,750.00");
    expect(line.textContent).toMatch(/Suite: No price → /);
  });

  it("AL-S2-08: a Property setting names the field and what it was and became", () => {
    show([
      entry({
        action: "property.configured",
        subjectType: "property",
        subjectId: PROPERTY,
        context: {
          changed: ["businessDateCutoff"],
          businessDateCutoff: { from: "04:00", to: "05:00" },
        },
      }),
    ]);
    expect(screen.getByText(/04:00 → 05:00/)).toBeInTheDocument();
  });

  it("AL-S2-08: a Maintenance setting says which question changed, not the raw settings", () => {
    show([
      entry({
        action: "maintenance_setting.changed",
        subjectType: "property",
        subjectId: PROPERTY,
        context: {
          from: {
            assigneeRequired: false,
            returnOnDone: true,
            returnAs: "dirty",
          },
          to: { assigneeRequired: true, returnOnDone: true, returnAs: "dirty" },
        },
      }),
    ]);
    const line = screen.getByText(/→/);
    expect(line.textContent).toContain(
      messages.en.maintenance.assigneeRequired,
    );
    expect(line.textContent).toContain(
      `${messages.en.maintenance.no} → ${messages.en.maintenance.yes}`,
    );
    expect(line.textContent).not.toContain("returnOnDone");
  });

  it("AL-S2-08: a departure change reads as two days, and a day that is missing as not set", () => {
    show([
      entry({
        action: "stay.departure_changed",
        subjectType: "stay",
        subjectId: RESERVATION,
        context: { fromEndsOn: null, toEndsOn: "2026-10-05" },
      }),
    ]);
    expect(screen.getByText(/Not set → .*2026/)).toBeInTheDocument();
  });

  it("AL-S2-08: has no line for a record that is not a setting or a price, and the row is as it was", () => {
    show([entry({ action: "folio.closed" })]);
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  for (const locale of supportedLocales) {
    it(`AL-S2-08: turns the arrow the way ${locale} reads`, () => {
      show(
        [
          entry({
            action: "housekeeping.inspection_set",
            subjectType: "property",
            subjectId: PROPERTY,
            context: { from: "off", to: "on" },
          }),
        ],
        { locale },
      );
      const arrow = locale === "ar" ? "←" : "→";
      expect(document.body.textContent).toContain(arrow);
    });
  }
});

describe("where a record's subject opens", () => {
  it("AL-S2-04: a folio opens Finance and a room opens Rooms, keeping the Property", () => {
    show([
      entry({ id: "d6100009-0000-4000-8000-000000000001" }),
      entry({
        id: "d6100009-0000-4000-8000-000000000002",
        action: "unit.blocked",
        subjectType: "accommodation_unit",
        subjectId: ROOM,
      }),
    ]);
    expect(
      screen.getByRole("link", { name: /Folio · Ayşe Yılmaz · 204/ }),
    ).toHaveAttribute(
      "href",
      `/en/finance?property=${PROPERTY}&folio=${FOLIO}`,
    );
    expect(
      screen.getByRole("link", { name: /Room or bed · 204/ }),
    ).toHaveAttribute("href", `/en/rooms?property=${PROPERTY}&unit=${ROOM}`);
  });

  it("AL-S2-04: a reservation, which no screen shows alone, opens its own history in the log", () => {
    show([
      entry({
        action: "reservation.amended",
        subjectType: "reservation",
        subjectId: RESERVATION,
      }),
    ]);
    expect(
      screen.getByRole("link", { name: /Reservation · / }),
    ).toHaveAttribute(
      "href",
      `/en/audit-log?property=${PROPERTY}&subject=${RESERVATION}`,
    );
  });

  it("AL-S2-04: a subject whose screen the viewer cannot open is text, not a link to a refusal", () => {
    show(
      [
        entry({ id: "d6100009-0000-4000-8000-000000000001" }),
        entry({
          id: "d6100009-0000-4000-8000-000000000002",
          action: "unit.blocked",
          subjectType: "accommodation_unit",
          subjectId: ROOM,
        }),
      ],
      { reach: NO_REACH },
    );
    expect(
      screen.queryByRole("link", { name: /Folio · / }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Room or bed · 204/)).toBeInTheDocument();
  });

  it("AL-S2-05: the record names its subject, links it where it can, and offers every record about it", () => {
    const record = entry({
      action: "reservation.amended",
      subjectType: "reservation",
      subjectId: RESERVATION,
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <RecordPanel
          entry={record}
          locale="en"
          names={pageOf([record])}
          propertyId={PROPERTY}
          reach={REACH}
          openedPropertyName={OPENED.name}
          viewerId={VIEWER}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Every record about this" }),
    ).toHaveAttribute(
      "href",
      `/en/audit-log?property=${PROPERTY}&subject=${RESERVATION}`,
    );
  });
});

describe("the details table", () => {
  it("AL-S2-06: calls a missing departure not set, names every fact of an amendment, and keeps its caption for a screen reader only", () => {
    const record = entry({
      action: "stay.departure_changed",
      subjectType: "stay",
      subjectId: RESERVATION,
      context: {
        changeId: "d6100099-0000-4000-8000-000000000001",
        reservationId: RESERVATION,
        fromEndsOn: null,
        toEndsOn: "2026-10-05",
      },
    });
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <RecordPanel
          entry={record}
          locale="en"
          names={pageOf([record])}
          propertyId={PROPERTY}
          reach={REACH}
          openedPropertyName={OPENED.name}
          viewerId={VIEWER}
        />
      </NextIntlClientProvider>,
    );
    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).getByText("Departure before")).toBeInTheDocument();
    expect(within(table).getByText("Not set")).toBeInTheDocument();
    expect(within(table).getByText("Departure after")).toBeInTheDocument();
    expect(within(table).queryByText("toEndsOn")).not.toBeInTheDocument();
    expect(within(table).queryByText("changeId")).not.toBeInTheDocument();
    expect(table.querySelector("caption")).toHaveClass("sr-only");
  });
});

describe("the clock", () => {
  it("AL-S2-09: names the Property whose clock the one zone is, in words, and says each place's own when there are two", () => {
    show([entry({}), entry({ id: "d6100009-0000-4000-8000-000000000002" })]);
    expect(
      screen.getByRole("columnheader", {
        name: "When (Demo Otel İstanbul time)",
      }),
    ).toBeInTheDocument();
    cleanup();
    show([
      entry({}),
      entry({
        id: "d6100009-0000-4000-8000-000000000002",
        timeZone: "Asia/Tokyo",
      }),
    ]);
    expect(
      screen.getByRole("columnheader", { name: /each place’s own clock/ }),
    ).toBeInTheDocument();
  });

  it("AL-S2-09: never prints a zone's id, which in Arabic is Latin text inside a right-to-left heading", () => {
    for (const locale of supportedLocales) {
      show(
        [
          entry({ propertyName: "North", locationId: PROPERTY }),
          entry({
            id: "d6100009-0000-4000-8000-000000000002",
            propertyName: "South",
          }),
        ],
        { locale },
      );
      const heading = screen.getAllByRole("columnheader")[0]!;
      expect(heading.textContent, locale).not.toMatch(/Europe\//);
      expect(heading.textContent, locale).toMatch(/\(.+\)/);
      cleanup();
    }
  });

  it("AL-S2-09: a time in the current year carries no year, and one in an earlier year does", () => {
    show([
      entry({ occurredAt: new Date("2026-09-20T12:22:00Z") }),
      entry({
        id: "d6100009-0000-4000-8000-000000000002",
        occurredAt: new Date("2025-03-02T09:05:00Z"),
      }),
    ]);
    const [thisYear, earlier] = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("time")!.textContent);
    expect(thisYear).not.toContain("2026");
    expect(earlier).toContain("2025");
  });

  it("AL-S2-09: a record opened by its link says whose clock its time is on, even for the whole Organization", () => {
    const place = entry({});
    const whole = entry({ propertyName: null, locationId: null });
    for (const record of [place, whole]) {
      render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <RecordPanel
            entry={record}
            locale="en"
            names={pageOf([record])}
            openedPropertyName="Opened Hotel"
            propertyId={PROPERTY}
            reach={REACH}
            viewerId={VIEWER}
          />
        </NextIntlClientProvider>,
      );
    }
    expect(screen.getByText("Demo Otel İstanbul time")).toBeInTheDocument();
    expect(screen.getByText("Opened Hotel time")).toBeInTheDocument();
  });
});

describe("the reason", () => {
  it("AL-S2-11: is held to a width of its own and two lines, so it is cut by the cell and not by the table's edge", () => {
    show([entry({ reason: "A long reason ".repeat(30) })]);
    const reason = screen.getByText(/A long reason/);
    expect(reason).toHaveClass("line-clamp-2", "max-w-72");
    expect(reason).not.toHaveClass("max-w-prose");
  });
});

describe("the action filter and the search", () => {
  it("AL-S2-07: every action sits under a heading, and the headings are the ones the screen names", () => {
    for (const action of KNOWN_ACTIONS) {
      expect(AUDIT_AREAS).toContain(areaOf(action));
    }
    expect(new Set(KNOWN_ACTIONS.map(areaOf)).size).toBe(AUDIT_AREAS.length);
    expect(areaOf("invented.thing")).toBe("settings");
  });

  it("AL-S2-07: a word on the screen finds the action it names, in each language", () => {
    const nameIn = (locale: SupportedLocale) => (action: string) =>
      (
        messages[locale].auditAction as unknown as Record<
          string,
          Record<string, string>
        >
      )[action.split(".")[0]!]![action.split(".")[1]!]!;

    expect(actionsNamedBy("rates", nameIn("en"), fieldMatches)).toEqual([
      "price_list.changed",
    ]);
    expect(actionsNamedBy("checked out", nameIn("en"), fieldMatches)).toEqual([
      "stay.checked_out",
    ]);
    // The words are the reader's: Turkish "İPTAL" finds the cancellations.
    expect(actionsNamedBy("İPTAL", nameIn("tr"), fieldMatches)).toContain(
      "reservation.cancelled",
    );
    expect(actionsNamedBy("zzzz", nameIn("en"), fieldMatches)).toEqual([]);
  });

  it("AL-S2-07: one word for a reservation and one for a room, in every language the log is read in", () => {
    for (const locale of supportedLocales) {
      const say = messages[locale];
      const all = JSON.stringify([say.auditAction, say.auditSubject]);
      if (locale === "en") {
        expect(all).not.toMatch(
          /Booking|Accommodation unit|Unit (added|blocked|unblocked)/,
        );
        expect(say.auditAction.business_day.closed).toBe("Day closed");
        expect(say.auditSubject.accommodation_unit).toBe("Room or bed");
      }
    }
  });
});
