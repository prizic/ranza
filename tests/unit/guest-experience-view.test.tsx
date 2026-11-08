/**
 * The way out of a view the reader narrowed, and the confirmation of a request
 * the view may hide (audit 2026-11-07, B-04 and B-14). The server actions are
 * mocked: what they do is exercised against a database elsewhere.
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
import type { ServiceRequestItem } from "../../packages/ranza/guest-services/src";
import { messages } from "../../apps/operator-workspace/src/messages";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const server = vi.hoisted(() => ({
  createServiceRequest: vi.fn(),
  updateServiceRequestStatus: vi.fn(),
  assignServiceRequest: vi.fn(),
}));
vi.mock(
  "../../apps/operator-workspace/src/server/guest-services",
  () => server,
);

const { GuestExperienceView } =
  await import("../../apps/operator-workspace/src/features/guest-experience/components/guest-experience-view");

afterEach(() => {
  cleanup();
  for (const mock of Object.values(server)) mock.mockReset();
});

const text = messages.en.guestExperience;

const request = (
  overrides: Partial<ServiceRequestItem>,
): ServiceRequestItem => ({
  id: "d9000007-0000-4000-8000-000000000001",
  number: 1,
  organizationId: "d9000002-0000-4000-8000-000000000001",
  propertyId: "d9000003-0000-4000-8000-000000000001",
  title: "Extra towels",
  details: null,
  category: "housekeeping",
  priority: "normal",
  status: "new",
  cancelReason: null,
  resolutionNotes: null,
  accommodationUnitId: null,
  unitName: null,
  stayId: null,
  guestId: null,
  guestName: null,
  assignedToUserId: null,
  assignedToName: null,
  reportedByUserId: null,
  reportedAt: "2026-10-20T08:00:00.000Z",
  resolvedAt: null,
  createdAt: "2026-10-20T08:00:00.000Z",
  updatedAt: "2026-10-20T08:00:00.000Z",
  ...overrides,
});

function show(requests: ServiceRequestItem[]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <GuestExperienceView
        locale="en"
        mayCreate
        mayManage
        propertyId="d9000003-0000-4000-8000-000000000001"
        requests={requests}
        staff={[]}
        viewerId="u-1"
      />
    </NextIntlClientProvider>,
  );
}

const urgentTile = () =>
  screen.getByRole("button", { name: new RegExp(text.urgentOpen) });

describe("an urgent filter with nothing under it (B-04)", () => {
  it("B-04: Show all lifts the urgent filter too, so the list is not left empty", () => {
    show([request({})]);
    fireEvent.click(urgentTile());
    expect(urgentTile()).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryAllByText("Extra towels")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: text.showAll }));
    expect(urgentTile()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("Extra towels").length).toBeGreaterThan(0);
  });

  it("B-04: the tile says what pressing it does, before it is pressed", () => {
    show([request({})]);
    expect(urgentTile()).toHaveAttribute("title", text.urgentFilterHint);
    fireEvent.click(urgentTile());
    expect(urgentTile()).toHaveAttribute("title", text.urgentFilterOn);
  });
});

describe("a request logged into a view that hides it (B-14)", () => {
  async function logRequestFromResolvedTab() {
    server.createServiceRequest.mockResolvedValue({
      status: "done",
      number: 42,
    });
    show([request({ status: "resolved", title: "Old towels" })]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Closed/ }), {
      button: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: text.newRequest }));
    fireEvent.change(await screen.findByLabelText(text.title), {
      target: { value: "Broken lamp" },
    });
    fireEvent.submit(screen.getByLabelText(text.title).closest("form")!);
    await screen.findByText(/Request #42 logged/);
  }

  it("B-14: says the request was logged, with its number", async () => {
    await logRequestFromResolvedTab();
    expect(server.createServiceRequest).toHaveBeenCalledTimes(1);
  });

  it("B-14: one press brings the reader to the open requests, where it is", async () => {
    await logRequestFromResolvedTab();
    expect(screen.getByRole("tab", { name: /Closed/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: text.showOpenRequests }),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^Open/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.queryByText(/Request #42 logged/)).toBeNull();
  });
});
