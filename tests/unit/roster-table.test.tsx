/**
 * The roster: what each row offers, and to whom.
 *
 * Who may change anything at all (#80), which rows and roles are within the
 * viewer's own (SP-S1-35), and the role picker for the one membership its
 * options cannot name.
 *
 * The roster is given the active roles only, and retiring a role is refused
 * only while an active membership holds it — so a revoked member can still
 * hold a role that has since been retired. The picker must show that role by
 * its name: the value it holds is `<organization>:<key>`, an internal pair.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role, StaffMember } from "../../packages/ranza/staff/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  changeStaffRole: vi.fn(),
  revokeStaffMember: vi.fn(),
  undoStaffRevoke: vi.fn(),
  editRole: vi.fn(),
  reinstateRole: vi.fn(),
  retireRole: vi.fn(),
}));

const { RosterTable } =
  await import("../../apps/operator-workspace/src/features/staff/components/roster-table");
const { StaffScreen } =
  await import("../../apps/operator-workspace/src/features/staff/components/staff-screen");

beforeAll(() => {
  // cmdk measures its list and scrolls the active item into view; jsdom
  // implements neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
});

afterEach(cleanup);

const ORGANIZATION = "0f0f0f0f-0000-4000-8000-000000000001";

const nightAuditor: Role = {
  key: "night_auditor",
  name: "Night auditor",
  permissions: [],
  organizationId: ORGANIZATION,
  status: "active",
  heldBy: 0,
};

function member(overrides: Partial<StaffMember>): StaffMember {
  return {
    membershipId: "m-1",
    userId: "u-1",
    email: "former@example.test",
    roleId: "night_auditor",
    roleScopeId: ORGANIZATION,
    roleName: "Night auditor",
    rolePermissions: [],
    accessScope: "assigned_properties",
    status: "active",
    invitation: null,
    acceptedAt: null,
    revokedAt: null,
    properties: [],
    ...overrides,
  };
}

function renderRoster(
  roster: StaffMember[],
  {
    mayAdminister = true,
    locale = "en" as "en" | "tr",
    above = [] as string[],
    employment = {} as Record<
      string,
      {
        name: string;
        status: "active" | "terminated";
        terminatedOn: string | null;
      }
    >,
    roleFilter = "all",
  } = {},
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RosterTable
        employment={employment}
        onRoleFilterChange={() => undefined}
        propertyChoices={[]}
        roleFilter={roleFilter}
        locale={locale}
        mayAdminister={mayAdminister}
        membersAboveViewer={above}
        organizationId={ORGANIZATION}
        roles={[nightAuditor]}
        roster={roster}
        viewerUserId="u-viewer"
      />
    </NextIntlClientProvider>,
  );
}

describe("the roster's role picker", () => {
  it("names a retired role a revoked member still holds, not its key", () => {
    renderRoster([
      member({
        roleId: "concierge",
        roleName: "Concierge",
        status: "revoked",
      }),
    ]);
    const picker = screen.getByRole("combobox", {
      name: `${messages.en.staff.role}: former@example.test`,
    });
    expect(picker).toHaveTextContent("Concierge");
    expect(picker).not.toHaveTextContent(ORGANIZATION);
  });

  it("names a held active role from the options", () => {
    renderRoster([member({})]);
    expect(
      screen.getByRole("combobox", {
        name: `${messages.en.staff.role}: former@example.test`,
      }),
    ).toHaveTextContent("Night auditor");
  });
});

// #80. Somebody without staff.administer reads the roster: no picker and no
// row actions, and the role as words in their own language.
describe("the roster for a viewer who may not administer staff", () => {
  it("offers neither a role picker nor row actions", () => {
    renderRoster([member({})], { mayAdminister: false });
    // The filters are reading, not changing, so they stay; a row's role is a word.
    expect(screen.queryByRole("combobox", { name: /^Role: / })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: `${messages.en.staff.actions}: former@example.test`,
      }),
    ).toBeNull();
    expect(screen.getByTestId("staff-row")).toHaveTextContent("Night auditor");
  });

  it("names a role Ranza ships in the viewer's language", () => {
    renderRoster(
      [
        member({
          roleId: "front_desk",
          roleScopeId: "00000000-0000-0000-0000-000000000000",
          roleName: "Front desk",
        }),
      ],
      { mayAdminister: false, locale: "tr" },
    );
    expect(screen.getByTestId("staff-row")).toHaveTextContent(
      messages.tr.staff.roles.front_desk,
    );
  });
});

// SP-S1-35. A member above the viewer in role or reach is read, not changed:
// the policies would refuse the picker and the actions both.
describe("the roster, for a row whose member is above the viewer", () => {
  it("shows who they are and their role, offers nothing, and keeps the others' controls", () => {
    renderRoster(
      [
        member({ membershipId: "m-owner", email: "owner@example.test" }),
        member({ membershipId: "m-peer", email: "peer@example.test" }),
      ],
      { above: ["m-owner"] },
    );
    const role = messages.en.staff.role;
    const actions = messages.en.staff.actions;
    const owner = screen
      .getAllByTestId("staff-row")
      .find((row) => row.textContent?.includes("owner@example.test"));
    expect(owner).toHaveTextContent("Night auditor");
    expect(owner).toHaveTextContent(messages.en.staff.aboveYou);
    expect(
      screen.queryByRole("combobox", { name: `${role}: owner@example.test` }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: `${actions}: owner@example.test` }),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: `${role}: peer@example.test` }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: `${actions}: peer@example.test` }),
    ).toBeVisible();
  });

  it("says an organization-wide member reaches every Property, whatever is assigned", () => {
    renderRoster([
      member({
        membershipId: "m-owner",
        email: "owner@example.test",
        accessScope: "organization_wide",
        properties: [{ propertyId: "p-1", propertyName: "Hotel A" }],
      }),
      member({
        membershipId: "m-peer",
        email: "peer@example.test",
        properties: [{ propertyId: "p-1", propertyName: "Hotel A" }],
      }),
    ]);
    const rows = screen.getAllByTestId("staff-row");
    const owner = rows.find((row) => row.textContent?.includes("owner@"));
    const peer = rows.find((row) => row.textContent?.includes("peer@"));
    expect(owner).toHaveTextContent(messages.en.staff.reachesEverywhere);
    expect(owner).not.toHaveTextContent("Hotel A");
    expect(peer).toHaveTextContent("Hotel A");
  });

  it("offers no undo on a revoked member above the viewer", () => {
    renderRoster(
      [
        member({
          membershipId: "m-gone",
          email: "gone@example.test",
          status: "revoked",
        }),
      ],
      { above: ["m-gone"] },
    );
    expect(
      screen.queryByRole("button", {
        name: `${messages.en.staff.actions}: gone@example.test`,
      }),
    ).toBeNull();
    expect(screen.getByTestId("staff-row")).toHaveTextContent(
      messages.en.staff.revoked,
    );
  });
});

// SP-S1-35 through the screen that computes it: the viewer's own membership in
// the roster is their ceiling, the organization-wide Owner is above a Manager
// of assigned Properties, and a peer's picker offers only the roles within the
// viewer's own — shipped or the Organization's.
describe("the staff screen, for an administrator narrower than Owner", () => {
  const SHIPPED = "00000000-0000-0000-0000-000000000000";
  const held = ["staff.administer", "front_desk.check_in"];
  const role = (
    key: string,
    name: string,
    permissions: string[],
    organizationId: string | null = null,
  ): Role => ({
    key,
    name,
    permissions,
    organizationId,
    status: "active",
    heldBy: 1,
  });
  const roles = [
    role("owner", "Owner", [...held, "finance.post"]),
    role("front_desk", "Front desk", ["front_desk.check_in"]),
    role("desk_admin", "Desk admin", held, ORGANIZATION),
    role(
      "night_desk",
      "Night desk",
      ["front_desk.check_in", "audit.read"],
      ORGANIZATION,
    ),
  ];

  function renderScreen() {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <StaffScreen
          employment={{}}
          onRoleFilterChange={() => undefined}
          propertyChoices={[]}
          roleFilter="all"
          locale="en"
          mayAdminister
          mayDefineRoles={false}
          organizationId={ORGANIZATION}
          permissions={[]}
          roles={roles}
          roster={[
            member({
              membershipId: "m-me",
              userId: "u-me",
              email: "me@example.test",
              roleId: "desk_admin",
              roleName: "Desk admin",
              rolePermissions: held,
            }),
            member({
              membershipId: "m-owner",
              userId: "u-owner",
              email: "owner@example.test",
              roleId: "owner",
              roleScopeId: SHIPPED,
              roleName: "Owner",
              rolePermissions: [...held, "finance.post"],
              accessScope: "organization_wide",
            }),
            member({
              membershipId: "m-peer",
              userId: "u-peer",
              email: "peer@example.test",
              roleId: "front_desk",
              roleScopeId: SHIPPED,
              roleName: "Front desk",
              rolePermissions: ["front_desk.check_in"],
            }),
          ]}
          viewerUserId="u-me"
        />
      </NextIntlClientProvider>,
    );
  }

  it("offers nothing on the Owner's row", () => {
    renderScreen();
    expect(
      screen.queryByRole("combobox", {
        name: `${messages.en.staff.role}: owner@example.test`,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: `${messages.en.staff.actions}: owner@example.test`,
      }),
    ).toBeNull();
  });

  it("offers a peer only the roles within the viewer's own", () => {
    renderScreen();
    fireEvent.click(
      screen.getByRole("combobox", {
        name: `${messages.en.staff.role}: peer@example.test`,
      }),
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Front desk", "Desk admin"]);
  });

  it("keeps the viewer's own row, within their own role", () => {
    renderScreen();
    expect(
      screen.getByRole("combobox", {
        name: `${messages.en.staff.role}: me@example.test`,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `${messages.en.staff.actions}: me@example.test`,
      }),
    ).toBeVisible();
  });
});

// PEOPLE-07 and PEOPLE-08: who a row is, and whether they still work here.
describe("the roster identifies people and flags leavers", () => {
  it("PEOPLE-07: shows the name HR holds with the address beneath it", () => {
    renderRoster([member({ userId: "u-ada" })], {
      employment: {
        "u-ada": { name: "Ada Yilmaz", status: "active", terminatedOn: null },
      },
    });
    const row = screen.getByRole("row", { name: /Ada Yilmaz/ });
    expect(row).toHaveTextContent("former@example.test");
    expect(row).toHaveTextContent("AY");
    expect(screen.queryByText(/still has access/)).not.toBeInTheDocument();
  });

  it("PEOPLE-07: a login HR does not know is identified by its address, as before", () => {
    renderRoster([member({})], { employment: {} });
    expect(
      screen.getByRole("row", { name: /former@example.test/ }),
    ).toHaveTextContent("FO");
  });

  it("PEOPLE-07: a role filter narrows the roster to those who hold it", () => {
    renderRoster(
      [
        member({}),
        member({
          membershipId: "m-2",
          userId: "u-2",
          email: "other@example.test",
          roleId: "front_desk",
          roleScopeId: "00000000-0000-0000-0000-000000000000",
          roleName: "Front desk",
        }),
      ],
      { roleFilter: `${ORGANIZATION}:night_auditor` },
    );
    expect(screen.getByText("former@example.test")).toBeInTheDocument();
    expect(screen.queryByText("other@example.test")).not.toBeInTheDocument();
  });

  it("PEOPLE-08: an active login whose employment ended says so, with the date", () => {
    renderRoster([member({ userId: "u-gone" })], {
      employment: {
        "u-gone": {
          name: "Gone Person",
          status: "terminated",
          terminatedOn: "2026-10-12",
        },
      },
    });
    expect(
      screen.getByText("Employment ended Oct 12, 2026, still has access"),
    ).toBeInTheDocument();
  });

  it("PEOPLE-08: somebody whose access is already revoked is not flagged", () => {
    renderRoster([member({ userId: "u-gone", status: "revoked" })], {
      employment: {
        "u-gone": {
          name: "Gone Person",
          status: "terminated",
          terminatedOn: "2026-10-12",
        },
      },
    });
    expect(screen.queryByText(/still has access/)).not.toBeInTheDocument();
  });
});
