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
} from "@ranza/ui";
import { defineRole, type StaffOutcome } from "../../../server/staff";
import { PERMISSION_CATALOGUE, permissionMessageKey } from "../labels";

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
}: {
  locale: string;
  organizationId: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
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

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden="true" className="size-4" />
          {t("staff.defineRole")}
        </Button>
      </DialogTrigger>
      <DialogContent>
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("staff.mayDo")}</legend>
            {PERMISSION_CATALOGUE.map((permission) => (
              <label
                className="flex items-center gap-2 text-sm"
                key={permission}
              >
                <input name="permissions" type="checkbox" value={permission} />
                {t(`staff.permissions.${permissionMessageKey(permission)}`)}
              </label>
            ))}
          </fieldset>

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
