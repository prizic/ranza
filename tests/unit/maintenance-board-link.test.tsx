/**
 * A line elsewhere that names a maintenance request ("MT-12") opens that
 * request, not the whole board (audit 2026-11-07, B-02). The sheet it opens is
 * covered by maintenance-request-sheet.test.tsx; what is asserted here is that
 * the board opens it from the address, and that the address is spent once the
 * sheet is closed.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MaintenanceBoard as Board,
  MaintenanceRequestCard,
} from "../../packages/ranza/maintenance/src";
import { messages } from "../../apps/operator-workspace/src/messages";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const { replace, address } = vi.hoisted(() => ({
  replace: vi.fn(),
  address: { search: "" },
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  usePathname: () => "/en/maintenance",
  useRouter: () => ({ replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(address.search),
}));
// Every action the board's children can call; none is reached by these tests.
vi.mock("../../apps/operator-workspace/src/server/maintenance", () => ({
  assignRequest: vi.fn(),
  cancelRequest: vi.fn(),
  chargeGuestForDamage: vi.fn(),
  createWorkOrder: vi.fn(),
  loadChargeableStays: vi.fn(),
  loadOutOfOrderImpact: vi.fn(),
  moveRequest: vi.fn(),
  prioritiseRequest: vi.fn(),
  recordRepairCost: vi.fn(),
  reportProblem: vi.fn(),
  returnRoomToService: vi.fn(),
  saveEquipment: vi.fn(),
  saveMaintenanceSettings: vi.fn(),
  setEquipmentRetired: vi.fn(),
  takeRoomOutOfOrder: vi.fn(),
}));

const { MaintenanceBoard } =
  await import("../../apps/operator-workspace/src/features/maintenance/components/maintenance-board");

const PROPERTY = "d9000003-0000-4000-8000-000000000001";
const request = (number: number, title: string): MaintenanceRequestCard =>
  ({
    requestId: `d9000003-0000-4000-8000-0000000000${number}`,
    number,
    title,
    details: null,
    status: "in_progress",
    kind: "fault",
    priority: "urgent",
    unit: null,
    equipment: null,
    costMinor: null,
    currency: "TRY",
    vendor: null,
    charges: [],
    assignee: null,
    reporter: { userId: "u-fd", email: "frontdesk@example.test" },
    reportedAt: "2026-10-20T08:00:00.000Z",
    statusChangedAt: "2026-10-20T09:00:00.000Z",
    cancelReason: null,
    hold: null,
  }) as MaintenanceRequestCard;

const PIPE = request(12, "Leaking pipe");
const WINDOW = request(7, "Window will not close");
const BOARD: Board = {
  today: "2026-10-25",
  requests: [WINDOW, PIPE],
  counts: {
    new: 0,
    in_progress: 2,
    waiting_for_parts: 0,
    done: 0,
    cancelled: 0,
    outOfOrder: 0,
  },
  mayReport: false,
  mayManage: false,
  mayTakeOutOfOrder: false,
  mayCharge: false,
};

const NO_REGISTER = {
  today: "2026-10-25",
  items: [],
  mayManageEquipment: false,
  mayReport: false,
};

function show(
  openRequestId: string | null,
  register: Record<string, unknown> = NO_REGISTER,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <MaintenanceBoard
        board={BOARD}
        limits={{
          title: 80,
          details: 500,
          cancelReason: 200,
          note: 200,
          vendor: 80,
          equipment: { name: 80, category: 80, location: 80, interval: 3 },
        }}
        locale="en"
        openRequestId={openRequestId}
        options={{ units: [], equipment: [], assignees: [] }}
        propertyId={PROPERTY}
        propertyName="Deniz Otel"
        roomsHref={null}
        register={register as never}
        reportUnitId={null}
        settings={null}
        timeZone="Europe/Istanbul"
        viewerId="u-1"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  address.search = "";
});
afterEach(cleanup);

describe("a request named by a link (B-02)", () => {
  it("B-02: opens that request's sheet on arrival", () => {
    address.search = `property=${PROPERTY}&request=12`;
    show(PIPE.requestId);
    expect(screen.getByRole("dialog")).toHaveTextContent("Leaking pipe");
  });

  it("B-02: opens no sheet when the link names none this board holds", () => {
    address.search = `property=${PROPERTY}&request=999`;
    show(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("B-02: spends the parameter when the sheet is closed, keeping the rest of the address", () => {
    address.search = `property=${PROPERTY}&request=12&priority=urgent`;
    show(PIPE.requestId);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replace).toHaveBeenCalledWith(
      `/en/maintenance?property=${PROPERTY}&priority=urgent`,
      { scroll: false },
    );
  });

  it("B-02: a sheet opened by a click leaves the address alone", () => {
    address.search = `property=${PROPERTY}`;
    show(null);
    fireEvent.click(screen.getByText("Window will not close"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("a request named on the Equipment and Plan tabs (B-03)", () => {
  const ITEM = {
    equipmentId: "d9000003-0000-4000-8000-0000000000e1",
    name: "Boiler",
    category: "Plumbing",
    unit: null,
    location: "Basement",
    serviceIntervalMonths: 6,
    lastServicedOn: "2026-04-01",
    nextServiceOn: "2026-10-01",
    condition: "overdue",
    retired: false,
    openFault: { requestId: PIPE.requestId, number: 12 },
    openWorkOrder: { requestId: WINDOW.requestId, number: 7 },
  };
  const REGISTER = { ...NO_REGISTER, items: [ITEM] };
  const openTab = (name: string) =>
    fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

  it("B-03: an equipment item's open fault number opens that request", () => {
    show(null, REGISTER);
    openTab("Equipment");
    fireEvent.click(screen.getByRole("button", { name: "MT-12" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Leaking pipe");
  });

  it("B-03: the plan's work order opens that request", () => {
    show(null, REGISTER);
    openTab("Service plan");
    fireEvent.click(screen.getByRole("button", { name: /MT-7/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Window will not close",
    );
  });
});
