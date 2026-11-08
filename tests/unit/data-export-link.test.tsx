/**
 * An export the audit log names opens at that export (audit 2026-11-07, C-16):
 * the log's link carries `?show=<id>`, the page keeps it only if the Property
 * holds that export, and the list marks the row. The marking itself is
 * recent-exports-table's (DATA-11); what is asserted here is the way in.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { subjectHref } from "../../apps/operator-workspace/src/features/audit-log/links";
import type {
  DataExportRecord,
  ExportAbilities,
} from "../../apps/operator-workspace/src/features/data-export/types";

vi.mock("../../apps/operator-workspace/src/server/data-export", () => ({
  toggleExportScheduleAction: vi.fn(),
  createExportScheduleAction: vi.fn(),
  requestDataExportAction: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { DataExportView } =
  await import("../../apps/operator-workspace/src/features/data-export/components/data-export-view");

const PROPERTY = "d7100004-0000-4000-8000-000000000001";
const RUN = "d7100005-0000-4000-8000-000000000001";
const OTHER = "d7100005-0000-4000-8000-000000000002";

const ABILITIES: ExportAbilities = {
  mayCreate: true,
  datasets: {
    residents_guests: true,
    reservations_stays: true,
    rooms_beds: true,
    folios_payments: true,
    audit_log: true,
  },
};

function exportRow(id: string): DataExportRecord {
  return {
    id,
    organizationId: "d7100002-0000-4000-8000-000000000001",
    requesterId: "d7100003-0000-4000-8000-000000000001",
    requesterName: "Dilara",
    resourceTypes: ["folios_payments"],
    format: "csv",
    range: null,
    status: "ready",
    triggerType: "manual",
    scheduleId: null,
    fileName: "folios.csv",
    fileSizeBytes: 2048,
    recordCounts: { folios_payments: 12 },
    error: null,
    expiresAt: new Date("2026-11-01T09:00:00Z"),
    requestedAt: new Date("2026-10-24T09:00:00Z"),
    completedAt: new Date("2026-10-24T09:01:00Z"),
    createdAt: new Date("2026-10-24T09:00:00Z"),
    download: "allowed",
  };
}

// jsdom has no layout to scroll; the list scrolls the marked row into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function view(initialShownRun: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <DataExportView
        abilities={ABILITIES}
        exports={[exportRow(RUN), exportRow(OTHER)]}
        initialDraft={null}
        initialShownRun={initialShownRun}
        locale="en"
        organization="Deniz Otelleri"
        propertyId={PROPERTY}
        propertyName="Demo Otel"
        schedules={[]}
        timezone="Europe/Istanbul"
        today="2026-10-25"
        unavailable={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("an export named by the audit log (C-16)", () => {
  const reach = {
    finance: true,
    rooms: true,
    configuration: true,
    dataExport: true,
  };

  it("C-16: the log's link names the export, not just the screen", () => {
    expect(subjectHref("en", PROPERTY, "data_export", RUN, reach)).toBe(
      `/en/data-export?property=${PROPERTY}&show=${RUN}`,
    );
  });

  it("C-16: and is absent for a viewer who may not open the screen", () => {
    expect(
      subjectHref("en", PROPERTY, "data_export", RUN, {
        ...reach,
        dataExport: false,
      }),
    ).toBeNull();
  });

  it("C-16: marks the export it opened at, and only that one", () => {
    view(RUN);
    const marked = screen
      .getAllByRole("row")
      .filter((row) => row.getAttribute("aria-current") === "true");
    expect(marked).toHaveLength(1);
  });

  it("C-16: marks nothing when no export was named", () => {
    view(null);
    expect(
      screen
        .getAllByRole("row")
        .some((row) => row.getAttribute("aria-current") === "true"),
    ).toBe(false);
  });
});
