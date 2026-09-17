"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { StaffMember } from "@ranza/staff";
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
  revokeStaffMember,
  undoStaffRevoke,
  type StaffOutcome,
} from "../../../server/staff";

/**
 * Who works here, and where.
 *
 * Revoked memberships are shown rather than hidden. A roster that dropped them
 * would make the undo window invisible — somebody who has just been revoked by
 * mistake would have nothing to press — and it would leave the history of who
 * used to work here unreadable.
 *
 * Reaching no Property is shown as a state rather than an empty cell, because
 * it is a normal one: a person can be on the roster before anybody has decided
 * where they work (SP-S1-06).
 */
export function RosterTable({
  locale,
  organizationId,
  roster,
}: {
  locale: string;
  organizationId: string;
  roster: readonly StaffMember[];
}) {
  const t = useTranslations();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("staff.email")}</TableHead>
          <TableHead>{t("staff.role")}</TableHead>
          <TableHead>{t("staff.properties")}</TableHead>
          <TableHead>{t("staff.status")}</TableHead>
          <TableHead className="text-end">{t("staff.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roster.map((member) => (
          <TableRow data-testid="staff-row" key={member.membershipId}>
            <TableCell>{member.email}</TableCell>
            <TableCell>{member.roleName}</TableCell>
            <TableCell>
              {member.properties.length === 0 ? (
                <span className="text-muted-foreground">
                  {t("staff.reachesNothing")}
                </span>
              ) : (
                member.properties.map((p) => p.propertyName).join(", ")
              )}
            </TableCell>
            <TableCell>
              <Badge
                variant={member.status === "active" ? "secondary" : "outline"}
              >
                {member.status === "active"
                  ? member.acceptedAt
                    ? t("staff.active")
                    : t("staff.awaitingPassword")
                  : t("staff.revoked")}
              </Badge>
            </TableCell>
            <TableCell className="text-end">
              <MembershipAction
                locale={locale}
                member={member}
                organizationId={organizationId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Revoke, or take it back.
 *
 * Offered to everybody. Whether this viewer may do it is the policies' answer,
 * and hiding the button on their behalf would be a second, weaker copy of it —
 * a refusal that says so is more honest than a control that is quietly absent.
 */
function MembershipAction({
  locale,
  member,
  organizationId,
}: {
  locale: string;
  member: StaffMember;
  organizationId: string;
}) {
  const t = useTranslations();
  const revoking = member.status === "active";
  const [outcome, act, pending] = useActionState<StaffOutcome, FormData>(
    revoking ? revokeStaffMember : undoStaffRevoke,
    "idle",
  );

  return (
    <form action={act} className="flex items-center justify-end gap-2">
      <input name="locale" type="hidden" value={locale} />
      <input name="organization" type="hidden" value={organizationId} />
      <input name="member" type="hidden" value={member.userId} />
      {outcome === "lastAdministrator" ? (
        <span className="text-destructive text-sm">
          {t("staff.lastAdministrator")}
        </span>
      ) : null}
      {outcome === "refused" ? (
        <span className="text-destructive text-sm">{t("staff.refused")}</span>
      ) : null}
      <Button
        disabled={pending}
        size="sm"
        type="submit"
        variant={revoking ? "outline" : "secondary"}
      >
        {revoking ? t("staff.revoke") : t("staff.undoRevoke")}
      </Button>
    </form>
  );
}
