"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  AlreadyAMemberError,
  LastAdministratorError,
  RoleIsHeldError,
  StaffRefusedError,
  type Role,
  type StaffMember,
} from "@ranza/staff";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * The roster, and the commands that change it.
 *
 * Same funnel as every other write (ADR 0007): the session is resolved here and
 * the module runs the work inside a request context. Nothing on this path asks
 * whether the viewer may administer staff — the policies answer, and a check in
 * front of them would be the weaker of the two while inviting somebody to trust
 * it instead.
 */

/**
 * What a form shows afterwards.
 *
 * `refused` covers every reason a command did not happen: no staff authority,
 * out of reach, a Subscription that has lapsed, an Organization that is not
 * there. They are one outcome because telling them apart would confirm that an
 * Organization the viewer cannot see exists. `lastAdministrator` is separate
 * because it is the one refusal the actor can act on — find another Owner
 * first.
 *
 * What is not one of the module's refusals is a fault, and is logged before it
 * is shown as `refused`. Shown that way because telling it apart would say too
 * much; logged because that is how F-1 hid: every role change failed, the
 * screen said "refused", and nothing anywhere recorded why.
 */
export type StaffOutcome =
  | "idle"
  | "done"
  | "alreadyAMember"
  | "lastAdministrator"
  | "roleIsHeld"
  | "refused";

/** What an invitation leaves on the screen: a link somebody has to pass on. */
export interface InviteOutcome {
  state: StaffOutcome;
  /**
   * Shown once, to whoever created it. There is no Notifications module
   * (blueprint 5.12) and only the token's digest is stored, so this is the only
   * moment it exists in a readable form.
   */
  token?: string;
  expiresAt?: string;
}

function outcomeFor(error: unknown): StaffOutcome {
  if (error instanceof AlreadyAMemberError) return "alreadyAMember";
  if (error instanceof LastAdministratorError) return "lastAdministrator";
  if (error instanceof RoleIsHeldError) return "roleIsHeld";
  if (!(error instanceof StaffRefusedError)) {
    console.error("staff command failed", error);
  }
  return "refused";
}

function revalidateRoster(locale: string): void {
  revalidatePath(`/${locale}/people`);
}

/**
 * A role option, back into the pair the module wants.
 *
 * `<scope>:<key>`, where an empty scope means a role Ranza ships. The pair is
 * what the database keys on, and sending only the key would resolve an
 * Organization's own role to the shipped one that happens to share its name.
 */
function roleFrom(value: string): { roleKey: string; roleScopeId?: string } {
  const separator = value.indexOf(":");
  if (separator < 0) return { roleKey: value };
  const scope = value.slice(0, separator);
  const roleKey = value.slice(separator + 1);
  return scope ? { roleKey, roleScopeId: scope } : { roleKey };
}

/**
 * Who works here.
 *
 * The Organization comes from the viewer's own reach rather than from the
 * request, so a crafted form cannot ask for another one — and if it did, the
 * policies would answer with nothing anyway.
 */
export async function readRoster(
  organizationId: string,
): Promise<readonly StaffMember[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().staff.readRoster(
    { userId: viewer.userId },
    organizationId,
  );
}

export async function inviteStaffMember(
  _previous: InviteOutcome,
  form: FormData,
): Promise<InviteOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { state: "refused" };

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return { state: "refused" };

  const propertyIds = form
    .getAll("properties")
    .map(String)
    .filter((value) => value.length > 0);

  try {
    const invited = await getComposition().staff.invite(
      { userId: viewer.userId },
      {
        organizationId: String(form.get("organization") ?? ""),
        email: String(form.get("email") ?? ""),
        ...roleFrom(String(form.get("role") ?? "")),
        accessScope:
          form.get("scope") === "organization_wide"
            ? "organization_wide"
            : "assigned_properties",
        propertyIds,
      },
    );
    revalidateRoster(locale);
    return {
      state: "done",
      token: invited.token,
      expiresAt: invited.expiresAt,
    };
  } catch (error) {
    return { state: outcomeFor(error) };
  }
}

export async function changeStaffRole(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .changeRole(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          userId: String(form.get("member") ?? ""),
          ...roleFrom(String(form.get("role") ?? "")),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

export async function revokeStaffMember(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .revoke(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          userId: String(form.get("member") ?? ""),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

export async function undoStaffRevoke(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .undoRevoke(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          userId: String(form.get("member") ?? ""),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

/** The shape every command above shares: a session, a locale, one call. */
async function run(
  form: FormData,
  command: (
    staff: ReturnType<typeof getComposition>["staff"],
    viewerId: string,
    locale: string,
  ) => Promise<void>,
): Promise<StaffOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return "refused";

  const locale = String(form.get("locale") ?? "");
  if (!isSupportedLocale(locale)) return "refused";

  try {
    await command(getComposition().staff, viewer.userId, locale);
    return "done";
  } catch (error) {
    return outcomeFor(error);
  }
}

/**
 * Every role this Organization may hand out.
 *
 * Shipped and authored in one list, told apart by `organizationId` being null,
 * because that is how the grid reads: the shared reference and this
 * Organization's own additions to it.
 */
export async function readRoles(
  organizationId: string,
): Promise<readonly Role[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().staff.readRoles(
    { userId: viewer.userId },
    organizationId,
  );
}

export async function defineRole(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .defineRole(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          name: String(form.get("name") ?? ""),
          permissions: form.getAll("permissions").map(String),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

/**
 * Changes what one of this Organization's own roles may do.
 *
 * The whole set, not a delta: the policy's ceiling is `permissions <@ what the
 * author holds`, which is a question about the resulting set, and sending a
 * single permission would mean the database had to reconstruct the rest.
 */
export async function editRole(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .editRole(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          key: String(form.get("role") ?? ""),
          permissions: form.getAll("permissions").map(String),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

export async function retireRole(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .retireRole(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          key: String(form.get("role") ?? ""),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}

export async function reinstateRole(
  _previous: StaffOutcome,
  form: FormData,
): Promise<StaffOutcome> {
  return run(form, (staff, viewer, locale) =>
    staff
      .reinstateRole(
        { userId: viewer },
        {
          organizationId: String(form.get("organization") ?? ""),
          key: String(form.get("role") ?? ""),
        },
      )
      .then(() => revalidateRoster(locale)),
  );
}
