/**
 * The roster's role picker, for the one membership its options cannot name.
 *
 * The roster is given the active roles only, and retiring a role is refused
 * only while an active membership holds it — so a revoked member can still
 * hold a role that has since been retired. The picker must show that role by
 * its name: the value it holds is `<organization>:<key>`, an internal pair.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role, StaffMember } from "../../packages/ranza/staff/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/staff", () => ({
  changeStaffRole: vi.fn(),
  revokeStaffMember: vi.fn(),
  undoStaffRevoke: vi.fn(),
}));

const { RosterTable } =
  await import("../../apps/operator-workspace/src/features/staff/components/roster-table");

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
    status: "active",
    invitation: null,
    acceptedAt: null,
    properties: [],
    ...overrides,
  };
}

function renderRoster(
  roster: StaffMember[],
  { mayAdminister = true, locale = "en" as "en" | "tr" } = {},
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RosterTable
        locale={locale}
        mayAdminister={mayAdminister}
        organizationId={ORGANIZATION}
        roles={[nightAuditor]}
        roster={roster}
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
    expect(screen.queryByRole("combobox")).toBeNull();
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
