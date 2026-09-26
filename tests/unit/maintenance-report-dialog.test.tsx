/**
 * Taking out a room somebody is in comes back as an impact, and the desk
 * confirms it with the same form (MT-S2-09, MT-S2-10). The form has to still
 * say what they asked for when they confirm.
 *
 * It did not. React resets a form after its `action` runs, and Radix's
 * Checkbox and Select answer a reset by setting the value they mounted with,
 * through the same callback a choice goes through — so the switch went back to
 * unticked under a button reading "Take it out of order anyway", and pressing
 * it sent a report that left the room in service. Red on the form that
 * submitted through `action`.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

// Radix's Checkbox measures itself; jsdom has nothing to measure with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const reportProblem = vi.hoisted(() => vi.fn());

vi.mock("../../apps/operator-workspace/src/server/maintenance", () => ({
  reportProblem,
}));

const { ReportDialog } =
  await import("../../apps/operator-workspace/src/features/maintenance/components/report-dialog");

afterEach(() => {
  cleanup();
  reportProblem.mockReset();
});

const ROOM = "d9000003-0000-4000-8000-000000000101";
const text = messages.en.maintenance;

function openedFromRooms() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ReportDialog
        initialUnitId={ROOM}
        limits={{ title: 120, details: 2000 }}
        locale="en"
        mayManage
        mayTakeOutOfOrder
        onDone={vi.fn()}
        onOpenChange={vi.fn()}
        open
        options={{
          units: [
            { unitId: ROOM, name: "101", roomName: null, status: "available" },
          ],
          equipment: [],
          assignees: [],
        }}
        propertyId="d9000003-0000-4000-8000-000000000001"
        today="2026-09-24"
      />
    </NextIntlClientProvider>,
  );
}

describe("reporting a problem about a room somebody is booked into", () => {
  it("keeps the room and the switch when it asks the desk to confirm", async () => {
    reportProblem.mockResolvedValueOnce({
      status: "impact",
      impact: {
        inHouse: [],
        reservations: [
          {
            unitName: "101",
            guestName: "Ada Lovelace",
            startsOn: "2026-09-24",
            endsOn: "2026-09-27",
          },
        ],
      },
    });
    openedFromRooms();

    fireEvent.change(screen.getByLabelText(text.whatIsWrong), {
      target: { value: "Broken window latch" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: text.outOfOrderSwitch }),
    );
    fireEvent.click(screen.getByRole("button", { name: text.send }));

    await screen.findByText(text.impactTitle);
    expect(
      screen.getByRole("checkbox", { name: text.outOfOrderSwitch }),
    ).toBeChecked();
    expect(screen.getByLabelText(text.whatIsWrong)).toHaveValue(
      "Broken window latch",
    );

    // What the confirmation sends: the same report, taken out, acknowledged.
    reportProblem.mockResolvedValueOnce({ status: "idle" });
    fireEvent.click(
      screen.getByRole("button", { name: text.confirmOutOfOrder }),
    );
    await waitFor(() => expect(reportProblem).toHaveBeenCalledTimes(2));
    const confirmed = reportProblem.mock.calls[1]![1] as FormData;
    expect(confirmed.get("unitId")).toBe(ROOM);
    expect(confirmed.get("outOfOrder")).toBe("on");
    expect(confirmed.get("acknowledge")).toBe("true");
  });

  // The warning is about taking the room out. Untick the switch and there is
  // nothing to confirm: the button goes back to sending a report, and nothing
  // acknowledges an impact that is no longer being asked for.
  it("stops asking to confirm once the switch is unticked", async () => {
    reportProblem.mockResolvedValueOnce({
      status: "impact",
      impact: {
        inHouse: [{ unitName: "101", guestName: "Cahit Arf", endsOn: null }],
        reservations: [],
      },
    });
    openedFromRooms();

    fireEvent.change(screen.getByLabelText(text.whatIsWrong), {
      target: { value: "Broken window latch" },
    });
    const outOfOrder = screen.getByRole("checkbox", {
      name: text.outOfOrderSwitch,
    });
    fireEvent.click(outOfOrder);
    fireEvent.click(screen.getByRole("button", { name: text.send }));
    await screen.findByText(text.impactTitle);

    fireEvent.click(outOfOrder);

    expect(screen.queryByText(text.impactTitle)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: text.confirmOutOfOrder }),
    ).not.toBeInTheDocument();
    reportProblem.mockResolvedValueOnce({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: text.send }));
    await waitFor(() => expect(reportProblem).toHaveBeenCalledTimes(2));
    const sent = reportProblem.mock.calls[1]![1] as FormData;
    expect(sent.get("outOfOrder")).toBeNull();
    expect(sent.get("acknowledge")).toBeNull();
  });
});
