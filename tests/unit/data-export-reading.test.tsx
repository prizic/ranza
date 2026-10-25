/**
 * What the data export screen says once it is read by the person who uses it
 * all day (the 2026-10-24 audit, DATA-10 to DATA-14): which clock the days are
 * read on, why the request button is off, whether a ready file is theirs to
 * download, how a schedule's last run ended, and digits that match the page.
 *
 * Rows EXP-S1-64 .. EXP-S1-68 in docs/features/data-export/edge-cases.csv.
 * Presentation only: who may download is the route's and the database's
 * (EXP-S1-33); what is proved here is that the screen stops offering a button
 * that would only send the reader back with a refusal.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { utcOffsetOf } from "../../apps/operator-workspace/src/features/data-export/helpers";
import type {
  DataExportRecord,
  ExportAbilities,
  ExportScheduleRecord,
} from "../../apps/operator-workspace/src/features/data-export/types";

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
const { NewExportForm } =
  await import("../../apps/operator-workspace/src/features/data-export/components/new-export-form");
const { NewScheduleForm } =
  await import("../../apps/operator-workspace/src/features/data-export/components/new-schedule-form");
const { RecentExportsTable } =
  await import("../../apps/operator-workspace/src/features/data-export/components/recent-exports-table");

const PROPERTY = "d7100004-0000-4000-8000-000000000001";
const RUN = "d7100005-0000-4000-8000-000000000001";
const ZONE = "Europe/Istanbul";
const NAME = "Demo Otel İstanbul";

const EVERYTHING: ExportAbilities = {
  mayCreate: true,
  datasets: {
    residents_guests: true,
    reservations_stays: true,
    rooms_beds: true,
    folios_payments: true,
    audit_log: true,
  },
};

afterEach(cleanup);

function exportRow(overrides: Partial<DataExportRecord>): DataExportRecord {
  return {
    id: RUN,
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
    ...overrides,
  };
}

function history(items: DataExportRecord[], shownRun: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RecentExportsTable
        exports={items}
        locale="en"
        onRequestAgain={() => undefined}
        onRequestNew={() => undefined}
        organization="Deniz Otelleri"
        propertyId={PROPERTY}
        shownRun={shownRun}
        timezone={ZONE}
        today="2026-10-25"
      />
    </NextIntlClientProvider>,
  );
}

function schedule(
  overrides: Partial<ExportScheduleRecord>,
): ExportScheduleRecord {
  return {
    id: "d7100001-0000-4000-8000-000000000001",
    organizationId: "d7100002-0000-4000-8000-000000000001",
    createdBy: "d7100003-0000-4000-8000-000000000001",
    createdByName: "Dilara",
    name: "Weekly accounting export",
    resourceTypes: ["folios_payments"],
    format: "csv",
    frequency: "weekly",
    status: "active",
    lastRunAt: null,
    lastRunError: null,
    lastRunId: null,
    lastRunStatus: null,
    nextRunAt: new Date("2026-10-26T09:00:00Z"),
    createdAt: new Date("2026-10-01T09:00:00Z"),
    ...overrides,
  };
}

function schedules(
  items: ExportScheduleRecord[],
  exportIds: string[] = [],
  onShowRun: (id: string) => void = () => undefined,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExportSchedulesTable
        exportIds={exportIds}
        locale="en"
        onNew={() => undefined}
        onShowRun={onShowRun}
        organization="Deniz Otelleri"
        propertyId={PROPERTY}
        schedules={items}
        timezone={ZONE}
      />
    </NextIntlClientProvider>,
  );
}

function exportForm(
  abilities: ExportAbilities,
  draft: Partial<{
    resources: Array<keyof ExportAbilities["datasets"]>;
    range: { from: string | null; to: string | null } | null;
  }> = {},
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <NewExportForm
        abilities={abilities}
        draft={{
          resources: draft.resources ?? [],
          format: "csv",
          range: draft.range ?? null,
        }}
        onCancel={() => undefined}
        onRequested={() => undefined}
        organization="Deniz Otelleri"
        propertyId={PROPERTY}
        propertyName={NAME}
        timezone={ZONE}
        today="2026-10-25"
      />
    </NextIntlClientProvider>,
  );
}

describe("DATA-10: a ready file is offered only to the person who can download it", () => {
  it("offers the button to the requester, and to a role that reaches every Property", () => {
    history([exportRow({ download: "allowed" })]);
    expect(screen.getByRole("link", { name: /Download/ })).toHaveAttribute(
      "href",
      expect.stringContaining(`/api/data-export/${RUN}/download`),
    );
  });

  it("names the person whose file it is instead of a button that would be refused", () => {
    history([exportRow({ download: "not_requester" })]);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect(
      screen.getByText(
        "Only Dilara, or someone whose role reaches every Property, can download this file.",
      ),
    ).toBeVisible();
  });

  it("says so when the viewer's own role lacks the datasets", () => {
    history([exportRow({ download: "role_lacks_datasets" })]);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect(
      screen.getByText(
        "Your role cannot export these datasets, so it cannot download this file.",
      ),
    ).toBeVisible();
  });

  it("leaves a file that is not ready without either, whoever looks", () => {
    history([
      exportRow({ status: "expired", download: "not_requester" }),
      exportRow({
        id: "d7100005-0000-4000-8000-000000000002",
        status: "failed",
        error: "too_large",
        download: "not_requester",
      }),
    ]);
    expect(screen.queryByText(/can download this file/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
});

describe("DATA-11: a schedule says how its last run ended", () => {
  it("says it has not run yet when it has not", () => {
    schedules([schedule({})]);
    expect(screen.getByText("Not run yet")).toBeVisible();
    expect(screen.queryByText(/Last run:/)).toBeNull();
  });

  it("shows when the last run was and that it is ready, with a way to History when the run is listed there", () => {
    const onShowRun = vi.fn();
    schedules(
      [
        schedule({
          lastRunAt: new Date("2026-10-19T09:00:00Z"),
          lastRunId: RUN,
          lastRunStatus: "ready",
        }),
      ],
      [RUN],
      onShowRun,
    );
    const status = screen.getByText(/Last run:/);
    expect(status.textContent).toMatch(/Ready/);
    screen.getByRole("button", { name: "Show in History" }).click();
    expect(onShowRun).toHaveBeenCalledWith(RUN);
  });

  it("says why a run failed, in the same words History uses, on a schedule that still runs", () => {
    schedules([
      schedule({
        lastRunAt: new Date("2026-10-19T09:00:00Z"),
        lastRunId: RUN,
        lastRunStatus: "failed",
        lastRunError: "too_large",
      }),
    ]);
    const status = screen.getByText(/Last run:/);
    expect(status.textContent).toMatch(/Failed/);
    expect(status).toHaveClass("text-destructive");
    expect(screen.getByText(/too large|more than/i)).toBeVisible();
  });

  it("does not say the reason twice for a schedule paused because its creator lost the right", () => {
    schedules([
      schedule({
        status: "paused",
        lastRunAt: new Date("2026-10-19T09:00:00Z"),
        lastRunId: RUN,
        lastRunStatus: "failed",
        lastRunError: "requester_not_permitted",
      }),
    ]);
    expect(
      screen.getAllByText(/can no longer export|cannot export/i),
    ).toHaveLength(1);
  });

  it("shows a run that is still being made as what it is, not as a failure", () => {
    schedules([
      schedule({
        lastRunAt: new Date("2026-10-19T09:00:00Z"),
        lastRunId: RUN,
        lastRunStatus: "processing",
      }),
    ]);
    const status = screen.getByText(/Last run:/);
    expect(status.textContent).toMatch(/Preparing|Processing/i);
    expect(status).not.toHaveClass("text-destructive");
  });

  it("offers no way to History for a run older than the fifty History lists", () => {
    schedules(
      [
        schedule({
          lastRunAt: new Date("2026-06-01T09:00:00Z"),
          lastRunId: RUN,
          lastRunStatus: "expired",
        }),
      ],
      [],
    );
    expect(screen.getByText(/Last run:/).textContent).toMatch(/Expired/);
    expect(
      screen.queryByRole("button", { name: "Show in History" }),
    ).toBeNull();
  });

  it("marks the row a schedule sent the reader to, and brings it into view", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    history([exportRow({})], RUN);
    expect(screen.getAllByRole("row")[1]).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    cleanup();
    history([exportRow({})], null);
    expect(screen.getAllByRole("row")[1]).not.toHaveAttribute("aria-current");
  });
});

describe("DATA-12: the request button says beside itself why it is off", () => {
  it("asks for a dataset, and the button points at the sentence", () => {
    exportForm(EVERYTHING);
    const button = screen.getByRole("button", { name: "Request export" });
    expect(button).toBeDisabled();
    const why = screen.getByText("Choose a dataset first.");
    expect(why.id).toBe("export-request-why-not");
    expect(button).toHaveAttribute("aria-describedby", why.id);
  });

  it("says the role cannot request when it cannot, before it says anything about datasets", () => {
    exportForm({ ...EVERYTHING, mayCreate: false });
    expect(screen.getByText("Your role cannot request exports.")).toBeVisible();
    expect(screen.queryByText("Choose a dataset first.")).toBeNull();
  });

  it("says nothing once a dataset is chosen and the button is on", () => {
    exportForm(EVERYTHING, { resources: ["folios_payments"] });
    expect(screen.queryByText("Choose a dataset first.")).toBeNull();
    const button = screen.getByRole("button", { name: "Request export" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("does the same on the schedule form", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <NewScheduleForm
          abilities={EVERYTHING}
          onCancel={() => undefined}
          onCreated={() => undefined}
          propertyId={PROPERTY}
          timezone={ZONE}
        />
      </NextIntlClientProvider>,
    );
    const button = screen.getByRole("button", { name: "Create schedule" });
    expect(button).toBeDisabled();
    const why = document.getElementById("schedule-why-not");
    expect(why).not.toBeNull();
    expect(button).toHaveAttribute("aria-describedby", "schedule-why-not");
    expect(why).toHaveTextContent(/\S/);
  });
});

describe("DATA-13: the form says which clock the days are read on", () => {
  const clock =
    /Days are read on the clock of Demo Otel İstanbul \(UTC\+03:00 today\)/;

  it("states the Property's clock whenever a range cuts what was chosen", () => {
    for (const dataset of [
      "folios_payments",
      "reservations_stays",
      "audit_log",
    ] as const) {
      exportForm(EVERYTHING, {
        resources: [dataset],
        range: { from: "2026-10-01", to: "2026-10-05" },
      });
      expect(screen.getByText(clock), dataset).toBeVisible();
      cleanup();
    }
  });

  it("states it before a dataset is chosen, since the days are already picked", () => {
    exportForm(EVERYTHING, { range: { from: "2026-10-01", to: null } });
    expect(screen.getByText(clock)).toBeVisible();
  });

  it("does not state it when the range cuts nothing that was chosen, and says that instead", () => {
    exportForm(EVERYTHING, {
      resources: ["residents_guests", "rooms_beds"],
      range: { from: "2026-10-01", to: "2026-10-05" },
    });
    expect(screen.queryByText(clock)).toBeNull();
    expect(screen.getByText(/never cut by date/)).toBeVisible();
  });

  it("says nothing about a clock when no day is picked", () => {
    exportForm(EVERYTHING, { resources: ["folios_payments"] });
    expect(screen.queryByText(clock)).toBeNull();
  });

  it("names the offset the file's times are measured against, for the Property it is made from", () => {
    exportForm(EVERYTHING);
    expect(
      screen.getByText(
        /Times in the file are UTC; Demo Otel İstanbul is UTC\+03:00 today\./,
      ),
    ).toBeVisible();
  });

  it("writes an offset as UTC plus or minus hours and minutes in Latin digits, whatever the zone", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(utcOffsetOf("Europe/Istanbul", winter)).toBe("UTC+03:00");
    expect(utcOffsetOf("Europe/London", winter)).toBe("UTC+00:00");
    expect(utcOffsetOf("Europe/London", summer)).toBe("UTC+01:00");
    expect(utcOffsetOf("Asia/Kolkata", winter)).toBe("UTC+05:30");
    expect(utcOffsetOf("America/New_York", winter)).toBe("UTC-05:00");
    expect(utcOffsetOf("UTC", winter)).toBe("UTC+00:00");
  });
});

describe("DATA-14: the Arabic screens use the digits the rest of the page uses", () => {
  const ARABIC_INDIC = /[٠-٩۰-۹٫٬]/;

  function stringsIn(value: unknown, path: string, found: string[][]) {
    if (typeof value === "string") found.push([path, value]);
    else if (value && typeof value === "object")
      for (const [key, inner] of Object.entries(value))
        stringsIn(inner, `${path}.${key}`, found);
  }

  it("has no Arabic-Indic digit or separator in the data export or the audit log strings", () => {
    const found: string[][] = [];
    const arabic = messages.ar as unknown as Record<string, unknown>;
    stringsIn(arabic.dataExport, "dataExport", found);
    for (const key of Object.keys(arabic))
      if (key.startsWith("audit")) stringsIn(arabic[key], key, found);
    expect(found.length).toBeGreaterThan(100);
    expect(
      found.filter(([, text]) => ARABIC_INDIC.test(text)).map(([path]) => path),
    ).toEqual([]);
  });
});
