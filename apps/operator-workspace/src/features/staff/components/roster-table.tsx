"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  CircleSlash,
  Clock,
  Link2,
  MapPin,
  Pencil,
  RotateCcw,
  Search,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react";
import type { Role, StaffMember } from "@ranza/staff";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Button,
  Combobox,
  DataTableRowActions,
  Input,
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
import { shippedRoleOf, UNDO_WINDOW_HOURS } from "../labels";
import { leavesNoAdministrator } from "../acts-on";
import type { StaffEmployment } from "../employment";
import { usePickerLabels } from "../../../lib/picker-labels";
import {
  ChangePropertiesDialog,
  type PropertyChoice,
} from "./change-properties-dialog";
import {
  ConfirmRoleChange,
  type RoleChangeProposal,
} from "./confirm-role-change";
import {
  ConfirmMembership,
  type MembershipProposal,
} from "./confirm-membership";
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
  employment,
  locale,
  mayAdminister,
  membersAboveViewer,
  onRoleFilterChange,
  organizationId,
  propertyChoices,
  roleFilter,
  roles,
  roster,
  viewerUserId,
}: {
  /** HR's name and employment for a login, when the viewer may read HR. */
  employment: Readonly<Record<string, StaffEmployment>>;
  locale: SupportedLocale;
  mayAdminister: boolean;
  /** Membership ids the policies would refuse the viewer acting on. */
  membersAboveViewer: readonly string[];
  onRoleFilterChange: (value: string) => void;
  organizationId: string;
  /** The Properties of this Organization the viewer reaches (SP-S1-36). */
  propertyChoices: readonly PropertyChoice[];
  /** A role's picker value, or "all". Lives above so another tab can set it. */
  roleFilter: string;
  /** Only the roles the viewer may hand out (SP-S1-34). */
  roles: readonly Role[];
  roster: readonly StaffMember[];
  viewerUserId: string;
}) {
  const t = useTranslations();
  const above = new Set(membersAboveViewer);
  const [proposal, setProposal] = useState<RoleChangeProposal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [membership, setMembership] = useState<MembershipProposal | null>(null);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [reach, setReach] = useState<StaffMember | null>(null);
  const [reachOpen, setReachOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState(ALL);
  const [showAllRevoked, setShowAllRevoked] = useState(false);
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
      gained: gainedBy(member.rolePermissions, target.permissions),
      lost: gainedBy(target.permissions, member.rolePermissions),
    });
    setAttempt((count) => count + 1);
    setConfirming(true);
  }

  function proposeMembership(
    kind: MembershipProposal["kind"],
    member: StaffMember,
  ): void {
    setMembership({
      kind,
      member,
      self: member.userId === viewerUserId,
      lastAdministrator:
        kind === "revoke" && leavesNoAdministrator(roster, member.userId, []),
    });
    setAttempt((count) => count + 1);
    setMembershipOpen(true);
  }

  function proposeReach(member: StaffMember): void {
    setReach(member);
    setAttempt((count) => count + 1);
    setReachOpen(true);
  }

  // A revoke stays on the list while it can still be undone, and for as long as
  // somebody asks to see it afterwards: a roster that dropped it at once would
  // make the undo invisible, and one that keeps every leaver forever buries the
  // people who work here (PEOPLE-09).
  const lingering = (member: StaffMember): boolean =>
    member.status === "revoked" &&
    (member.revokedAt === null || undoable(member) !== null);
  const hiddenRevoked = roster.filter(
    (member) => member.status === "revoked" && !lingering(member),
  ).length;
  const needle = query.trim().toLowerCase();
  const nameOf = (member: StaffMember): string | null =>
    employment[member.userId]?.name ?? null;
  const roleChoices = distinctRoles(roster, t);
  const propertyOptions = distinctProperties(roster, propertyChoices);
  const reachesNothingSomewhere = roster.some(reachesNothing);
  const visible = roster.filter((member) => {
    if (roleFilter !== ALL && heldRoleValue(member) !== roleFilter) {
      return false;
    }
    if (propertyFilter === NO_PROPERTY && !reachesNothing(member)) {
      return false;
    }
    if (
      propertyFilter !== ALL &&
      propertyFilter !== NO_PROPERTY &&
      member.accessScope !== "organization_wide" &&
      !member.properties.some(
        (property) => property.propertyId === propertyFilter,
      )
    ) {
      return false;
    }
    if (
      member.status === "revoked" &&
      !showAllRevoked &&
      !lingering(member) &&
      needle === ""
    ) {
      return false;
    }
    return (
      needle === "" ||
      [
        member.email,
        nameOf(member) ?? "",
        roleNameOf(member, t),
        ...member.properties.map((property) => property.propertyName),
      ].some((text) => text.toLowerCase().includes(needle))
    );
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("staff.search")}
            className="ps-9"
            data-testid="staff-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("staff.search")}
            type="search"
            value={query}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RosterFilter
            allLabel={t("staff.allRoles")}
            label={t("staff.filterByRole")}
            onChange={onRoleFilterChange}
            options={roleChoices}
            testId="staff-role-filter"
            value={roleFilter}
          />
          <RosterFilter
            allLabel={t("staff.allProperties")}
            label={t("staff.filterByProperty")}
            onChange={setPropertyFilter}
            options={[
              ...propertyOptions,
              ...(reachesNothingSomewhere
                ? [{ value: NO_PROPERTY, label: t("staff.reachesNothing") }]
                : []),
            ]}
            testId="staff-property-filter"
            value={propertyFilter}
          />
        </div>
        {hiddenRevoked > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={showAllRevoked}
              data-testid="show-revoked"
              onChange={(event) => setShowAllRevoked(event.target.checked)}
              type="checkbox"
            />
            {t("staff.showRevoked", { count: hiddenRevoked })}
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p
            className="text-sm text-muted-foreground"
            data-testid="staff-no-match"
          >
            {t("staff.noMatch", { query: query.trim() })}
          </p>
          <Button
            onClick={() => {
              setQuery("");
              onRoleFilterChange(ALL);
              setPropertyFilter(ALL);
              setShowAllRevoked(true);
            }}
            type="button"
            variant="outline"
          >
            {t("staff.showAll")}
          </Button>
        </div>
      ) : (
        <Table aria-label={t("staff.peopleTab")} className="max-md:block">
          <TableHeader className="max-md:sr-only">
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
          <TableBody className="max-md:block">
            {visible.map((member) => {
              const actsOn = mayAdminister && !above.has(member.membershipId);
              const until = undoable(member);
              return (
                <TableRow
                  className="max-md:grid max-md:grid-cols-[1fr_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:p-4"
                  data-testid="staff-row"
                  key={member.membershipId}
                >
                  <TableCell className="max-md:col-span-2 max-md:p-0">
                    <span className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {initials(nameOf(member) ?? member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {nameOf(member) ?? member.email}
                        </span>
                        {nameOf(member) ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        ) : null}
                        {/* Awaiting a password only when a link is actually
                          outstanding. Whoever created the Organization arrived
                          through sign-up and has no invitation at all, so
                          reading `acceptedAt` here told them they were waiting
                          on a password they had already set. */}
                        {member.status === "active" &&
                        member.invitation === "pending" ? (
                          <span className="text-xs text-muted-foreground">
                            {t("staff.invitationSent")}
                          </span>
                        ) : null}
                        {member.status === "revoked" ? (
                          <span className="text-xs text-muted-foreground">
                            {until
                              ? t("staff.undoUntil", {
                                  until: formatDate(until, locale, {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  }),
                                })
                              : t("staff.undoOver", {
                                  hours: UNDO_WINDOW_HOURS,
                                })}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="max-md:p-0">
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
                  <TableCell className="text-muted-foreground max-md:col-span-2 max-md:p-0 max-md:whitespace-normal">
                    {member.accessScope === "organization_wide" ? (
                      t("staff.reachesEverywhere")
                    ) : actsOn && member.status === "active" ? (
                      <PropertiesButton
                        member={member}
                        onPropose={proposeReach}
                      />
                    ) : member.properties.length === 0 ? (
                      t("staff.reachesNothing")
                    ) : (
                      member.properties
                        .map((property) => property.propertyName)
                        .join(", ")
                    )}
                  </TableCell>
                  <TableCell className="max-md:p-0">
                    <span className="flex flex-col items-start gap-1.5">
                      <StatusBadge {...statusOf(member, t)} />
                      {member.status === "active" &&
                      employment[member.userId]?.terminatedOn ? (
                        <StatusBadge
                          icon={UserX}
                          label={t("staff.leftHr", {
                            date: formatDate(
                              new Date(
                                `${employment[member.userId]?.terminatedOn}T00:00:00Z`,
                              ),
                              locale,
                              {
                                day: "numeric",
                                month: "short",
                                timeZone: "UTC",
                              },
                            ),
                          })}
                          tone="warning"
                        />
                      ) : null}
                    </span>
                  </TableCell>
                  {mayAdminister ? (
                    <TableCell className="text-end max-md:p-0">
                      {actsOn ? (
                        <MembershipActions
                          member={member}
                          onPropose={proposeMembership}
                          onProposeReach={proposeReach}
                          undoable={until !== null}
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
      )}
      {proposal ? (
        <ConfirmRoleChange
          current={roster.find((member) => member.userId === proposal.userId)}
          key={`role-${attempt}`}
          locale={locale}
          onClose={() => setConfirming(false)}
          open={confirming}
          organizationId={organizationId}
          proposal={proposal}
        />
      ) : null}
      {reach ? (
        <ChangePropertiesDialog
          key={`reach-${attempt}`}
          locale={locale}
          member={
            roster.find((candidate) => candidate.userId === reach.userId) ??
            reach
          }
          onClose={() => setReachOpen(false)}
          open={reachOpen}
          organizationId={organizationId}
          reachable={propertyChoices}
          self={reach.userId === viewerUserId}
        />
      ) : null}
      {membership ? (
        <ConfirmMembership
          key={`membership-${attempt}`}
          locale={locale}
          onClose={() => setMembershipOpen(false)}
          open={membershipOpen}
          organizationId={organizationId}
          proposal={membership}
        />
      ) : null}
    </div>
  );
}

/**
 * Until when a revoke can be undone, or null once it cannot (or was never
 * revoked). Read from the roster's own `revokedAt` and the window the module
 * states, so the screen offers an undo only while the server would accept it.
 */
function undoable(member: StaffMember): Date | null {
  if (member.status !== "revoked" || !member.revokedAt) return null;
  const until = new Date(
    Date.parse(member.revokedAt) + UNDO_WINDOW_HOURS * 3_600_000,
  );
  return until.getTime() > Date.now() ? until : null;
}

/** The permissions `next` holds that `from` does not, for the confirmation. */
function gainedBy(
  from: readonly string[],
  next: readonly string[],
): readonly string[] {
  return next.filter((permission) => !from.includes(permission));
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
    key:
      | "staff.active"
      | "staff.awaitingPassword"
      | "staff.linkNoLonger"
      | "staff.revoked",
  ) => string,
): StatusBadgeProps {
  if (member.status === "revoked") {
    return { icon: CircleSlash, label: t("staff.revoked"), tone: "neutral" };
  }
  if (member.invitation === "pending") {
    return { icon: Clock, label: t("staff.awaitingPassword"), tone: "warning" };
  }
  if (member.invitation === "expired" || member.invitation === "withdrawn") {
    return { icon: Clock, label: t("staff.linkNoLonger"), tone: "warning" };
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
  const parts = local.split(/[\s._-]+/).filter(Boolean);
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

/**
 * What can be done to a membership, behind one button as a row's actions
 * always are. Every one of them asks first (PEOPLE-02): the menu only proposes.
 */
function MembershipActions({
  member,
  onPropose,
  onProposeReach,
  undoable,
}: {
  member: StaffMember;
  onPropose: (kind: MembershipProposal["kind"], member: StaffMember) => void;
  onProposeReach: (member: StaffMember) => void;
  undoable: boolean;
}) {
  const t = useTranslations();

  const actions =
    member.status === "active"
      ? [
          ...(member.invitation !== null && member.invitation !== "accepted"
            ? [
                {
                  label: t("staff.renewLink"),
                  icon: Link2,
                  onSelect: () => onPropose("renew", member),
                },
              ]
            : []),
          ...(member.accessScope === "assigned_properties"
            ? [
                {
                  label: t("staff.changeProperties"),
                  icon: MapPin,
                  onSelect: () => onProposeReach(member),
                },
              ]
            : []),
          {
            label: t("staff.revoke"),
            icon: UserMinus,
            onSelect: () => onPropose("revoke", member),
            destructive: true,
          },
        ]
      : undoable
        ? [
            {
              label: t("staff.undoRevoke"),
              icon: RotateCcw,
              onSelect: () => onPropose("restore", member),
            },
          ]
        : [
            {
              label: t("staff.addBack"),
              icon: UserPlus,
              onSelect: () => onPropose("readd", member),
            },
          ];

  return (
    <DataTableRowActions
      actions={actions}
      label={`${t("staff.actions")}: ${member.email}`}
    />
  );
}

export const ALL = "all";
const NO_PROPERTY = "none";

/** Active, bound to Properties, and bound to none: signed in to nothing. */
function reachesNothing(member: StaffMember): boolean {
  return (
    member.status === "active" &&
    member.accessScope === "assigned_properties" &&
    member.properties.length === 0
  );
}

/** The roles somebody on the roster holds, once each, as the filter lists them. */
function distinctRoles(
  roster: readonly StaffMember[],
  t: ReturnType<typeof useTranslations>,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const member of roster) {
    const value = heldRoleValue(member);
    if (!seen.has(value)) seen.set(value, roleNameOf(member, t));
  }
  return [...seen].map(([value, label]) => ({ value, label }));
}

/** The Properties the viewer reaches and the ones anybody on the roster holds. */
function distinctProperties(
  roster: readonly StaffMember[],
  choices: readonly PropertyChoice[],
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const choice of choices)
    seen.set(choice.propertyId, choice.propertyName);
  for (const member of roster) {
    for (const property of member.properties) {
      seen.set(property.propertyId, property.propertyName);
    }
  }
  return [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A short fixed list a roster can be narrowed by, with "all" as its first row. */
function RosterFilter({
  allLabel,
  label,
  onChange,
  options,
  testId,
  value,
}: {
  allLabel: string;
  label: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
  testId: string;
  value: string;
}) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className="w-44" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Where somebody works, as the control that changes it (PEOPLE-01).
 *
 * The cell is the thing to press: the names are the label and the pencil says
 * so before a hand gets near it. A person who reaches nothing gets the call to
 * action in the warning colour, because that is the state the invitation
 * promised "until you assign one" for.
 */
function PropertiesButton({
  member,
  onPropose,
}: {
  member: StaffMember;
  onPropose: (member: StaffMember) => void;
}) {
  const t = useTranslations();
  const none = member.properties.length === 0;
  return (
    <Button
      className={
        none
          ? "h-auto max-w-full justify-start gap-1.5 whitespace-normal px-2 py-1 text-start text-warning"
          : "h-auto max-w-full justify-start gap-1.5 whitespace-normal px-2 py-1 text-start font-normal text-muted-foreground"
      }
      data-testid="staff-properties"
      id={`staff-properties-${member.membershipId}`}
      onClick={() => onPropose(member)}
      type="button"
      variant="ghost"
    >
      <span>
        {none
          ? t("staff.assignProperty")
          : member.properties
              .map((property) => property.propertyName)
              .join(", ")}
      </span>
      <span className="sr-only">
        {t("staff.changeProperties")}: {member.email}
      </span>
      <Pencil aria-hidden="true" className="size-3.5 shrink-0" />
    </Button>
  );
}
