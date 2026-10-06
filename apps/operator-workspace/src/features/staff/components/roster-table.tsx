"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  CircleSlash,
  Clock,
  RotateCcw,
  UserMinus,
} from "lucide-react";
import type { Role, StaffMember } from "@ranza/staff";
import {
  Avatar,
  AvatarFallback,
  Combobox,
  DataTableRowActions,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type StatusBadgeProps,
} from "@ranza/ui";
import {
  revokeStaffMember,
  undoStaffRevoke,
  type StaffOutcome,
} from "../../../server/staff";
import { shippedRoleOf } from "../labels";
import { leavesNoAdministrator } from "../acts-on";
import { usePickerLabels } from "../../../lib/picker-labels";
import {
  ConfirmRoleChange,
  type RoleChangeProposal,
} from "./confirm-role-change";
import {
  heldRoleValue,
  roleNameOf,
  roleOptionValue,
  useRoleOptions,
} from "./role-options";

/**
 * Who works here, and where.
 *
 * The role is a control rather than a word, which is the mockup's shape. It
 * only proposes: a change ends every session the member holds, so picking a
 * role opens a confirmation and nothing is sent until it is given (SP-S1-41).
 *
 * Revoked memberships stay on the list. A roster that dropped them would make
 * the undo window invisible — somebody revoked by mistake would have nothing to
 * press — and would leave the history of who used to work here unreadable.
 *
 * Reaching no Property is shown as a state rather than an empty cell, because
 * it is a normal one: a person can be on the roster before anybody has decided
 * where they work (SP-S1-06).
 *
 * A viewer without staff.administer reads the roster: the role is a word and
 * the row has no actions (#80). One who holds it reads the same on a row whose
 * member is above them in role or reach, and the row says why (SP-S1-35).
 */
