/**
 * What the schedule list and the schedule form say that a person acts on
 * (RANZ-74): why a schedule is paused, and when a new one first runs.
 *
 * Rows EXP-S1-63 in docs/features/data-export/edge-cases.csv. The database
 * pauses a schedule whose creator can no longer export (EXP-S1-33); what is
 * proved here is that the screen says so, and says something else for one
 * paused by hand.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { ExportScheduleRecord } from "../../apps/operator-workspace/src/features/data-export/types";

vi.mock("../../apps/operator-workspace/src/server/data-export", () => ({
  toggleExportScheduleAction: vi.fn(),
  createExportScheduleAction: vi.fn(),
  requestDataExportAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { ExportSchedulesTable } =
  await import("../../apps/operator-workspace/src/features/data-export/components/export-schedules-table");
const { NewScheduleForm } =
  await import("../../apps/operator-workspace/src/features/data-export/components/new-schedule-form");

function schedule(overrides: Partial<ExportScheduleRecord>) {
  return {
    id: "d7000001-0000-4000-8000-000000000001",
    organizationId: "d7000002-0000-4000-8000-000000000001",
    createdBy: "d7000003-0000-4000-8000-000000000001",
    createdByName: "Dilara",
    name: "Weekly accounting export",
    resourceTypes: ["folios_payments"],
    format: "csv",
    frequency: "weekly",
    status: "paused",
    lastRunAt: null,
    lastRunError: null,
    nextRunAt: new Date("2026-10-26T09:00:00Z"),
    createdAt: new Date("2026-10-01T09:00:00Z"),
    ...overrides,
  } satisfies ExportScheduleRecord;
}

function table(schedules: ExportScheduleRecord[]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExportSchedulesTable
        locale="en"
        onNew={() => undefined}
        organization="Deniz Otelleri"
        propertyId="d7000004-0000-4000-8000-000000000001"
        schedules={schedules}
        timezone="Europe/Istanbul"
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("a paused schedule", () => {
  it("EXP-S1-63: says its creator can no longer export when that is why, and that it was paused when it was paused by hand", () => {
    table([
      schedule({ lastRunError: "requester_not_permitted" }),
      schedule({
        id: "d7000001-0000-4000-8000-000000000002",
        name: "Paused for the holiday",
      }),
    ]);
    expect(
      screen.getByText(
        /Paused because Dilara can no longer export these datasets/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Paused. Resume it to run it again."),
    ).toBeVisible();
  });

  it("EXP-S1-63: a schedule that runs shows when, and is not called paused", () => {
    table([schedule({ status: "active" })]);
    expect(screen.getByText(/Next run:/)).toBeVisible();
    expect(screen.queryByText(/Paused/)).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  it("EXP-S1-63: an Organization with none is told how to start one, and the list is not called empty of everything", () => {
    table([]);
    expect(screen.getByText("No schedules yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "New schedule" })).toBeVisible();
  });
});

describe("a new schedule", () => {
  it("EXP-S1-63: says when its first run is, that each run stays seven days and that nobody is emailed", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <NewScheduleForm
          abilities={{
            mayCreate: true,
            datasets: {
              residents_guests: true,
              reservations_stays: true,
              rooms_beds: true,
              folios_payments: true,
              audit_log: true,
            },
          }}
          onCancel={() => undefined}
          onCreated={() => undefined}
          propertyId="d7000004-0000-4000-8000-000000000001"
          timezone="Europe/Istanbul"
        />
      </NextIntlClientProvider>,
    );
    expect(
      await screen.findByText(
        /The first run is about .*, then it repeats every week\./,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/stays for 7 days\. Nobody is emailed/),
    ).toBeVisible();
    // Nothing is chosen to begin with, so nothing can be created yet.
    expect(
      screen.getByRole("button", { name: "Create schedule" }),
    ).toBeDisabled();
  });
});
