"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Archive, RotateCcw } from "lucide-react";
import type { Role } from "@ranza/staff";
import {
  DataTableRowActions,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@ranza/ui";
import { editRole, reinstateRole, retireRole } from "../../../server/staff";
import { asPermission, shippedRoleOf } from "../labels";

/**
 * What each role may do — permissions down, roles across.
 *
 * A grid rather than a list of roles with their sets written out, because the
 * question somebody opens this tab with is "who can do this?" and a list
 * answers the other one. It is also the only view in which a gap is visible: an
 * empty column says a role can do nothing, and no amount of prose does.
 *
 * Somebody without staff.define_roles reads the grid and edits nothing (#80).
 * For an author, nothing here decides whether a box may be ticked: they may
 * only grant what their own role holds, and that is the insert and update
 * policies' answer (SP-S3-01) — a check here would be a second, weaker copy of
 * the rule that guards privilege escalation. A refused tick comes back and says
 * so.
 */
export function PermissionMatrix({
  locale,
  mayDefineRoles,
  organizationId,
  permissions,
  roles,
}: {
  locale: string;
  /** Without staff.define_roles the grid is read, not edited (#80). */
  mayDefineRoles: boolean;
  organizationId: string;
  permissions: readonly string[];
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<"grant" | "retire" | null>(null);

  // Shipped first, then this Organization's own. The order is the grid's one
  // piece of structure: a rule falls between the two groups, which says "fixed
  // reference" on the left of it and "yours" on the right without a legend.
  const shipped = roles.filter((role) => role.organizationId === null);
  const authored = roles.filter((role) => role.organizationId !== null);
  const ordered = [...shipped, ...authored];

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
    setRefused(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("locale", locale);
      form.set("organization", organizationId);
      form.set("role", role.key);
      for (const key of next) form.append("permissions", key);

      const outcome = await editRole("idle", form);
      if (outcome !== "done") {
        setHeld((grid) => ({ ...grid, [role.key]: current }));
        setRefused("grant");
      }
    });
  }

  /**
   * Retire a role, or bring it back.
   *
   * In the column header rather than a row of its own, because on this grid a
   * role *is* a column — and the holder count sits beside it, since that is the
   * whole of why retiring may be refused (SP-S3-02).
   */
  function shelve(role: Role): void {
    setRefused(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("locale", locale);
      form.set("organization", organizationId);
      form.set("role", role.key);

      const act = role.status === "active" ? retireRole : reinstateRole;
      if ((await act("idle", form)) !== "done") setRefused("retire");
    });
  }

  function roleName(role: Role): string {
    const shipped = shippedRoleOf(role);
    return shipped ? t(`staff.roles.${shipped}`) : role.name;
  }

  function commandName(permission: string): string {
    const known = asPermission(permission);
    return known ? t(`staff.permissions.${known}`) : permission;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table aria-label={t("staff.rolesTab")}>
          <TableHeader>
            {/* Two header rows: the group, then the roles in it. The word
                "Ranza" belonged under all five shipped columns and now appears
                once, which is what a group header is for — and the rule below
                falls where the groups meet rather than being a second device
                saying the same thing. */}
            {authored.length > 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky start-0 z-10 bg-card" />
                <TableHead
                  className="pb-1 text-center text-xs font-normal text-muted-foreground"
                  colSpan={shipped.length}
                  scope="colgroup"
                >
                  {t("staff.shippedGroup")}
                </TableHead>
                <TableHead
                  className="border-s border-border pb-1 text-center text-xs font-normal text-muted-foreground"
                  colSpan={authored.length}
                  scope="colgroup"
                >
                  {t("staff.authoredGroup")}
                </TableHead>
              </TableRow>
            ) : null}
            <TableRow>
              <TableHead
                className="sticky start-0 z-10 min-w-56 bg-card"
                scope="col"
              >
                {t("staff.permission")}
              </TableHead>
              {ordered.map((role, index) => (
                <TableHead
                  className={cn(
                    "h-auto py-3 text-center align-bottom whitespace-nowrap",
                    // The one rule on the grid, and it carries meaning: left of
                    // it is what Ranza ships and nobody edits.
                    index === shipped.length && shipped.length > 0
                      ? "border-s border-border"
                      : null,
                  )}
                  key={`${role.organizationId}-${role.key}`}
                  scope="col"
                >
                  <span className="flex flex-col items-center gap-0.5">
                    <span
                      className={
                        role.status === "retired"
                          ? "text-muted-foreground line-through"
                          : undefined
                      }
                    >
                      {roleName(role)}
                    </span>
                    {role.organizationId === null ? null : (
                      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        {t("staff.heldByCount", { count: role.heldBy })}
                        {mayDefineRoles ? (
                          <DataTableRowActions
                            actions={[
                              role.status === "active"
                                ? {
                                    label: t("staff.retire"),
                                    icon: Archive,
                                    onSelect: () => shelve(role),
                                    destructive: true,
                                  }
                                : {
                                    label: t("staff.reinstate"),
                                    icon: RotateCcw,
                                    onSelect: () => shelve(role),
                                  },
                            ]}
                            label={`${t("staff.actions")}: ${roleName(role)}`}
                          />
                        ) : null}
                      </span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((permission) => (
              <TableRow data-testid="permission-row" key={permission}>
                <TableCell className="sticky start-0 z-10 bg-card">
                  {commandName(permission)}
                </TableCell>
                {ordered.map((role, index) => {
                  // A role Ranza ships arrives in a release and is the fixed
                  // reference every Organization shares (SP-S3-05). Shown, and
                  // not editable — the box says what it may do, which is the
                  // whole reason it is on the grid. Every box is fixed for a
                  // viewer who may not define roles.
                  const fixed = role.organizationId === null || !mayDefineRoles;
                  const set = held[role.key] ?? role.permissions;
                  return (
                    <TableCell
                      className={cn(
                        "text-center",
                        index === shipped.length && shipped.length > 0
                          ? "border-s border-border"
                          : null,
                      )}
                      key={`${role.organizationId}-${role.key}`}
                    >
                      <Checkbox
                        aria-label={`${roleName(role)}: ${commandName(permission)}`}
                        checked={set.includes(permission)}
                        className="mx-auto"
                        disabled={fixed || pending}
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
        {refused === "grant" ? (
          <span className="text-danger">{t("staff.cannotGrant")}</span>
        ) : refused === "retire" ? (
          <span className="text-danger">{t("staff.roleIsHeld")}</span>
        ) : (
          t("staff.matrixNote")
        )}
      </p>
    </>
  );
}
