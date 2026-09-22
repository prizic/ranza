/**
 * What the audit log says in a cell, in the three cases the screen decides on
 * its own rather than reading off a record: an action the catalogue has no
 * word for, who a row belongs to, and which clock a time is shown on.
 *
 * Rows AL-S1-09, AL-S1-10 and AL-S1-11 in docs/features/audit-log/edge-cases.csv.
 * Presentation only — every business rule the screen relies on is proved
 * against a real database in tests/integration/audit-log.test.ts.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditRecord } from "../../packages/ranza/core/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { AuditTable } from "../../apps/operator-workspace/src/features/audit-log/components/audit-table";

const VIEWER = "d6000001-0000-4000-8000-000000000001";
const COLLEAGUE = "d6000001-0000-4000-8000-000000000002";

function record(overrides: Partial<AuditRecord>): AuditRecord {
  return {
    id: "d6000009-0000-4000-8000-000000000001",
    organizationId: "d6000002-0000-4000-8000-000000000001",
    actorId: VIEWER,
    action: "folio.closed",
    subjectType: "folio",
    subjectId: "d6000003-0000-4000-8000-000000000001",
    context: {},
    occurredAt: new Date("2026-09-20T12:22:00Z"),
    ...overrides,
  };
}

function show(records: AuditRecord[], timeZone = "Europe/Istanbul") {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <AuditTable
        locale="en"
        recordHref="/en/audit-log?property=x"
        records={records}
        timeZone={timeZone}
        total={records.length}
        viewerId={VIEWER}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("what a cell says", () => {
  it("an_unknown_action_renders_as_its_own_name", () => {
    show([record({ action: "housekeeping.unit_cleaned" })]);
    expect(screen.getByText("housekeeping.unit_cleaned")).toBeInTheDocument();
  });

  it("the_viewer_is_named_and_everyone_else_is_an_id", () => {
    show([
      record({ id: "d6000009-0000-4000-8000-000000000001" }),
      record({
        id: "d6000009-0000-4000-8000-000000000002",
        actorId: COLLEAGUE,
      }),
    ]);
    expect(screen.getByText("You")).toBeInTheDocument();
    // The first eight characters on the screen, the whole id on the element.
    const colleague = screen.getByText(COLLEAGUE.slice(0, 8));
    expect(colleague).toHaveAttribute(
      "title",
      expect.stringContaining(COLLEAGUE),
    );
    expect(screen.queryByText(COLLEAGUE)).not.toBeInTheDocument();
  });

  it("times_are_shown_in_the_property_timezone", () => {
    // 12:22 UTC is 15:22 in Istanbul and 21:22 in Tokyo. The instant on the
    // element is the same either way.
    show([record({})], "Europe/Istanbul");
    expect(screen.getByText(/15:22/)).toHaveAttribute(
      "datetime",
      "2026-09-20T12:22:00.000Z",
    );
    show([record({})], "Asia/Tokyo");
    expect(screen.getByText(/21:22/)).toHaveAttribute(
      "datetime",
      "2026-09-20T12:22:00.000Z",
    );
  });
});
