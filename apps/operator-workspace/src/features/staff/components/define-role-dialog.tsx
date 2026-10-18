"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FormError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import type { Role } from "@ranza/staff";
import { defineRole, type StaffOutcome } from "../../../server/staff";
import {
  PERMISSION_SECTIONS,
  permissionMessageKey,
  shippedRoleOf,
} from "../labels";

/**
 * Composing a role.
 *
 * The list of permissions offered is every one the catalogue has, not the ones
 * this author may grant. What they may grant is the policy's answer, and
 * filtering here would be a second copy of it that goes stale between the page
 * rendering and the form being submitted — which is the window the rule exists
 * to have none of.
 */
export function DefineRoleDialog({
  locale,
  organizationId,
  roles,
}: {
  locale: string;
  organizationId: string;
  /** What a new role can start from: every role there is, active or not. */
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [outcome, act, pending] = useActionState<StaffOutcome, FormData>(
    defineRole,
    "idle",
  );

  // Closes on success, unlike the invitation dialog: the role appears on the
  // grid behind it, which is the answer. An invitation has a token that only
  // exists in that one moment and closing would throw it away.
  useEffect(() => {
    if (outcome === "done") setOpen(false);
  }, [outcome]);

  function roleName(role: Role): string {
    const shipped = shippedRoleOf(role);
    return shipped ? t(`staff.roles.${shipped}`) : role.name;
  }

  function startFrom(value: string): void {
    const source = roles.find(
      (role) => `${role.organizationId ?? ""}:${role.key}` === value,
    );
    if (source) setTicked(source.permissions);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden="true" className="size-4" />
          {t("staff.defineRole")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("staff.defineRoleTitle")}</DialogTitle>
          <DialogDescription>
            {t("staff.defineRoleDescription")}
          </DialogDescription>
        </DialogHeader>
        <form action={act} className="space-y-4">
          <input name="locale" type="hidden" value={locale} />
          <input name="organization" type="hidden" value={organizationId} />

          <Field htmlFor="role-name" label={t("staff.roleName")}>
            <Input required id="role-name" maxLength={80} name="name" />
          </Field>

          <Field htmlFor="role-start-from" label={t("staff.startFrom")}>
            <Select onValueChange={startFrom}>
              <SelectTrigger id="role-start-from">
                <SelectValue placeholder={t("staff.startFromPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem
                    key={`${role.organizationId ?? ""}:${role.key}`}
                    value={`${role.organizationId ?? ""}:${role.key}`}
                  >
                    {roleName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-4">
            <p className="text-sm font-medium">{t("staff.mayDo")}</p>
            {PERMISSION_SECTIONS.map((section) => (
              <fieldset className="space-y-2" key={section.key}>
                <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`staff.sections.${section.key}`)}
                </legend>
                {section.permissions.map((permission) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    key={permission}
                  >
                    <input
                      checked={ticked.includes(permission)}
                      name="permissions"
                      onChange={(event) =>
                        setTicked(
                          event.target.checked
                            ? [...ticked, permission]
                            : ticked.filter((key) => key !== permission),
                        )
                      }
                      type="checkbox"
                      value={permission}
                    />
                    {t(`staff.permissions.${permissionMessageKey(permission)}`)}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>

          {outcome === "refused" ? (
            <FormError>{t("staff.refused")}</FormError>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("staff.cancel")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {t("staff.saveRole")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
