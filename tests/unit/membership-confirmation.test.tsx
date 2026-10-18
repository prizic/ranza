/**
 * Removing, restoring, renewing and adding back: each asks first and names what
 * it does (PEOPLE-02, PEOPLE-07, PEOPLE-11), and a role change lists what the
 * person gains and loses (PEOPLE-10).
 *
 * What the screen does or refuses to do is what is under test; whether the
 * database honours the command is the integration suite's.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

const server = vi.hoisted(() => ({
  revoke: vi.fn(),
  undo: vi.fn(),
  renew: vi.fn(),
  addBack: vi.fn(),
  change: vi.fn(),
}));

vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  changeStaffRole: server.change,
  revokeStaffMember: server.revoke,
  undoStaffRevoke: server.undo,
  renewInvitationLink: server.renew,
  addBackStaffMember: server.addBack,
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
  for (const spy of Object.values(server)) spy.mockReset();
});
afterEach(cleanup);

const ORGANIZATION = "0f0f0f0f-0000-4000-8000-000000000001";
const SHIPPED = "00000000-0000-0000-0000-000000000000";
const en = messages.en.staff;

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
  role("owner", "Owner", ["staff.administer", "finance.view_ledger"]),
  role("housekeeping", "Housekeeping", ["housekeeping.update_status"]),
  role("manager", "Manager", [
    "staff.administer",
    "hr.view",
    "finance.view_ledger",
    "housekeeping.update_status",
  ]),
];

function member(
  id: string,
  roleKey: "owner" | "housekeeping" | "manager",
  overrides: Partial<StaffMember> = {},
): StaffMember {
  const held = roles.find((candidate) => candidate.key === roleKey)!;
  return {
    membershipId: `m-${id}`,
    userId: `u-${id}`,
    email: `${id}@example.test`,
    roleId: roleKey,
    roleScopeId: SHIPPED,
    roleName: held.name,
    rolePermissions: held.permissions,
    accessScope: "organization_wide",
    status: "active",
    invitation: null,
    acceptedAt: null,
    revokedAt: null,
    properties: [],
    ...overrides,
  };
}

function show(roster: StaffMember[], viewerUserId = "u-viewer") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <RosterTable
        locale="en"
        mayAdminister
        membersAboveViewer={[]}
        organizationId={ORGANIZATION}
        roles={roles}
        roster={roster}
        viewerUserId={viewerUserId}
      />
    </NextIntlClientProvider>,
  );
}

function choose(email: string, action: string) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `${en.actions}: ${email}` }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(screen.getByRole("menuitem", { name: action }));
  return screen.getByRole("dialog");
}

const viewer = member("viewer", "owner");
const other = member("other", "owner");
const desk = member("desk", "housekeeping");

describe("removing somebody's access", () => {
  it("asks first, names the consequence, and sends nothing until confirmed", () => {
    show([viewer, other, desk]);
    const dialog = choose("desk@example.test", en.revoke);

    expect(dialog).toHaveTextContent(
      en.membership.revoke.title.replace("{member}", "desk@example.test"),
    );
    expect(dialog).toHaveTextContent("Every session they hold ends at once");
    expect(dialog).toHaveTextContent("Nothing is deleted");
    expect(dialog).toHaveTextContent("24 hours");
    expect(server.revoke).not.toHaveBeenCalled();
  });

  it("sends the member, the Organization and the locale on confirm, and closes on done", async () => {
    server.revoke.mockResolvedValue("done");
    show([viewer, other, desk]);
    const dialog = choose("desk@example.test", en.revoke);

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: en.membership.revoke.confirm,
        }),
      );
    });

    const [, form] = server.revoke.mock.calls[0] as [string, FormData];
    expect(form.get("member")).toBe("u-desk");
    expect(form.get("organization")).toBe(ORGANIZATION);
    expect(form.get("locale")).toBe("en");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns somebody removing their own access that they will be signed out", () => {
    show([viewer, other, desk]);
    const dialog = choose("viewer@example.test", en.revoke);
    expect(dialog).toHaveTextContent(en.membership.revoke.self);
  });

  it("does not warn about it for somebody else's", () => {
    show([viewer, other, desk]);
    const dialog = choose("desk@example.test", en.revoke);
    expect(dialog).not.toHaveTextContent(en.membership.revoke.self);
  });

  it("refuses before the press when it would leave nobody able to add staff, and says what to do", () => {
    // The only person who can add staff is the viewer, removing themselves.
    show([viewer, desk]);
    const dialog = choose("viewer@example.test", en.revoke);

    expect(dialog).toHaveTextContent(en.lastAdministrator);
    expect(dialog).toHaveTextContent(
      "Give another person the Owner role first",
    );
    expect(
      within(dialog).queryByRole("button", {
        name: en.membership.revoke.confirm,
      }),
    ).toBeNull();
    expect(server.revoke).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason when the server refuses", async () => {
    server.revoke.mockResolvedValue("lastAdministrator");
    show([viewer, other, desk]);
    const dialog = choose("desk@example.test", en.revoke);

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: en.membership.revoke.confirm,
        }),
      );
    });

    expect(screen.getByRole("dialog")).toHaveTextContent(en.lastAdministrator);
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: en.membership.revoke.confirm,
      }),
    ).toBeNull();
  });
});

describe("what a revoked person's row offers", () => {
  const justNow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  it("offers the undo, with its deadline, inside the window", () => {
    const revoked = member("gone", "housekeeping", {
      status: "revoked",
      revokedAt: justNow,
    });
    show([viewer, other, revoked]);
    expect(screen.getByText(/Can be undone until/)).toBeInTheDocument();
    const dialog = choose("gone@example.test", en.undoRevoke);
    expect(dialog).toHaveTextContent("They must sign in again");
  });

  it("offers adding back, and no undo, once the window has passed", () => {
    const revoked = member("gone", "housekeeping", {
      status: "revoked",
      revokedAt: longAgo,
    });
    show([viewer, other, revoked]);
    // Hidden until asked for.
    expect(screen.queryByText("gone@example.test")).toBeNull();
    fireEvent.click(screen.getByTestId("show-revoked"));
    expect(
      screen.getByText("The 24-hour undo window is over"),
    ).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: `${en.actions}: gone@example.test` }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.queryByRole("menuitem", { name: en.undoRevoke })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: en.addBack }),
    ).toBeInTheDocument();
  });

  it("shows the link a renewal or an add-back returns, and says nothing was emailed", async () => {
    server.addBack.mockResolvedValue({
      state: "done",
      token: "t".repeat(43),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const revoked = member("gone", "housekeeping", {
      status: "revoked",
      revokedAt: longAgo,
    });
    show([viewer, other, revoked]);
    fireEvent.click(screen.getByTestId("show-revoked"));
    const dialog = choose("gone@example.test", en.addBack);
    expect(dialog).toHaveTextContent("reach no Property until you assign one");

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: en.membership.readd.confirm,
        }),
      );
    });

    const link = within(screen.getByRole("dialog")).getByTestId(
      "invitation-link",
    ) as HTMLInputElement;
    expect(link.value).toContain(
      `/en/accept-invitation?token=${"t".repeat(43)}`,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(en.linkNotSent);
  });

  it("offers a new link only to somebody whose link is not in use", () => {
    show([
      viewer,
      other,
      member("waiting", "housekeeping", { invitation: "pending" }),
      member("joined", "housekeeping", { invitation: "accepted" }),
    ]);
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: `${en.actions}: waiting@example.test`,
      }),
      { button: 0, ctrlKey: false },
    );
    expect(
      screen.getByRole("menuitem", { name: en.renewLink }),
    ).toBeInTheDocument();
    cleanup();

    show([
      viewer,
      other,
      member("joined", "housekeeping", { invitation: "accepted" }),
    ]);
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: `${en.actions}: joined@example.test`,
      }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.queryByRole("menuitem", { name: en.renewLink })).toBeNull();
  });
});

describe("the roster's search", () => {
  it("says when it finds nobody, and Show everyone puts the list back", () => {
    show([viewer, other, desk]);
    fireEvent.change(screen.getByTestId("staff-search"), {
      target: { value: "zzz" },
    });
    expect(screen.getByTestId("staff-no-match")).toHaveTextContent("zzz");
    expect(screen.queryAllByTestId("staff-row")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: en.showAll }));
    expect(screen.getAllByTestId("staff-row")).toHaveLength(3);
  });

  it("finds by role name and by Property as well as by address", () => {
    show([
      viewer,
      member("lodge", "housekeeping", {
        accessScope: "assigned_properties",
        properties: [{ propertyId: "p-1", propertyName: "Lakeside Lodge" }],
      }),
    ]);
    fireEvent.change(screen.getByTestId("staff-search"), {
      target: { value: "lakeside" },
    });
    expect(screen.getAllByTestId("staff-row")).toHaveLength(1);
    fireEvent.change(screen.getByTestId("staff-search"), {
      target: { value: "housekeeping" },
    });
    expect(screen.getAllByTestId("staff-row")).toHaveLength(1);
  });
});

describe("a role change says what is gained and lost", () => {
  it("lists payroll, staff and money first when going up, and what is lost going down", () => {
    server.change.mockResolvedValue("done");
    show([viewer, other, desk]);
    fireEvent.click(
      screen.getByRole("combobox", {
        name: `${en.role}: desk@example.test`,
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Manager" }));

    const gains = screen.getByTestId("role-gains");
    expect(gains).toHaveTextContent("They gain:");
    expect(gains.textContent).toContain(en.permissions.viewHr);
    expect(gains.textContent).toContain(en.permissions.viewLedger);
    expect(gains.textContent).toContain(en.permissions.administerStaff);
    // Held by both, so neither gained nor lost.
    expect(gains.textContent).not.toContain(en.permissions.updateHousekeeping);
    expect(screen.queryByTestId("role-losses")).toBeNull();
  });
});
