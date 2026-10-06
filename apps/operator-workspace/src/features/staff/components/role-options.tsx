"use client";

import { useTranslations } from "next-intl";
import type { StaffMember } from "@ranza/staff";
import type { ComboboxOption } from "@ranza/ui";
import { shippedRoleOf } from "../labels";

/** Every role Ranza ships lives in this scope, which is not an Organization. */
const NIL_SCOPE = "00000000-0000-0000-0000-000000000000";

/** A role as a picker offers it, already named in the reader's language. */
export interface RoleOption {
  key: string;
  /** Null for a role Ranza ships. */
  organizationId: string | null;
  name: string;
}

/**
 * `<scope>:<key>`, the pair the database keys on, with an empty scope for a
 * role Ranza ships. The key alone is ambiguous: it would resolve an
 * Organization's own role to the shipped one its name slugs to.
 */
export function roleOptionValue(
  role: Pick<RoleOption, "key" | "organizationId">,
): string {
  return `${role.organizationId ?? ""}:${role.key}`;
}

/**
 * The role a member holds, as the picker's own value.
 *
 * The nil uuid is a scope, not an Organization, so it maps to the empty half of
 * the pair the way a shipped role does everywhere else.
 */
export function heldRoleValue(
  member: Pick<StaffMember, "roleId" | "roleScopeId">,
): string {
  return roleOptionValue({
    key: member.roleId,
    organizationId:
      member.roleScopeId === NIL_SCOPE ? null : member.roleScopeId,
  });
}

/** A member's role as words, in the viewer's language when Ranza ships it. */
export function roleNameOf(
  member: Pick<StaffMember, "roleId" | "roleScopeId" | "roleName">,
  t: ReturnType<typeof useTranslations>,
): string {
  const shipped = shippedRoleOf({
    key: member.roleId,
    organizationId:
      member.roleScopeId === NIL_SCOPE ? null : member.roleScopeId,
  });
  return shipped ? t(`staff.roles.${shipped}`) : member.roleName;
}

/**
 * A picker's roles, grouped the way the roles grid groups its columns: what
 * Ranza ships, then what this Organization wrote. The group is what tells an
 * Organization's own "Front desk" from the shipped one when the names match,
 * and with nothing authored there is only one group, so no heading.
 */
export function useRoleOptions(roles: readonly RoleOption[]): ComboboxOption[] {
  const t = useTranslations();
  const authored = roles.some((role) => role.organizationId !== null);
  const shippedGroup = t("staff.shippedGroup");
  const authoredGroup = t("staff.authoredGroup");

  return [...roles]
    .sort(
      (a, b) =>
        Number(a.organizationId !== null) - Number(b.organizationId !== null),
    )
    .map((role) => ({
      value: roleOptionValue(role),
      label: role.name,
      ...(authored
        ? {
            group: role.organizationId === null ? shippedGroup : authoredGroup,
          }
        : {}),
    }));
}