export function RosterTable({
  locale,
  mayAdminister,
  membersAboveViewer,
  organizationId,
  roles,
  roster,
  viewerUserId,
}: {
  locale: string;
  mayAdminister: boolean;
  /** Membership ids the policies would refuse the viewer acting on. */
  membersAboveViewer: readonly string[];
  organizationId: string;
  /** Only the roles the viewer may hand out (SP-S1-34). */
  roles: readonly Role[];
  roster: readonly StaffMember[];
  viewerUserId: string;
}) {
  const t = useTranslations();
  const above = new Set(membersAboveViewer);
  const [proposal, setProposal] = useState<RoleChangeProposal | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Each pick is its own decision, so it starts a dialog with nothing left over
  // from the last: a refusal read once must not block a retry.
  const [attempt, setAttempt] = useState(0);

  function propose(member: StaffMember, next: string): void {
    const from = heldRoleValue(member);
    if (next === from) return;

    const target = roles.find((role) => roleOptionValue(role) === next);
    if (!target) return;

    const shipped = shippedRoleOf(target);
    const toName = shipped ? t(`staff.roles.${shipped}`) : target.name;
    const fromName = roleNameOf(member, t);
    // Two roles can share a name — an Organization's own "Front desk" beside
    // the shipped one — and a confirmation reading "from Front desk to Front
    // desk" would not say what is changing.
    const group = (authored: boolean): string =>
      t(authored ? "staff.authoredGroup" : "staff.shippedGroup");
    const named = fromName === toName;

    setProposal({
      userId: member.userId,
      email: member.email,
      fromValue: from,
      fromName: named
        ? `${fromName} (${group(from.split(":")[0] !== "")})`
        : fromName,
      toValue: next,
      toName: named
        ? `${toName} (${group(target.organizationId !== null)})`
        : toName,
      triggerId: `staff-role-${member.membershipId}`,
      self: member.userId === viewerUserId,
      selfLosesAccess: !target.permissions.includes("staff.administer"),
      lastAdministrator: leavesNoAdministrator(
        roster,
        member.userId,
        target.permissions,
      ),
    });
    setAttempt((count) => count + 1);
    setConfirming(true);
  }

  return (
    <div className="overflow-x-auto">
      <Table aria-label={t("staff.peopleTab")}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("staff.person")}</TableHead>
            <TableHead scope="col">{t("staff.role")}</TableHead>
            <TableHead scope="col">{t("staff.properties")}</TableHead>
            <TableHead scope="col">{t("staff.status")}</TableHead>
            {mayAdminister ? (
              <TableHead className="text-end" scope="col">
                <span className="sr-only">{t("staff.actions")}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((member) => {
            const actsOn = mayAdminister && !above.has(member.membershipId);
            return (
              <TableRow data-testid="staff-row" key={member.membershipId}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">
                        {initials(member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex flex-col">
                      <span className="font-medium">{member.email}</span>
                      {/* Awaiting a password only when a link is actually
                        outstanding. Whoever created the Organization arrived
                        through sign-up and has no invitation at all, so reading
                        `acceptedAt` here told them they were waiting on a
                        password they had already set. */}
                      {member.invitation === "pending" ? (
                        <span className="text-xs text-muted-foreground">
                          {t("staff.invitationSent")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {actsOn ? (
                    <RolePicker
                      member={member}
                      onPropose={propose}
                      roles={roles}
                    />
                  ) : (
                    roleNameOf(member, t)
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.accessScope === "organization_wide"
                    ? t("staff.reachesEverywhere")
                    : member.properties.length === 0
                      ? t("staff.reachesNothing")
                      : member.properties.map((p) => p.propertyName).join(", ")}
                </TableCell>
                <TableCell>
                  <StatusBadge {...statusOf(member, t)} />
                </TableCell>
                {mayAdminister ? (
                  <TableCell className="text-end">
                    {actsOn ? (
                      <MembershipActions
                        locale={locale}
                        member={member}
                        organizationId={organizationId}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("staff.aboveYou")}
                      </span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {proposal ? (
        <ConfirmRoleChange
          current={roster.find((member) => member.userId === proposal.userId)}
          key={attempt}
          locale={locale}
          onClose={() => setConfirming(false)}
          open={confirming}
          organizationId={organizationId}
          proposal={proposal}
        />
      ) : null}
    </div>
  );
}

/**
 * The three states a membership is in, as colour, word and shape together.
 *
 * Blueprint 18.5 forbids colour alone, and `StatusBadge` makes that structural
 * — there is no way to render one without a label and an icon.
 *
 * Revoked is neutral rather than danger. It is a resting state, not a failure:
 * somebody left, and the row remains because the history of who used to work
 * here is worth keeping. Painting it red would say a mistake had been made.
 */
function statusOf(
  member: StaffMember,
  t: (
    key: "staff.active" | "staff.awaitingPassword" | "staff.revoked",
  ) => string,
): StatusBadgeProps {
  if (member.status === "revoked") {
    return { icon: CircleSlash, label: t("staff.revoked"), tone: "neutral" };
  }
  if (member.invitation === "pending") {
    return { icon: Clock, label: t("staff.awaitingPassword"), tone: "warning" };
  }
  return { icon: CircleCheck, label: t("staff.active"), tone: "success" };
}

/**
 * Initials from an address, because a Staff Member has no name.
 *
 * `public.users` holds an email and nothing else — somebody is invited by
 * address long before anybody knows what to call them. The mockup's avatar
 * reads a name; this reads the only thing there is, and a name field would be a
 * schema decision rather than a styling one.
 */
function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : local.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The role, as a control, for a viewer who holds staff.administer.
 *
 * It offers only the roles the viewer may hand out and is drawn only for a
 * member within their role and reach (SP-S1-35). It shows the role the roster
 * says the member holds and proposes a change; whether that change is allowed
 * is still the policies' answer, given after the actor confirms.
 */
function RolePicker({
  member,
  onPropose,
  roles,
}: {
  member: StaffMember;
  onPropose: (member: StaffMember, next: string) => void;
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const held = heldRoleValue(member);

  const roleOptions = useRoleOptions(
    roles.map((role) => {
      const shipped = shippedRoleOf(role);
      return {
        key: role.key,
        organizationId: role.organizationId,
        name: shipped ? t(`staff.roles.${shipped}`) : role.name,
      };
    }),
  );
  // A revoked membership can still hold a role since retired, which the
  // active roles no longer offer; it is shown by its name, not by its key.
  const pickerOptions = roleOptions.some((option) => option.value === held)
    ? roleOptions
    : [...roleOptions, { value: held, label: member.roleName, disabled: true }];
  const roleLabels = usePickerLabels(t("staff.role"));

  return (
    <Combobox
      aria-label={`${t("staff.role")}: ${member.email}`}
      className="min-w-40"
      disabled={member.status === "revoked"}
      id={`staff-role-${member.membershipId}`}
      labels={roleLabels}
      onValueChange={(next) => onPropose(member, next)}
      options={pickerOptions}
      value={held}
    />
  );
}

/** Revoke, or take it back. Behind one button, as a row's actions always are. */
function MembershipActions({
  locale,
  member,
  organizationId,
}: {
  locale: string;
  member: StaffMember;
  organizationId: string;
}) {
  const t = useTranslations();
  const [, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<StaffOutcome>("idle");

  const revoking = member.status === "active";

  function run(): void {
    setOutcome("idle");
    startTransition(async () => {
      const form = new FormData();
      form.set("locale", locale);
      form.set("organization", organizationId);
      form.set("member", member.userId);
      const result = await (revoking ? revokeStaffMember : undoStaffRevoke)(
        "idle",
        form,
      );
      if (result !== "done") setOutcome(result);
    });
  }

  return (
    <span className="flex items-center justify-end gap-2">
      {outcome === "lastAdministrator" ? (
        <span className="text-xs text-destructive">
          {t("staff.lastAdministrator")}
        </span>
      ) : outcome !== "idle" ? (
        <span className="text-xs text-destructive">{t("staff.refused")}</span>
      ) : null}
      <DataTableRowActions
        actions={[
          revoking
            ? {
                label: t("staff.revoke"),
                icon: UserMinus,
                onSelect: run,
                destructive: true,
              }
            : { label: t("staff.undoRevoke"), icon: RotateCcw, onSelect: run },
        ]}
        label={`${t("staff.actions")}: ${member.email}`}
      />
    </span>
  );
}
