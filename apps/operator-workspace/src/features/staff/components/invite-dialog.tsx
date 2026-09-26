"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, UserPlus } from "lucide-react";
import {
  Button,
  Combobox,
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
  MultiCombobox,
} from "@ranza/ui";
import { inviteStaffMember, type InviteOutcome } from "../../../server/staff";
import { usePickerLabels } from "../../../lib/picker-labels";
import {
  roleOptionValue,
  useRoleOptions,
  type RoleOption,
} from "./role-options";

/**
 * Inviting somebody.
 *
 * The dialog stays open after a successful invitation, which is unusual and
 * deliberate: there is no Notifications module (blueprint 5.12), so the link is
 * shown here for the person who created it to pass on by hand, and closing on
 * success would throw away the only readable copy that will ever exist. Only
 * the token's digest is stored.
 *
 * Presentational. Nothing here asks whether the viewer may invite — the write
 * policies answer, and a check here would go stale between this page rendering
 * and somebody pressing the button.
 */
export function InviteDialog({
  locale,
  organizationId,
  properties,
  roles,
}: {
  locale: string;
  organizationId: string;
  properties: readonly { propertyId: string; propertyName: string }[];
  roles: readonly RoleOption[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [outcome, act, pending] = useActionState<InviteOutcome, FormData>(
    inviteStaffMember,
    { state: "idle" },
  );

  const defaultRole = roles[0] ? roleOptionValue(roles[0]) : ":front_desk";
  const roleOptions = useRoleOptions(roles);
  const roleLabels = usePickerLabels(t("staff.role"));
  const propertyLabels = usePickerLabels(t("staff.reachesNothing"));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" className="size-4" />
          {t("staff.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staff.inviteTitle")}</DialogTitle>
          <DialogDescription>{t("staff.inviteDescription")}</DialogDescription>
        </DialogHeader>

        {outcome.state === "done" && outcome.token ? (
          <div className="space-y-2">
            <p className="text-sm">{t("staff.linkToPassOn")}</p>
            <Input
              readOnly
              aria-label={t("staff.linkToPassOn")}
              data-testid="invitation-token"
              value={outcome.token}
            />
            <p className="text-sm text-muted-foreground">
              {t("staff.linkExpires")}
            </p>
          </div>
        ) : (
          <form action={act} className="space-y-4">
            <input name="locale" type="hidden" value={locale} />
            <input name="organization" type="hidden" value={organizationId} />

            <Field htmlFor="invite-email" label={t("staff.email")}>
              <Input
                required
                autoComplete="off"
                id="invite-email"
                maxLength={254}
                name="email"
                type="email"
              />
            </Field>

            <Field htmlFor="invite-role" label={t("staff.role")}>
              <Combobox
                defaultValue={defaultRole}
                id="invite-role"
                labels={roleLabels}
                name="role"
                options={roleOptions}
              />
            </Field>

            {/* Searchable, because an Organization's Properties are data and
                a chain outgrows a row of pills. An empty set is allowed and
                normal — somebody can be on the roster before anybody decides
                where they work (SP-S1-06) — which the placeholder says. */}
            <Field htmlFor="invite-properties" label={t("staff.properties")}>
              <MultiCombobox
                id="invite-properties"
                labels={propertyLabels}
                name="properties"
                options={properties.map((property) => ({
                  value: property.propertyId,
                  label: property.propertyName,
                }))}
              />
            </Field>

            {outcome.state === "alreadyAMember" ? (
              <FormError>{t("staff.alreadyAMember")}</FormError>
            ) : null}
            {outcome.state === "refused" ? (
              <FormError>{t("staff.refused")}</FormError>
            ) : null}

            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("staff.inviteNotice")}
            </p>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("staff.cancel")}
                </Button>
              </DialogClose>
              <Button disabled={pending} type="submit">
                {t("staff.sendInvitation")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
