/**
 * The public vocabulary of Staff and permissions.
 *
 * Who works for an Organization, what they may do, and which Properties they
 * reach. Designed before it was written: the diagrams and the row-per-boundary
 * table are in `docs/features/staff-and-permissions/`, and every rule below
 * points at the row that decided it.
 *
 * Slice 1 is the roster and reach. A role is already a named set of permissions
 * rather than a label — that is the decision, not a later upgrade — but the
 * catalogue those permissions come from is slice 2, so slice 1 only ever hands
 * out the roles Ranza ships.
 */

/**
 * A membership's place in its Organization.
 *
 * `revoked` is a resting state and not an end: a membership is never deleted,
 * because audit records name the person as the actor of everything they did and
 * a row that could vanish would leave that history pointing at nobody
 * (SP-S1-11).
 */
export type MembershipStatus = "active" | "revoked";

/** An invitation is only ever the way to a password (SP-S1-07). */
export type InvitationStatus = "pending" | "accepted" | "withdrawn" | "expired";

/**
 * How long an unaccepted invitation stands.
 *
 * Seven days, because a password-setting link that never expires is a standing
 * credential (SP-S1-23).
 */
const INVITATION_LIFETIME_DAYS = 7;

/**
 * How long a revoke can be taken back.
 *
 * Wall clock, because an Organization has no business date — ADR 0021 is about
 * Properties (SP-S1-22). Carried in the update's own predicate, so a late undo
 * returns no row rather than raising.
 */
const UNDO_REVOKE_WINDOW_HOURS = 24;

/** A Staff Member as the roster shows them. */
export interface StaffMember {
  membershipId: string;
  userId: string;
  email: string;
  roleId: string;
  /**
   * The role's scope: this Organization, or the nil uuid for one Ranza ships.
   * Meaningless without `roleId` and vice versa — it is the pair the database
   * keys on, and a screen that offered the key alone would resolve an
   * Organization's own role to a shipped one of the same name.
   */
  roleScopeId: string;
  roleName: string;
  status: MembershipStatus;
  /**
   * The state of their invitation, or null when there never was one.
   *
   * Null is the normal case for whoever created the Organization: they arrived
   * through sign-up, not through a link. `acceptedAt` is null for them too,
   * which is why the roster reads this and not that — driving a badge off
   * `acceptedAt` told the Organization's own Owner they were awaiting a
   * password they had already set.
   */
  invitation: InvitationStatus | null;
  /** When they set a password, for a membership that came from an invitation. */
  acceptedAt: string | null;
  /** Empty is a normal state, not a half-finished one (SP-S1-06). */
  properties: readonly { propertyId: string; propertyName: string }[];
}

/** What an invitation produced, including the link to hand over by hand. */
export interface Invited {
  membershipId: string;
  invitationId: string;
  /**
   * Shown to whoever created it, to pass on themselves.
   *
   * Notifications is blueprint 5.12 and does not exist, so the alternative was
   * writing an invitation nothing could deliver (SP-S1-26). This is honest and
   * it is one field on a screen.
   */
  token: string;
  expiresAt: string;
}

/**
 * A staff change that was refused.
 *
 * One type for every reason the actor may not do it, on the same principle as
 * `CheckInError`: out of reach, unentitled, lapsed, or no such Organization are
 * the same answer, and telling them apart would confirm that an Organization
 * the caller cannot see is there.
 */
export class StaffRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffRefusedError";
  }
}

/**
 * The Organization would be left with nobody who can add staff.
 *
 * Its own type because it is the one refusal an actor can act on — find another
 * Owner first (SP-S1-12).
 */
export class LastAdministratorError extends StaffRefusedError {
  constructor(message: string) {
    super(message);
    this.name = "LastAdministratorError";
  }
}

/** That person already has a membership in this Organization (SP-S1-03). */
export class AlreadyAMemberError extends StaffRefusedError {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyAMemberError";
  }
}

/** A role as the grid shows it. */
export interface Role {
  /** Its key. Unique within its scope, and what a membership names. */
  key: string;
  name: string;
  permissions: readonly string[];
  /** Null for the roles Ranza ships, which every Organization shares. */
  organizationId: string | null;
  status: "active" | "retired";
  /** How many active memberships hold it — what makes retiring refusable. */
  heldBy: number;
}

/** What `defineRole` needs, and what the role editor collects. */
export interface NewRole {
  organizationId: string;
  name: string;
  permissions: readonly string[];
}

/** A role somebody still holds cannot be retired (SP-S3-02). */
export class RoleIsHeldError extends StaffRefusedError {
  constructor(message: string) {
    super(message);
    this.name = "RoleIsHeldError";
  }
}

/** The name is what makes a set of permissions a role (SP-S3-03). */
const ROLE_NAME = { min: 1, max: 80 } as const;

export { INVITATION_LIFETIME_DAYS, ROLE_NAME, UNDO_REVOKE_WINDOW_HOURS };
