/**
 * Changing somebody's role from the roster: choosing a role proposes it, and
 * nothing is sent until it is confirmed (SP-S1-42 to SP-S1-53).
 *
 * A change ends every session the member holds, so a mis-click on a picker must
 * not be able to make one. Each test here is about what the screen does or
 * refuses to do; whether the database honours the command is the integration
 * suite's.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Role, StaffMember } from "../../packages/ranza/staff/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// A rejection returned by a `vi.fn` is reported by vitest as a failure of the
// test even when the code under test handles it, so a call that must reject
// goes through a plain function and every other call through the spy.
const server = vi.hoisted(() => ({
  fault: undefined as unknown,
  spy: vi.fn(),
}));
const changeStaffRole = server.spy;

vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  changeStaffRole: (...args: unknown[]) =>
    server.fault === undefined
      ? server.spy(...args)
      : Promise.reject(server.fault),
  revokeStaffMember: vi.fn(),
  undoStaffRevoke: vi.fn(),
}));

const { RosterTable } =
  await import("../../apps/operator-workspace/src/features/staff/components/roster-table");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

beforeEach(() => {
  changeStaffRole.mockReset();
  server.fault = undefined;
});
afterEach(cleanup);

const ORGANIZATION = "0f0f0f0f-0000-4000-8000-000000000001";
const SHIPPED = "00000000-0000-0000-0000-000000000000";
const ADMIN = ["staff.administer"];

function role(key: string, name: string, permissions: string[]): Role {
  return {
    key,
    name,
    permissions,
    organizationId: null,
    status: "active",
    heldBy: 1,
  };
}

const roles = [
  role("manager", "Manager", ADMIN),
  role("front_desk", "Front desk", ["front_desk.check_in"]),
  role("housekeeping", "Housekeeping", ["housekeeping.update_status"]),
];

function member(
  id: string,
  roleId: "manager" | "front_desk" | "housekeeping",
  overrides: Partial<StaffMember> = {},
): StaffMember {
  const held = roles.find((candidate) => candidate.key === roleId)!;
  return {
    membershipId: `m-${id}`,
    userId: `u-${id}`,
    email: `${id}@example.test`,
    roleId,
    roleScopeId: SHIPPED,
    roleName: held.name,
    rolePermissions: held.permissions,
    accessScope: "assigned_properties",
    status: "active",
    invitation: null,
    acceptedAt: null,
    properties: [],
    ...overrides,
  };
}

const viewer = member("viewer", "manager", {
  accessScope: "organization_wide",
});
const colleague = member("colleague", "manager", {
  accessScope: "organization_wide",
});
const desk = member("desk", "front_desk");

type Locale = "en" | "tr" | "ar";

function tree(roster: StaffMember[], locale: Locale = "en") {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RosterTable
        locale={locale}
        mayAdminister
        membersAboveViewer={[]}
        organizationId={ORGANIZATION}
        roles={roles}
        roster={roster}
        viewerUserId="u-viewer"
      />
    </NextIntlClientProvider>
  );
}

function renderRoster(roster: StaffMember[], locale: Locale = "en") {
  return render(tree(roster, locale));
}

function picker(email: string, locale: Locale = "en") {
  // The dialog hides the page behind it from assistive technology, so the
  // picker is still there to be read while it is open.
  return screen.getByRole("combobox", {
    name: `${messages[locale].staff.role}: ${email}`,
    hidden: true,
  });
}

function pick(email: string, roleName: string, locale: Locale = "en") {
  fireEvent.click(picker(email, locale));
  fireEvent.click(screen.getByRole("option", { name: roleName }));
}

const en = messages.en.staff;

describe("choosing a role in the roster", () => {
  it("picking a role opens a confirmation and writes nothing", () => {
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(en.confirmRoleTitle);
    expect(dialog).toHaveTextContent("desk@example.test");
    expect(dialog).toHaveTextContent("Front desk");
    expect(dialog).toHaveTextContent("Housekeeping");
    expect(dialog).toHaveTextContent(en.confirmRoleSessions);
    expect(changeStaffRole).not.toHaveBeenCalled();
    expect(picker("desk@example.test")).toHaveTextContent("Front desk");
  });

  it("cancelling, Escape or clicking outside leaves the role unchanged and sends nothing", () => {
    renderRoster([viewer, colleague, desk]);

    pick("desk@example.test", "Housekeeping");
    fireEvent.click(screen.getByRole("button", { name: en.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();

    pick("desk@example.test", "Housekeeping");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(changeStaffRole).not.toHaveBeenCalled();
    expect(picker("desk@example.test")).toHaveTextContent("Front desk");
  });

  it("selecting the held role sends nothing and opens nothing", () => {
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Front desk");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(changeStaffRole).not.toHaveBeenCalled();
  });

  it("confirming sends the role it was shown holding beside the one chosen, and closes on done", async () => {
    changeStaffRole.mockResolvedValue("done");
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    const [, form] = changeStaffRole.mock.calls[0] as [string, FormData];
    expect(form.get("member")).toBe("u-desk");
    expect(form.get("role")).toBe(":housekeeping");
    expect(form.get("expected")).toBe(":front_desk");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a second confirm while pending sends no second command", async () => {
    let settle: (outcome: string) => void = () => {};
    changeStaffRole.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    const confirm = screen.getByRole("button", { name: en.confirmRoleConfirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(changeStaffRole).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await act(async () => settle("done"));
  });
});

describe("when the confirmation cannot simply be given", () => {
  it("names the role the member holds now when it changed under the dialog", () => {
    const view = renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    view.rerender(tree([viewer, colleague, member("desk", "manager")]));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("desk@example.test");
    expect(dialog).toHaveTextContent("Manager");
    expect(
      within(dialog).queryByRole("button", { name: en.confirmRoleConfirm }),
    ).toBeNull();
    expect(changeStaffRole).not.toHaveBeenCalled();
  });

  it("says so when the server found the role had changed, and offers no retry", async () => {
    changeStaffRole.mockResolvedValue("roleChangedMeanwhile");
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Nothing was changed");
    expect(
      within(dialog).queryByRole("button", { name: en.confirmRoleConfirm }),
    ).toBeNull();
  });

  it("a retry after a refusal starts clean and can be confirmed", async () => {
    changeStaffRole.mockResolvedValueOnce("roleChangedMeanwhile");
    changeStaffRole.mockResolvedValueOnce("done");
    const view = renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: en.confirmRoleClose }));

    // The roster refreshed to what somebody else made of the member.
    view.rerender(tree([viewer, colleague, member("desk", "manager")]));
    pick("desk@example.test", "Housekeeping");

    const dialog = screen.getByRole("dialog");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(dialog).toHaveTextContent("Manager");
    expect(
      within(dialog).getByRole("button", { name: en.confirmRoleConfirm }),
    ).toBeEnabled();
  });

  it("offers no second press after a refusal that a second press cannot change", async () => {
    changeStaffRole.mockResolvedValue("roleRetired");
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: en.confirmRoleConfirm,
      }),
    ).toBeNull();
  });

  it("does not read its own success as somebody else's change", async () => {
    changeStaffRole.mockResolvedValue("done");
    const view = renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    // The roster arrives with the role this change wrote, while the dialog is
    // still fading out.
    view.rerender(tree([viewer, colleague, member("desk", "housekeeping")]));
    expect(screen.queryByText(/Somebody changed this role/)).toBeNull();
  });

  it("demoting yourself warns that you lose access, and Cancel has the focus", () => {
    renderRoster([viewer, colleague, desk]);
    pick("viewer@example.test", "Front desk");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(en.confirmRoleSelf);
    expect(dialog).toHaveTextContent("Front desk cannot manage staff");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: en.cancel }),
    );
  });

  it("the last administrator is refused before confirming", () => {
    renderRoster([viewer, desk]);
    pick("viewer@example.test", "Front desk");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(en.lastAdministrator);
    expect(
      within(dialog).queryByRole("button", { name: en.confirmRoleConfirm }),
    ).toBeNull();
    expect(changeStaffRole).not.toHaveBeenCalled();
  });

  it("a retired role is refused in the dialog and the held role stays", async () => {
    changeStaffRole.mockResolvedValue("roleRetired");
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(en.roleRetired);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(picker("desk@example.test")).toHaveTextContent("Front desk");
  });

  it("a failed change keeps the dialog open with the reason and the held role", async () => {
    changeStaffRole.mockResolvedValue("refused");
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(en.refused);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(picker("desk@example.test")).toHaveTextContent("Front desk");
  });

  it("a change that never reached the server is reported and kept", async () => {
    const fault = new TypeError("network down");
    server.fault = fault;
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.confirmRoleConfirm }),
      );
    });

    expect(reported).toHaveBeenCalledWith("staff.role_change_failed", {
      member: "u-desk",
      error: fault,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(en.refused);
    reported.mockRestore();
  });
});

describe("the confirmation as a keyboard and screen-reader user meets it", () => {
  it("the confirmation traps focus and returns it to the row's picker", async () => {
    renderRoster([viewer, colleague, desk]);
    pick("desk@example.test", "Housekeeping");
    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );

    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    const last = buttons[buttons.length - 1]!;
    // Tab from the last control wraps to the first, and Shift+Tab from the
    // first wraps to the last: focus never leaves for the page behind.
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.click(screen.getByRole("button", { name: en.cancel }));
    await waitFor(() =>
      expect(document.activeElement).toBe(picker("desk@example.test")),
    );
  });

  it.each(["en", "tr", "ar"] as const)(
    "the confirmation reads in every locale, naming shipped roles in each (%s)",
    (locale) => {
      renderRoster([viewer, colleague, desk], locale);
      pick(
        "desk@example.test",
        messages[locale].staff.roles.housekeeping,
        locale,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(messages[locale].staff.confirmRoleTitle);
      expect(dialog).toHaveTextContent(messages[locale].staff.roles.front_desk);
      expect(dialog).toHaveTextContent(
        messages[locale].staff.roles.housekeeping,
      );
      expect(dialog).toHaveTextContent(
        messages[locale].staff.confirmRoleSessions,
      );
    },
  );
});
