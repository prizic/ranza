/**
 * The request drawer, as a person reads it (HOUSEKEEPING-14, HOUSEKEEPING-15).
 *
 * What the policies refuse is proved by the integration suite. These are the
 * two things only the drawer can keep: a field the viewer cannot change is the
 * value as text, with the reason at the top, and the people a room holds are
 * on screen before the button that takes the room out of order is pressed.
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
import type { MaintenanceRequestCard } from "../../packages/ranza/maintenance/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// Radix's Select and Sheet measure themselves; jsdom has nothing to measure with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const server = vi.hoisted(() => ({
  assignRequest: vi.fn(),
  cancelRequest: vi.fn(),
  chargeGuestForDamage: vi.fn(),
  loadChargeableStays: vi.fn(),
  loadOutOfOrderImpact: vi.fn(),
  moveRequest: vi.fn(),
  prioritiseRequest: vi.fn(),
  recordRepairCost: vi.fn(),
  returnRoomToService: vi.fn(),
  takeRoomOutOfOrder: vi.fn(),
}));

vi.mock("../../apps/operator-workspace/src/server/maintenance", () => server);

const { RequestSheet } =
  await import("../../apps/operator-workspace/src/features/maintenance/components/request-sheet");

afterEach(() => {
  cleanup();
  for (const mock of Object.values(server)) mock.mockReset();
});

const text = messages.en.maintenance;

const REQUEST: MaintenanceRequestCard = {
  requestId: "d9000003-0000-4000-8000-0000000000a1",
  number: 7,
  title: "Window will not close",
  details: null,
  status: "in_progress",
  kind: "fault",
  priority: "urgent",
  unit: {
    unitId: "d9000003-0000-4000-8000-000000000209",
    name: "209",
    roomName: null,
  },
  equipment: null,
  costMinor: null,
  currency: "TRY",
  vendor: null,
  charges: [],
  assignee: { userId: "u-hk", email: "housekeeping@example.test" },
  reporter: { userId: "u-fd", email: "frontdesk@example.test" },
  reportedAt: "2026-10-20T08:00:00.000Z",
  statusChangedAt: "2026-10-20T09:00:00.000Z",
  cancelReason: null,
  hold: null,
} as MaintenanceRequestCard;

function sheet(
  overrides: Partial<{
    mayManage: boolean;
    mayTakeOutOfOrder: boolean;
    request: MaintenanceRequestCard;
  }> = {},
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RequestSheet
        assignees={[]}
        limits={{ cancelReason: 200, note: 200, vendor: 80 }}
        locale="en"
        mayCharge={false}
        mayManage={overrides.mayManage ?? false}
        mayTakeOutOfOrder={overrides.mayTakeOutOfOrder ?? false}
        onOpenChange={vi.fn()}
        propertyId="d9000003-0000-4000-8000-000000000001"
        request={overrides.request ?? REQUEST}
        timeZone="Europe/Istanbul"
        today="2026-10-25"
        viewerId="u-viewer"
        whenDone={null}
      />
    </NextIntlClientProvider>,
  );
}

describe("a request the viewer may read and not change (HOUSEKEEPING-14)", () => {
  it("shows who has it and how urgent it is as text, and says why once, at the top", () => {
    sheet({ mayManage: false });

    expect(screen.getByText(text.sheetReadOnly)).toBeInTheDocument();
    // Not a greyed select with a chevron: no control the viewer cannot use.
    expect(
      screen.queryByRole("combobox", { name: text.assignee }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: text.priority }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Housekeeping/)).toBeInTheDocument();
    expect(screen.getByText(text.priorities.urgent)).toBeInTheDocument();
  });

  it("keeps the controls for somebody who may manage, and no notice", () => {
    sheet({ mayManage: true });

    expect(screen.queryByText(text.sheetReadOnly)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: text.assignee })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: text.priority })).toBeEnabled();
  });

  it("shows a finished request's priority as text even to somebody who may manage", () => {
    sheet({ mayManage: true, request: { ...REQUEST, status: "done" } });

    expect(
      screen.queryByRole("combobox", { name: text.priority }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: text.assignee })).toBeEnabled();
  });
});

describe("taking a room out of order that somebody is in (HOUSEKEEPING-15)", () => {
  it("names the Guest and the day they leave before the first press, and the press goes ahead", async () => {
    server.loadOutOfOrderImpact.mockResolvedValue({
      inHouse: [
        { unitName: "209", guestName: "Ada Lovelace", endsOn: "2026-10-26" },
      ],
      reservations: [],
    });
    server.takeRoomOutOfOrder.mockResolvedValue({ status: "done" });
    sheet({ mayManage: true, mayTakeOutOfOrder: true });

    fireEvent.click(screen.getByRole("button", { name: text.takeOutOfOrder }));

    // Before anything is sent: the notice, not a refusal that came back.
    expect(await screen.findByText(text.impactTitle)).toBeInTheDocument();
    expect(server.loadOutOfOrderImpact).toHaveBeenCalledWith(
      REQUEST.unit!.unitId,
    );
    expect(server.takeRoomOutOfOrder).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: text.confirmOutOfOrder }),
    );
    await waitFor(() => expect(server.takeRoomOutOfOrder).toHaveBeenCalled());
    const sent = server.takeRoomOutOfOrder.mock.calls[0]![1] as FormData;
    expect(sent.get("acknowledge")).toBe("true");
  });

  it("asks for nothing when the room holds nobody, and the press sends it plainly", async () => {
    server.loadOutOfOrderImpact.mockResolvedValue({
      inHouse: [],
      reservations: [],
    });
    server.takeRoomOutOfOrder.mockResolvedValue({ status: "done" });
    sheet({ mayManage: true, mayTakeOutOfOrder: true });

    fireEvent.click(screen.getByRole("button", { name: text.takeOutOfOrder }));
    await waitFor(() => expect(server.loadOutOfOrderImpact).toHaveBeenCalled());
    expect(screen.queryByText(text.impactTitle)).not.toBeInTheDocument();

    const press = screen
      .getAllByRole("button", { name: text.takeOutOfOrder })
      .at(-1)!;
    fireEvent.click(press);
    await waitFor(() => expect(server.takeRoomOutOfOrder).toHaveBeenCalled());
    const sent = server.takeRoomOutOfOrder.mock.calls[0]![1] as FormData;
    expect(sent.get("acknowledge")).toBe("false");
  });
});
