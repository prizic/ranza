"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, Check, Minus, RotateCcw } from "lucide-react";
import type { Role } from "@ranza/staff";
import {
  Button,
  Checkbox,
  DataTableRowActions,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@ranza/ui";
import { editRole, reinstateRole, retireRole } from "../../../server/staff";
import {
  asPermission,
  PERMISSION_SECTIONS,
  shippedRoleOf,
  type PermissionSectionKey,
} from "../labels";

/** A role is identified by its scope as well as its key (an authored `front_desk` exists). */
const roleId = (role: Pick<Role, "key" | "organizationId">): string =>
  `${role.organizationId ?? ""}:${role.key}`;

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

type Pending = { kind: "save" } | { kind: "retire"; role: Role } | null;

/**
 * What each role may do — permissions down, roles across.
 *
 * A grid rather than a list of roles with their sets written out, because the
 * question somebody opens this tab with is "who can do this?" and a list
 * answers the other one. It is also the only view in which a gap is visible: an
 * empty column says a role can do nothing, and no amount of prose does.
 *
 * Ticks are a draft until saved. Every edit to a role ends the sessions of
 * everyone holding it, so a tick that saved on touch made a mis-click cost
 * other people their sign-in; the bar below the grid says how many people the
 * save reaches and asks first (PEOPLE-05).
 *
 * Somebody without staff.define_roles reads the grid and edits nothing (#80).
 * For an author, nothing here decides whether a box may be ticked: they may
 * only grant what their own role holds, and that is the insert and update
 * policies' answer (SP-S3-01) — a check here would be a second, weaker copy of
 * the rule that guards privilege escalation. A refused role comes back by name.
 */
export function PermissionMatrix({
  locale,
  mayDefineRoles,
  organizationId,
  roles,
}: {
  locale: string;
  /** Without staff.define_roles the grid is read, not edited (#80). */
  mayDefineRoles: boolean;
  organizationId: string;
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [section, setSection] = useState<"all" | PermissionSectionKey>("all");
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Shipped first, then this Organization's own. The order is the grid's one
  // piece of structure: a rule falls between the two groups, which says "fixed
  // reference" on the left of it and "yours" on the right without a legend.
  const shipped = roles.filter((role) => role.organizationId === null);
  const authored = roles.filter((role) => role.organizationId !== null);
  const ordered = [...shipped, ...authored];

  const [baseline, setBaseline] = useState<Record<string, readonly string[]>>(
    () =>
      Object.fromEntries(roles.map((role) => [roleId(role), role.permissions])),
  );
  const [draft, setDraft] = useState(baseline);

  const dirty = authored.filter(
    (role) => !sameSet(draft[roleId(role)] ?? [], baseline[roleId(role)] ?? []),
  );
  const affectedPeople = dirty.reduce((sum, role) => sum + role.heldBy, 0);

  function roleName(role: Role): string {
    const known = shippedRoleOf(role);
    return known ? t(`staff.roles.${known}`) : role.name;
  }

  function commandName(permission: string): string {
    const known = asPermission(permission);
    return known ? t(`staff.permissions.${known}`) : permission;
  }

  function toggle(role: Role, permission: string): void {
    const id = roleId(role);
    const current = draft[id] ?? [];
    setFailure(null);
    setDraft({
      ...draft,
      [id]: current.includes(permission)
        ? current.filter((key) => key !== permission)
        : [...current, permission],
    });
  }

  function discard(): void {
    setDraft(baseline);
    setFailure(null);
  }

  async function submit(
    role: Role,
    permissions: readonly string[],
  ): Promise<boolean> {
    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("role", role.key);
    for (const key of permissions) form.append("permissions", key);
    return (await editRole("idle", form)) === "done";
  }

  async function save(): Promise<void> {
    setWorking(true);
    setFailure(null);
    const saved: Record<string, readonly string[]> = {};
    const refused: string[] = [];
    for (const role of dirty) {
      const permissions = draft[roleId(role)] ?? [];
      if (await submit(role, permissions)) {
        saved[roleId(role)] = permissions;
      } else {
        refused.push(roleName(role));
      }
    }
    setBaseline((current) => ({ ...current, ...saved }));
    setWorking(false);
    if (refused.length === 0) {
      setPending(null);
      return;
    }
    setFailure(t("staff.cannotGrant", { roles: refused.join(", ") }));
    setPending(null);
  }

  async function retire(role: Role): Promise<void> {
    setWorking(true);
    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("role", role.key);
    const outcome = await retireRole("idle", form);
    setWorking(false);
    setPending(null);
    if (outcome !== "done") setFailure(t("staff.roleIsHeld"));
  }

  async function reinstate(role: Role): Promise<void> {
    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("role", role.key);
    if ((await reinstateRole("idle", form)) !== "done") {
      setFailure(t("staff.refused"));
    }
  }

  const visible = PERMISSION_SECTIONS.filter(
    (candidate) => section === "all" || candidate.key === section,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <p className="text-sm text-muted-foreground">{t("staff.matrixNote")}</p>
        <Select
          onValueChange={(next) => setSection(next as typeof section)}
          value={section}
        >
          <SelectTrigger
            aria-label={t("staff.showSection")}
            className="w-52"
            data-testid="permission-section-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("staff.allSections")}</SelectItem>
            {PERMISSION_SECTIONS.map((candidate) => (
              <SelectItem key={candidate.key} value={candidate.key}>
                {t(`staff.sections.${candidate.key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table aria-label={t("staff.rolesTab")}>
          <TableHeader>
            {/* Two header rows: the group, then the roles in it. The rule
                below falls where the groups meet rather than being a second
                device saying the same thing. */}
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
                    index === shipped.length && shipped.length > 0
                      ? "border-s border-border"
                      : null,
                  )}
                  key={roleId(role)}
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
                                    onSelect: () =>
                                      setPending({ kind: "retire", role }),
                                    destructive: true,
                                  }
                                : {
                                    label: t("staff.reinstate"),
                                    icon: RotateCcw,
                                    onSelect: () => void reinstate(role),
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
            {visible.map((group) => (
              <Fragment key={group.key}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell
                    className="sticky start-0 z-10 bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    colSpan={ordered.length + 1}
                  >
                    {t(`staff.sections.${group.key}`)}
                  </TableCell>
                </TableRow>
                {group.permissions.map((permission) => (
                  <TableRow data-testid="permission-row" key={permission}>
                    <TableCell className="sticky start-0 z-10 bg-card">
                      {commandName(permission)}
                      {permission === "finance.manage_folio" ? (
                        <span className="block text-xs text-muted-foreground">
                          {t("staff.revenueGateNote")}
                        </span>
                      ) : null}
                    </TableCell>
                    {ordered.map((role, index) => {
                      // A role Ranza ships arrives in a release and is the fixed
                      // reference every Organization shares (SP-S3-05). It is
                      // drawn as a mark, not a disabled box: a disabled box is
                      // pale grey on white and the grid reads as empty. Every
                      // box is fixed for a viewer who may not define roles.
                      const fixed =
                        role.organizationId === null || !mayDefineRoles;
                      const set = draft[roleId(role)] ?? role.permissions;
                      const allowed = set.includes(permission);
                      return (
                        <TableCell
                          className={cn(
                            "text-center",
                            index === shipped.length && shipped.length > 0
                              ? "border-s border-border"
                              : null,
                          )}
                          key={roleId(role)}
                        >
                          {fixed ? (
                            allowed ? (
                              <Check
                                aria-label={`${roleName(role)}: ${commandName(permission)}: ${t("staff.allowed")}`}
                                className="mx-auto size-4 text-foreground"
                                role="img"
                              />
                            ) : (
                              <Minus
                                aria-label={`${roleName(role)}: ${commandName(permission)}: ${t("staff.notAllowed")}`}
                                className="mx-auto size-4 text-muted-foreground/40"
                                role="img"
                              />
                            )
                          ) : (
                            <Checkbox
                              aria-label={`${roleName(role)}: ${commandName(permission)}`}
                              checked={allowed}
                              className="mx-auto"
                              disabled={working}
                              onCheckedChange={() => toggle(role, permission)}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {failure ? (
        <p
          className="border-t border-border p-4 text-sm text-destructive"
          role="alert"
        >
          {failure}
        </p>
      ) : null}

      {dirty.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 p-4"
          data-testid="unsaved-roles"
        >
          <p className="text-sm">
            {t("staff.unsavedRoles", {
              count: dirty.length,
              people: affectedPeople,
            })}
          </p>
          <span className="flex gap-2">
            <Button
              disabled={working}
              onClick={discard}
              type="button"
              variant="outline"
            >
              {t("staff.discardChanges")}
            </Button>
            <Button
              disabled={working}
              onClick={() => setPending({ kind: "save" })}
              type="button"
            >
              {t("staff.saveChanges")}
            </Button>
          </span>
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open && !working) setPending(null);
        }}
        open={pending !== null}
      >
        <DialogContent showCloseButton={false}>
          {pending?.kind === "save" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("staff.confirmSaveTitle")}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-col gap-2">
                    <p>
                      {t("staff.confirmSaveRoles", {
                        roles: dirty.map(roleName).join(", "),
                      })}
                    </p>
                    <p>
                      {affectedPeople === 0
                        ? t("staff.confirmSaveNobody")
                        : t("staff.confirmSavePeople", {
                            people: affectedPeople,
                          })}
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  disabled={working}
                  onClick={() => setPending(null)}
                  type="button"
                  variant="outline"
                >
                  {t("staff.cancel")}
                </Button>
                <Button
                  disabled={working}
                  onClick={() => void save()}
                  type="button"
                >
                  {t("staff.saveChanges")}
                </Button>
              </DialogFooter>
            </>
          ) : pending?.kind === "retire" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("staff.confirmRetireTitle", {
                    role: roleName(pending.role),
                  })}
                </DialogTitle>
                <DialogDescription>
                  {pending.role.heldBy > 0
                    ? t("staff.retireHeld", {
                        role: roleName(pending.role),
                        count: pending.role.heldBy,
                      })
                    : t("staff.retireBody", { role: roleName(pending.role) })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  disabled={working}
                  onClick={() => setPending(null)}
                  type="button"
                  variant="outline"
                >
                  {pending.role.heldBy > 0
                    ? t("staff.confirmRoleClose")
                    : t("staff.cancel")}
                </Button>
                {pending.role.heldBy > 0 ? null : (
                  <Button
                    disabled={working}
                    onClick={() => void retire(pending.role)}
                    type="button"
                    variant="destructive"
                  >
                    {t("staff.retire")}
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
