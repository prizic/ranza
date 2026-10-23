/**
 * Who can sign in to an Organization and has no employment record in it
 * (HR-S1-49).
 *
 * Membership is access and an employee record is employment (the HR module's
 * README), so the two lists are separate and this is the difference between
 * them. A terminated employee's record still holds its login, so a leaver is
 * not offered again (HR-S1-52); a revoked membership is not offered at all
 * (HR-S1-53).
 */

export interface RosterLogin {
  userId: string;
  email: string;
  status: "active" | "revoked";
}

export interface UnregisteredStaffMember {
  userId: string;
  email: string;
}

export function loginsWithoutEmployment(
  roster: readonly RosterLogin[],
  employees: readonly { userId: string | null }[],
): readonly UnregisteredStaffMember[] {
  const employed = new Set(employees.map((employee) => employee.userId));
  return roster
    .filter((login) => login.status === "active" && !employed.has(login.userId))
    .map(({ userId, email }) => ({ userId, email }));
}
