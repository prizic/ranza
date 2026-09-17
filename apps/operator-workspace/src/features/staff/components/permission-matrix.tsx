"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@ranza/staff";
import {
  Badge,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { editRole } from "../../../server/staff";
import { asPermission, asShippedRole } from "../labels";

/**
 * What each role may do — permissions down, roles across.
 *
 * A grid rather than a list of roles with their sets written out, because the
 * question somebody opens this tab with is "who can do this?" and a list
 * answers the other one. It is also the only view in which a gap is visible: an
 * empty column says a role can do nothing, and no amount of prose does.
 *
 * Nothing here decides whether a box may be ticked. An author may only grant
 * what their own role holds, and that is the insert and update policies'
 * answer (SP-S3-01) — a check here would be a second, weaker copy of the rule
 * that guards privilege escalation. A refused tick comes back and says so.
 */
export function PermissionMatrix({
  locale,
  organizationId,
  permissions,
  roles,
}: {
  locale: string;
  organizationId: string;
  permissions: readonly string[];
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState(false);

  /**
   * The grid as it is being edited.
   *
   * Applied before the server answers, so a tick lands under the cursor rather
   * than a third of a second later, and rolled back if the policy refuses.
   */
  const [held, setHeld] = useState<Record<string, readonly string[]>>(() =>
    Object.fromEntries(roles.map((role) => [role.key, role.permissions])),
  );

  function toggle(role: Role, permission: string): void {
    const current = held[role.key] ?? role.permissions;
    const next = current.includes(permission)
      ? current.filter((key) => key !== permission)
      : [...current, permission];

    setHeld((grid) => ({ ...grid, [role.key]: next }));
    setRefused(false);

    startTransition(async () => {
      const form = new FormData();
      form.set("locale", locale);
      form.set("organization", organizationId);
      form.set("role", role.key);
      for (const key of next) form.append("permissions", key);

      const outcome = await editRole("idle", form);
      if (outcome !== "done") {
        setHeld((grid) => ({ ...grid, [role.key]: current }));
        setRefused(true);
      }
    });
  }

  function roleName(role: Role): string {
    const shipped = asShippedRole(role.key);
    return shipped ? t(`staff.roles.${shipped}`) : role.name;
  }

  function commandName(permission: string): string {
    const known = asPermission(permission);
    return known ? t(`staff.permissions.${known}`) : permission;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">
                {t("staff.permission")}
              </TableHead>
              {roles.map((role) => (
                <TableHead
                  className="text-center whitespace-nowrap"
                  key={`${role.organizationId}-${role.key}`}
                >
                  <span className="flex flex-col items-center gap-1">
                    {roleName(role)}
                    {role.organizationId === null ? (
                      <Badge variant="outline">{t("staff.shipped")}</Badge>
                    ) : role.status === "retired" ? (
                      <Badge variant="outline">{t("staff.retired")}</Badge>
                    ) : null}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((permission) => (
              <TableRow data-testid="permission-row" key={permission}>
                <TableCell>{commandName(permission)}</TableCell>
                {roles.map((role) => {
                  // A role Ranza ships arrives in a release and is the fixed
                  // reference every Organization shares (SP-S3-05). Shown, and
                  // not editable — the box says what it may do, which is the
                  // whole reason it is on the grid.
                  const shipped = role.organizationId === null;
                  const set = held[role.key] ?? role.permissions;
                  return (
                    <TableCell
                      className="text-center"
                      key={`${role.organizationId}-${role.key}`}
                    >
                      <Checkbox
                        aria-label={`${roleName(role)}: ${commandName(permission)}`}
                        checked={set.includes(permission)}
                        className="mx-auto"
                        disabled={shipped || pending}
                        onCheckedChange={() => toggle(role, permission)}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="border-t border-border p-4 text-sm text-muted-foreground">
        {refused ? (
          <span className="text-destructive">{t("staff.cannotGrant")}</span>
        ) : (
          t("staff.matrixNote")
        )}
      </p>
    </>
  );
}
