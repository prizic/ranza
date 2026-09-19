export { createStaffModule } from "./module";
export type { InviteStaffMember } from "./module";
export {
  AlreadyAMemberError,
  INVITATION_LIFETIME_DAYS,
  LastAdministratorError,
  RoleIsHeldError,
  ROLE_NAME,
  StaffRefusedError,
  UNDO_REVOKE_WINDOW_HOURS,
} from "./contracts";
export type {
  InvitationStatus,
  Invited,
  MembershipStatus,
  NewRole,
  Role,
  StaffMember,
} from "./contracts";
export type { StaffDeps } from "./ports";
