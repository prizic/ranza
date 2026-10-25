"use client";

import { useTranslations } from "next-intl";
import { asPermission, PERMISSION_SECTIONS } from "../labels";

/** Money and people first, then the sections in the grid's own order. */
const SECTION_ORDER = [
  "money",
  "people",
  ...PERMISSION_SECTIONS.map((section) => section.key).filter(
    (key) => key !== "money" && key !== "people",
  ),
] as const;

/**
 * Permissions listed under the section headings the roles grid uses, money and
 * people first. Twenty-five names in catalogue order is not read; four lines
 * that begin "Money:" and "People and HR:" are (PEOPLE-04, PEOPLE-14).
 */
export function PermissionGroups({ keys }: { keys: readonly string[] }) {
  const t = useTranslations();
  const named = (key: string): string => {
    const known = asPermission(key);
    return known ? t(`staff.permissions.${known}`) : key;
  };
  const groups = SECTION_ORDER.flatMap((sectionKey) => {
    const section = PERMISSION_SECTIONS.find(
      (candidate) => candidate.key === sectionKey,
    );
    const held = (section?.permissions ?? []).filter((permission) =>
      keys.includes(permission),
    );
    return section && held.length > 0
      ? [{ key: sectionKey, names: held.map(named) }]
      : [];
  });
  const unlisted = keys.filter(
    (key) =>
      !PERMISSION_SECTIONS.some((section) =>
        (section.permissions as readonly string[]).includes(key),
      ),
  );

  return (
    <ul className="m-0 mt-1 grid list-none gap-1 p-0">
      {groups.map((group) => (
        <li key={group.key}>
          <span className="font-medium">
            {t(`staff.sections.${group.key}`)}:
          </span>{" "}
          {group.names.join(", ")}
        </li>
      ))}
      {unlisted.length > 0 ? <li>{unlisted.join(", ")}</li> : null}
    </ul>
  );
}
