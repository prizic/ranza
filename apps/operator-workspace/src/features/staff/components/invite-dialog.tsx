"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
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
import { inviteStaffMember, type InviteOutcome } from "../../../server/staff";

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
  roles: readonly { key: string; name: string }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // The list is never empty — it is the shipped roles — but a `?.` here would
  // make the Select uncontrolled instead of saying so.
  const defaultRole = roles[0]?.key ?? "front_desk";
  const [outcome, act, pending] = useActionState<InviteOutcome, FormData>(
    inviteStaffMember,
    { state: "idle" },
  );

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
            <p className="text-muted-foreground text-sm">
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
              <Select defaultValue={defaultRole} name="role">
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Naming no Property is allowed and normal: somebody can be on the
                roster before anybody decides where they work (SP-S1-06). */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("staff.properties")}
              </legend>
              {properties.map((property) => (
                <label
                  className="flex items-center gap-2 text-sm"
                  key={property.propertyId}
                >
                  <input
                    name="properties"
                    type="checkbox"
                    value={property.propertyId}
                  />
                  {property.propertyName}
                </label>
              ))}
            </fieldset>

            {outcome.state === "alreadyAMember" ? (
              <FormError>{t("staff.alreadyAMember")}</FormError>
            ) : null}
            {outcome.state === "refused" ? (
              <FormError>{t("staff.refused")}</FormError>
            ) : null}

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
