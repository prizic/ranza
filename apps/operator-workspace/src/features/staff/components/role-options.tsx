"use client";

import { useTranslations } from "next-intl";
import type { ComboboxOption } from "@ranza/ui";

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
