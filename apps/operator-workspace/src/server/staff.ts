"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import {
  AlreadyAMemberError,
  LastAdministratorError,
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
 */
export type StaffOutcome =
  "idle" | "done" | "alreadyAMember" | "lastAdministrator" | "refused";

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
  return "refused";
}

function revalidateRoster(locale: string): void {
  revalidatePath(`/${locale}/people`);
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
        roleKey: String(form.get("role") ?? ""),
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
          roleKey: String(form.get("role") ?? ""),
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
