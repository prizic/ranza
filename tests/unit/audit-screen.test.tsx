/**
 * What the audit log says, in the cases the screen decides on its own rather
 * than reading off a record: an action the catalogue has no word for, who a
 * row belongs to, which clock a time is shown on, what a context fact is
 * called, and a record written under an action name that has since changed.
 *
 * Rows AL-S1-09, AL-S1-10, AL-S1-11 and AL-S2-01 in
 * docs/features/audit-log/edge-cases.csv. Presentation only — which records a
 * reader reaches is proved against a real database in
 * tests/integration/audit-log.test.ts and tests/database/audit_location_reach.test.sql.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditEntry, AuditPage } from "../../packages/ranza/core/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { AuditTable } from "../../apps/operator-workspace/src/features/audit-log/components/audit-table";
import { RecordPanel } from "../../apps/operator-workspace/src/features/audit-log/components/record-panel";

const VIEWER = "d6000001-0000-4000-8000-000000000001";
const COLLEAGUE = "d6000001-0000-4000-8000-000000000002";
const STRANGER = "d6000001-0000-4000-8000-000000000003";
const ROOM = "d6000006-0000-4000-8000-000000000001";

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: "d6000009-0000-4000-8000-000000000001",
    organizationId: "d6000002-0000-4000-8000-000000000001",
    locationId: "d6000004-0000-4000-8000-000000000001",
    actorId: VIEWER,
    action: "folio.closed",
    subjectType: "folio",
    subjectId: "d6000003-0000-4000-8000-000000000001",
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
    labels: { [COLLEAGUE]: "ayse@example.test", [ROOM]: "204" },
    locations: {},
    roles: {},
  };
}

function show(entries: AuditEntry[]) {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <AuditTable
        filtered={false}
        locale="en"
        newestHref={null}
        olderHref={null}
        page={pageOf(entries)}
        recordHref="/en/audit-log?property=x"
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

function open(record: AuditEntry) {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RecordPanel
        entry={record}
        folioHref="/en/finance?property=x"
        locale="en"
        names={pageOf([record])}
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("what a row says", () => {
  it("an_unknown_action_renders_as_its_own_name", () => {
    show([entry({ action: "housekeeping.unit_cleaned" })]);
    expect(screen.getByText("housekeeping.unit_cleaned")).toBeInTheDocument();
  });

  it("the_viewer_is_named_and_colleagues_by_address", () => {
    show([
      entry({ id: "d6000009-0000-4000-8000-000000000001" }),
      entry({ id: "d6000009-0000-4000-8000-000000000002", actorId: COLLEAGUE }),
      entry({ id: "d6000009-0000-4000-8000-000000000003", actorId: STRANGER }),
    ]);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("ayse@example.test")).toHaveAttribute(
      "title",
      COLLEAGUE,
    );
    // Somebody the server could not name is still somebody: the first eight
    // characters on the screen, the whole id on the element.
    expect(screen.getByText(STRANGER.slice(0, 8))).toHaveAttribute(
      "title",
      STRANGER,
    );
  });

  it("times_are_shown_in_each_records_own_timezone", () => {
    // 12:22 UTC is 15:22 in Istanbul and 21:22 in Tokyo; the instant on the
    // element is the same either way.
    show([
      entry({ id: "d6000009-0000-4000-8000-000000000001" }),
      entry({
        id: "d6000009-0000-4000-8000-000000000002",
        timeZone: "Asia/Tokyo",
      }),
    ]);
    expect(screen.getByText(/15:22/)).toHaveAttribute(
      "datetime",
      "2026-09-20T12:22:00.000Z",
    );
    expect(screen.getByText(/21:22/)).toHaveAttribute(
      "datetime",
      "2026-09-20T12:22:00.000Z",
    );
  });

  it("says_where_and_says_the_whole_organization_when_nowhere", () => {
    show([
      entry({ id: "d6000009-0000-4000-8000-000000000001" }),
      entry({
        id: "d6000009-0000-4000-8000-000000000002",
        locationId: null,
        propertyName: null,
        action: "staff.role_defined",
        subjectType: "role",
      }),
    ]);
    expect(screen.getByText("Demo Otel İstanbul")).toBeInTheDocument();
    expect(screen.getByText("Whole Organization")).toBeInTheDocument();
  });

  it("reads_a_legacy_role_edit_as_the_permissions_change_it_was", () => {
    // Before ADR 0031, editing a role was written as `staff.role_changed` on a
    // role subject. On a membership it is still somebody's role changing.
    show([
      entry({
        id: "d6000009-0000-4000-8000-000000000001",
        action: "staff.role_changed",
        subjectType: "role",
      }),
      entry({
        id: "d6000009-0000-4000-8000-000000000002",
        action: "staff.role_changed",
        subjectType: "membership",
      }),
    ]);
    expect(screen.getByText("Role permissions changed")).toBeInTheDocument();
    expect(screen.getByText("Role changed")).toBeInTheDocument();
  });

  it("an_empty_log_and_an_empty_filter_say_different_things", () => {
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <AuditTable
          filtered
          locale="en"
          newestHref={null}
          olderHref={null}
          page={pageOf([])}
          recordHref="/en/audit-log?property=x"
          viewerId={VIEWER}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("Nothing matches these filters"),
    ).toBeInTheDocument();
  });
});

describe("what a record's facts say", () => {
  it("money_is_shown_with_its_currency_and_ids_by_name", () => {
    open(
      entry({
        action: "folio.line_reversed",
        reason: "posted to the wrong Stay",
        context: {
          amountMinor: 15000,
          currency: "TRY",
          description: "Minibar drinks",
          accommodationUnitId: ROOM,
        },
      }),
    );
    const facts = screen.getByRole("table");
    expect(within(facts).getByText("Amount")).toBeInTheDocument();
    expect(within(facts).getByText(/150/)).toBeInTheDocument();
    // Text somebody wrote is shown as written, not shortened like an id.
    expect(within(facts).getByText("Minibar drinks")).toBeInTheDocument();
    expect(within(facts).getByText("204")).toBeInTheDocument();
    // The currency is folded into the amount rather than a row of its own.
    expect(within(facts).queryByText("TRY")).not.toBeInTheDocument();
  });

  it("a_role_change_says_from_and_to_by_role_name", () => {
    open(
      entry({
        action: "staff.role_changed",
        subjectType: "membership",
        context: { from: "front_desk", to: "manager", userId: COLLEAGUE },
      }),
    );
    const facts = screen.getByRole("table");
    expect(within(facts).getByText("Front desk")).toBeInTheDocument();
    expect(within(facts).getByText("Manager")).toBeInTheDocument();
    expect(within(facts).getByText("ayse@example.test")).toBeInTheDocument();
  });

  it("a_fact_this_screen_does_not_know_is_shown_as_itself", () => {
    open(entry({ context: { somethingNew: "yes indeed" } }));
    expect(screen.getByText("somethingNew")).toBeInTheDocument();
    expect(screen.getByText("yes indeed")).toBeInTheDocument();
  });
});
