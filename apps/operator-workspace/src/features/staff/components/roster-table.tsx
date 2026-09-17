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
  DataTableRowActions,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  changeStaffRole,
  revokeStaffMember,
  undoStaffRevoke,
  type StaffOutcome,
} from "../../../server/staff";
import { asShippedRole } from "../labels";

/** Every role Ranza ships lives in this scope, which is not an Organization. */
const NIL_SCOPE = "00000000-0000-0000-0000-000000000000";

/**
 * Who works here, and where.
 *
 * The role is a control rather than a word, which is the mockup's shape and is
 * also the honest one: changing somebody's role is the commonest thing done on
 * this screen, and a select in the row is one gesture where a dialog is four.
 *
 * Revoked memberships stay on the list. A roster that dropped them would make
 * the undo window invisible — somebody revoked by mistake would have nothing to
 * press — and would leave the history of who used to work here unreadable.
 *
 * Reaching no Property is shown as a state rather than an empty cell, because
 * it is a normal one: a person can be on the roster before anybody has decided
 * where they work (SP-S1-06).
 */
export function RosterTable({
  locale,
  organizationId,
  roles,
  roster,
}: {
  locale: string;
  organizationId: string;
  roles: readonly Role[];
  roster: readonly StaffMember[];
}) {
  const t = useTranslations();

  return (
    <div className="overflow-x-auto">
      <Table aria-label={t("staff.peopleTab")}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("staff.person")}</TableHead>
            <TableHead scope="col">{t("staff.role")}</TableHead>
            <TableHead scope="col">{t("staff.properties")}</TableHead>
            <TableHead scope="col">{t("staff.status")}</TableHead>
            <TableHead className="text-end" scope="col">
              <span className="sr-only">{t("staff.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((member) => (
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
                <RolePicker
                  locale={locale}
                  member={member}
                  organizationId={organizationId}
                  roles={roles}
                />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.properties.length === 0
                  ? t("staff.reachesNothing")
                  : member.properties.map((p) => p.propertyName).join(", ")}
              </TableCell>
              <TableCell>
                <StatusBadge {...statusOf(member, t)} />
              </TableCell>
              <TableCell className="text-end">
                <MembershipActions
                  locale={locale}
                  member={member}
                  organizationId={organizationId}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
 * The role, as a control.
 *
 * Offered for everybody, including somebody without the authority to change it.
 * Whether this viewer may is the policies' answer, and hiding the control on
 * their behalf would be a second, weaker copy of it — a refusal that says so is
 * more honest than a select that is quietly absent.
 */
function RolePicker({
  locale,
  member,
  organizationId,
  roles,
}: {
  locale: string;
  member: StaffMember;
  organizationId: string;
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<StaffOutcome>("idle");
  // `<scope>:<key>`, the pair the database keys on. The key alone is ambiguous:
  // an Organization may author a role whose slug matches a shipped one, and the
  // select would then resolve to whichever came first.
  const optionFor = (role: Role) => `${role.organizationId ?? ""}:${role.key}`;
  const [held, setHeld] = useState(
    // The nil uuid is a scope, not an Organization, so it maps to the empty
    // half of the pair the way a shipped role does everywhere else.
    () =>
      `${member.roleScopeId === NIL_SCOPE ? "" : member.roleScopeId}:${member.roleId}`,
  );

  function label(role: Role): string {
    const shipped = asShippedRole(role.key);
    return shipped ? t(`staff.roles.${shipped}`) : role.name;
  }

  function change(next: string): void {
    const previous = held;
    setHeld(next);
    setOutcome("idle");

    startTransition(async () => {
      const form = new FormData();
      form.set("locale", locale);
      form.set("organization", organizationId);
      form.set("member", member.userId);
      form.set("role", next);

      const result = await changeStaffRole("idle", form);
      if (result !== "done") {
        setHeld(previous);
        setOutcome(result);
      }
    });
  }

  return (
    <span className="flex flex-col gap-1">
      <Select
        disabled={pending || member.status === "revoked"}
        onValueChange={change}
        value={held}
      >
        <SelectTrigger
          aria-label={`${t("staff.role")}: ${member.email}`}
          className="h-9 w-full min-w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={optionFor(role)} value={optionFor(role)}>
              {label(role)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {outcome === "lastAdministrator" ? (
        <span className="text-xs text-destructive">
          {t("staff.lastAdministrator")}
        </span>
      ) : outcome !== "idle" ? (
        <span className="text-xs text-destructive">{t("staff.refused")}</span>
      ) : null}
    </span>
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
