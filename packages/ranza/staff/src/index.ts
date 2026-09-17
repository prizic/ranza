export { createStaffModule } from "./module";
export type { InviteStaffMember, StaffModule } from "./module";
export {
  AlreadyAMemberError,
  INVITATION_LIFETIME_DAYS,
  PLATFORM_CORE_MODULE,
  STAFF_ADMINISTRATION,
  LastAdministratorError,
  StaffRefusedError,
  UNDO_REVOKE_WINDOW_HOURS,
} from "./contracts";
export type {
  Invited,
  InvitationStatus,
  MembershipStatus,
  StaffMember,
} from "./contracts";
export type { StaffDeps } from "./ports";
