"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@ranza/staff";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import {
  reinstateRole,
  retireRole,
  type StaffOutcome,
} from "../../../server/staff";
import { asPermission, asShippedRole } from "../labels";

/**
 * What each role may do.
 *
 * Shipped roles and this Organization's own in one table, because that is how
 * somebody composing a role reads it: the shared reference, and what has been
 * added to it. Another Organization's is absent and there is nothing to say
 * about that — absent is indistinguishable from never having existed.
 *
 * A retired role stays on the list. It is the record of what somebody used to
 * be able to do, and hiding it would make reinstating it impossible to find.
 */
export function RolesTable({
  locale,
  organizationId,
  roles,
}: {
  locale: string;
  organizationId: string;
  roles: readonly Role[];
}) {
  const t = useTranslations();
  // A key the catalogue does not know is shown as itself rather than as a
  // missing-translation crash: the trigger stops one being written, and a
  // screen is not where that should be discovered.
  const shippedName = (key: string) => {
    const shipped = asShippedRole(key);
    return shipped ? t(`staff.roles.${shipped}`) : null;
  };
  const commandName = (key: string) => {
    const known = asPermission(key);
    return known ? t(`staff.permissions.${known}`) : key;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("staff.role")}</TableHead>
          <TableHead>{t("staff.mayDo")}</TableHead>
          <TableHead>{t("staff.heldBy")}</TableHead>
          <TableHead className="text-end">{t("staff.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow
            data-testid="role-row"
            key={`${role.organizationId}-${role.key}`}
          >
            <TableCell>
              <div className="flex items-center gap-2">
                {shippedName(role.key) ?? role.name}
                {role.organizationId === null ? (
                  <Badge variant="outline">{t("staff.shipped")}</Badge>
                ) : null}
                {role.status === "retired" ? (
                  <Badge variant="outline">{t("staff.retired")}</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {role.permissions.length === 0
                ? t("staff.noCommands")
                : role.permissions.map(commandName).join(", ")}
            </TableCell>
            <TableCell>{role.heldBy}</TableCell>
            <TableCell className="text-end">
              {/* A shipped role arrives in a release and is the fixed reference
                  every Organization shares, so there is nothing to offer. */}
              {role.organizationId === null ? null : (
                <RoleAction
                  locale={locale}
                  organizationId={organizationId}
                  role={role}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RoleAction({
  locale,
  organizationId,
  role,
}: {
  locale: string;
  organizationId: string;
  role: Role;
}) {
  const t = useTranslations();
  const retiring = role.status === "active";
  const [outcome, act, pending] = useActionState<StaffOutcome, FormData>(
    retiring ? retireRole : reinstateRole,
    "idle",
  );

  return (
    <form action={act} className="flex items-center justify-end gap-2">
      <input name="locale" type="hidden" value={locale} />
      <input name="organization" type="hidden" value={organizationId} />
      <input name="role" type="hidden" value={role.key} />
      {/* Offered even when somebody holds it. The refusal names what to do —
          move them first — and a button quietly missing would not. */}
      {outcome === "roleIsHeld" ? (
        <span className="text-destructive text-sm">
          {t("staff.roleIsHeld")}
        </span>
      ) : null}
      {outcome === "refused" ? (
        <span className="text-destructive text-sm">{t("staff.refused")}</span>
      ) : null}
      <Button
        disabled={pending}
        size="sm"
        type="submit"
        variant={retiring ? "outline" : "secondary"}
      >
        {retiring ? t("staff.retire") : t("staff.reinstate")}
      </Button>
    </form>
  );
}
