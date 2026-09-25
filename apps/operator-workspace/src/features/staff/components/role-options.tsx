"use client";

import { useTranslations } from "next-intl";
import {
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from "@ranza/ui";

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
export function RoleOptions({ roles }: { roles: readonly RoleOption[] }) {
  const t = useTranslations();
  const shipped = roles.filter((role) => role.organizationId === null);
  const authored = roles.filter((role) => role.organizationId !== null);

  const item = (role: RoleOption) => (
    <SelectItem key={roleOptionValue(role)} value={roleOptionValue(role)}>
      {role.name}
    </SelectItem>
  );

  if (authored.length === 0) return <>{shipped.map(item)}</>;

  return (
    <>
      <SelectGroup>
        <SelectLabel>{t("staff.shippedGroup")}</SelectLabel>
        {shipped.map(item)}
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>{t("staff.authoredGroup")}</SelectLabel>
        {authored.map(item)}
      </SelectGroup>
    </>
  );
}
