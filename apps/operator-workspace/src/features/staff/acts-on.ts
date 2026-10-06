import type { StaffMember } from "@ranza/staff";

const ADMINISTER = "staff.administer";

/**
 * What the viewer holds here, as the policies read it: the permissions of the
 * role on their active membership, and whether it reaches the whole
 * Organization. Null without an active membership, which acts on nobody —
 * every write policy asks for staff.administer on one first.
 */
function ceilingOf(
  roster: readonly StaffMember[],
  viewerUserId: string,
): { held: ReadonlySet<string>; organizationWide: boolean } | null {
  const viewer = roster.find(
    (member) => member.userId === viewerUserId && member.status === "active",
  );
  if (!viewer) return null;
  return {
    held: new Set(viewer.rolePermissions),
    organizationWide: viewer.accessScope === "organization_wide",
  };
}

function holdsAll(
  held: ReadonlySet<string>,
  permissions: readonly string[],
): boolean {
  return permissions.every((permission) => held.has(permission));
}

/**
 * The members of a roster the viewer may not act on, by membership id.
 *
 * The two ceilings the membership update policy asks of the row being replaced
 * (SP-S1-34, SP-S1-36): the member's role must hold nothing the viewer's does
 * not, and a member who reaches the whole Organization is acted on only by
 * somebody who does too. A row the policy would refuse is shown, and offers
 * nothing to press (SP-S1-35). Revoked members are asked the same, because
 * undoing a revoke passes the same policy.
 *
 * The viewer's own row is never above them: their role is within itself and
 * their reach is their reach, which is what the policy says too. Whether they
 * may revoke or narrow themselves is the last-administrator trigger's question
 * (SP-S1-12, SP-S1-38), and it has its own message.
 */
export function membersAboveViewer(
  roster: readonly StaffMember[],
  viewerUserId: string,
): readonly string[] {
  const ceiling = ceilingOf(roster, viewerUserId);
  return roster
    .filter(
      (member) =>
        !ceiling ||
        !holdsAll(ceiling.held, member.rolePermissions) ||
        (member.accessScope === "organization_wide" &&
          !ceiling.organizationWide),
    )
    .map((member) => member.membershipId);
}

/**
 * The roles the viewer may hand out: those whose every permission their own
 * role holds (SP-S1-34), the ceiling the policies put on a membership's role
 * whether it is written by an invitation or a change. Reach does not enter —
 * a role has none of its own.
 */
export function rolesWithinViewer<
  Role extends { permissions: readonly string[] },
>(
  roles: readonly Role[],
  roster: readonly StaffMember[],
  viewerUserId: string,
): Role[] {
  const ceiling = ceilingOf(roster, viewerUserId);
  if (!ceiling) return [];
  return roles.filter((role) => holdsAll(ceiling.held, role.permissions));
}

/**
 * Whether giving a member this role would leave the Organization with nobody
 * able to add staff, or nobody able to at every Property — the two refusals of
 * the last-administrator trigger (SP-S1-12, SP-S1-38).
 *
 * A prediction, so the refusal can come before a confirmation rather than
 * after a wasted one (SP-S1-47). The trigger stays the authority: this reads
 * the roster the viewer was shown, and a roster that has since changed is
 * answered by the trigger, not by this.
 */
export function leavesNoAdministrator(
  roster: readonly StaffMember[],
  memberUserId: string,
  nextPermissions: readonly string[],
): boolean {
  const member = roster.find((candidate) => candidate.userId === memberUserId);
  if (!member || member.status !== "active") return false;
  if (!member.rolePermissions.includes(ADMINISTER)) return false;
  if (nextPermissions.includes(ADMINISTER)) return false;

  const others = roster.filter(
    (candidate) =>
      candidate.userId !== memberUserId &&
      candidate.status === "active" &&
      candidate.rolePermissions.includes(ADMINISTER),
  );
  if (others.length === 0) return true;
  return (
    member.accessScope === "organization_wide" &&
    !others.some((other) => other.accessScope === "organization_wide")
  );
}
