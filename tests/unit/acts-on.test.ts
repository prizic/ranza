/**
 * Which roster rows a viewer may act on, and which roles they are offered
 * (SP-S1-35): the screen's copy of the ceilings the membership policies ask
 * (SP-S1-34, SP-S1-36). The policies stay the authority; this decides only
 * what a row and a picker offer.
 */
import { describe, expect, it } from "vitest";
import type { StaffMember } from "../../packages/ranza/staff/src";
import {
  membersAboveViewer,
  rolesWithinViewer,
} from "../../apps/operator-workspace/src/features/staff/acts-on";

const CATALOGUE = ["staff.administer", "staff.define_roles", "audit.read"];

function member(id: string, overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    membershipId: id,
    userId: id,
    email: `${id}@example.test`,
    roleId: "manager",
    roleScopeId: "00000000-0000-0000-0000-000000000000",
    roleName: "Manager",
    rolePermissions: CATALOGUE,
    accessScope: "assigned_properties",
    status: "active",
    invitation: null,
    acceptedAt: null,
    properties: [],
    ...overrides,
  };
}

describe("the members above a viewer", () => {
  it("is an organization-wide member, for a viewer of assigned Properties with the same permissions", () => {
    const roster = [
      member("manager"),
      member("owner", { accessScope: "organization_wide" }),
      member("peer"),
    ];
    expect(membersAboveViewer(roster, "manager")).toEqual(["owner"]);
  });

  it("is nobody, for an organization-wide viewer holding the whole catalogue", () => {
    const roster = [
      member("owner", { accessScope: "organization_wide" }),
      member("manager"),
      member("other-owner", { accessScope: "organization_wide" }),
    ];
    expect(membersAboveViewer(roster, "owner")).toEqual([]);
  });

  it("is a member whose role holds something the viewer's does not, whatever the viewer's reach", () => {
    const roster = [
      member("narrow", {
        accessScope: "organization_wide",
        rolePermissions: ["staff.administer"],
      }),
      member("manager"),
      member("desk", { rolePermissions: ["staff.administer"] }),
      member("nothing", { rolePermissions: [] }),
    ];
    expect(membersAboveViewer(roster, "narrow")).toEqual(["manager"]);
  });

  it("asks a revoked member the same, since undoing the revoke passes the same policy", () => {
    const roster = [
      member("desk-admin", { rolePermissions: ["staff.administer"] }),
      member("gone-manager", { status: "revoked" }),
      member("gone-peer", {
        status: "revoked",
        rolePermissions: ["staff.administer"],
      }),
    ];
    expect(membersAboveViewer(roster, "desk-admin")).toEqual(["gone-manager"]);
  });

  // A member whose role holds nothing is within any ceiling, so only the
  // missing membership can put them above — which is what the policy says:
  // it asks for staff.administer before it compares roles.
  it("is everybody, for a viewer with no active membership here, a member whose role holds nothing included", () => {
    const roster = [
      member("gone", { status: "revoked" }),
      member("manager"),
      member("nothing", { rolePermissions: [] }),
    ];
    expect(membersAboveViewer(roster, "gone")).toEqual([
      "gone",
      "manager",
      "nothing",
    ]);
    expect(membersAboveViewer(roster, "stranger")).toEqual([
      "gone",
      "manager",
      "nothing",
    ]);
  });

  it("is nobody, in an empty roster", () => {
    expect(membersAboveViewer([], "anyone")).toEqual([]);
  });

  it("never includes the viewer themselves", () => {
    const roster = [member("manager", { accessScope: "assigned_properties" })];
    expect(membersAboveViewer(roster, "manager")).toEqual([]);
  });
});

describe("the roles a viewer may hand out", () => {
  const shipped = (key: string, permissions: string[]) => ({
    key,
    organizationId: null,
    permissions,
  });
  const roles = [
    shipped("owner", CATALOGUE),
    shipped("front_desk", ["audit.read"]),
    { key: "night_desk", organizationId: "org", permissions: ["audit.read"] },
    {
      key: "trusted",
      organizationId: "org",
      permissions: ["staff.administer", "audit.read"],
    },
  ];

  it("is every role, for a viewer holding the whole catalogue", () => {
    const roster = [member("owner", { accessScope: "organization_wide" })];
    expect(
      rolesWithinViewer(roles, roster, "owner").map((role) => role.key),
    ).toEqual(["owner", "front_desk", "night_desk", "trusted"]);
  });

  it("is only the roles, shipped or the Organization's own, within a narrower viewer's", () => {
    const roster = [
      member("narrow", {
        accessScope: "organization_wide",
        rolePermissions: ["staff.administer", "audit.read"],
      }),
    ];
    expect(
      rolesWithinViewer(roles, roster, "narrow").map((role) => role.key),
    ).toEqual(["front_desk", "night_desk", "trusted"]);
  });

  it("does not depend on the viewer's reach", () => {
    const roster = [member("manager")];
    expect(rolesWithinViewer(roles, roster, "manager")).toHaveLength(4);
  });

  it("is none, for a viewer with no active membership here, a role holding nothing included", () => {
    const withAnEmptyRole = [...roles, shipped("placeholder", [])];
    const roster = [member("gone", { status: "revoked" })];
    expect(rolesWithinViewer(withAnEmptyRole, roster, "gone")).toEqual([]);
    expect(rolesWithinViewer(withAnEmptyRole, [], "stranger")).toEqual([]);
  });
});
