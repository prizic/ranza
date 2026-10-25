/**
 * The roles grid when the server's answer changes under it: after a save, and
 * when somebody else edits a role.
 *
 * It is refreshed in place. Remounting it on every answer closed a row menu
 * that had just been opened, which a press landing between a save and the
 * refresh that followed it met as "the menu item was detached from the DOM"
 * (people-screens, CI), and would have thrown away ticks not yet saved.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "../../packages/ranza/staff/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  changeStaffRole: vi.fn(),
  revokeStaffMember: vi.fn(),
  undoStaffRevoke: vi.fn(),
  editRole: vi.fn(),
  reinstateRole: vi.fn(),
  retireRole: vi.fn(),
}));

const { StaffScreen } =
  await import("../../apps/operator-workspace/src/features/staff/components/staff-screen");
const { keepUnsavedTicks } =
  await import("../../apps/operator-workspace/src/features/staff/components/permission-matrix");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

const ORGANIZATION = "0f0f0f0f-0000-4000-8000-000000000001";
const FOLIO = "finance.manage_folio";
const CHECK_IN = "front_desk.check_in";

const role = (key: string, name: string, permissions: string[]): Role => ({
  key,
  name,
  permissions,
  organizationId: ORGANIZATION,
  status: "active",
  heldBy: 0,
});

function screenOf(roles: readonly Role[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <StaffScreen
        employment={{}}
        locale="en"
        mayAdminister
        mayDefineRoles
        organizationId={ORGANIZATION}
        propertyChoices={[]}
        roles={roles}
        roster={[]}
        viewerUserId="u-viewer"
      />
    </NextIntlClientProvider>
  );
}

async function openRoles(view: ReturnType<typeof render>) {
  fireEvent.mouseDown(
    within(view.container).getByRole("tab", {
      name: messages.en.staff.rolesTab,
    }),
  );
  fireEvent.click(
    within(view.container).getByRole("tab", {
      name: messages.en.staff.rolesTab,
    }),
  );
}

describe("the roles grid when the server answers again", () => {
  it("shows the new answer without being rebuilt, and keeps the ticks nobody has saved", async () => {
    const before = [
      role("night", "Night desk", []),
      role("early", "Early desk", []),
    ];
    const view = render(screenOf(before));
    await openRoles(view);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `Early desk: ${messages.en.staff.permissions.manageFolio}`,
      }),
    );
    const menu = screen.getByRole("button", {
      name: `${messages.en.staff.actions}: Night desk`,
    });

    view.rerender(
      screenOf([
        role("night", "Night desk", [CHECK_IN]),
        role("early", "Early desk", []),
      ]),
    );

    expect(
      screen.getByRole("button", {
        name: `${messages.en.staff.actions}: Night desk`,
      }),
    ).toBe(menu);
    expect(
      screen.getByRole("checkbox", {
        name: `Night desk: ${messages.en.staff.permissions.checkIn}`,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: `Early desk: ${messages.en.staff.permissions.manageFolio}`,
      }),
    ).toBeChecked();
    expect(screen.getByTestId("unsaved-roles")).toBeInTheDocument();
  });
});

describe("what the grid shows after the server answers", () => {
  const served = { a: [CHECK_IN], b: [] };

  it("is the server's answer for a role nobody has ticked", () => {
    expect(
      keepUnsavedTicks({ a: [], b: [] }, { a: [], b: [] }, served),
    ).toEqual(served);
  });

  it("keeps a tick not yet saved, and drops a role the server no longer lists", () => {
    expect(
      keepUnsavedTicks(
        { a: [], b: [], gone: [] },
        { a: [], b: [FOLIO], gone: [FOLIO] },
        served,
      ),
    ).toEqual({ a: [CHECK_IN], b: [FOLIO] });
  });
});
