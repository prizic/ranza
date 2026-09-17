"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, UserPlus } from "lucide-react";
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
  roles: readonly { key: string; scopeId: string | null; name: string }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reaching, setReaching] = useState<readonly string[]>([]);
  const [outcome, act, pending] = useActionState<InviteOutcome, FormData>(
    inviteStaffMember,
    { state: "idle" },
  );

  // A role is identified by its scope and its key together — the same pair the
  // database keys on. Naming only the key would resolve an Organization's own
  // role to the shipped one of the same name.
  const optionFor = (role: { key: string; scopeId: string | null }) =>
    `${role.scopeId ?? ""}:${role.key}`;
  const defaultRole = roles[0] ? optionFor(roles[0]) : ":front_desk";

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
            {reaching.map((propertyId) => (
              <input
                key={propertyId}
                name="properties"
                type="hidden"
                value={propertyId}
              />
            ))}

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
                    <SelectItem key={optionFor(role)} value={optionFor(role)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Pills rather than checkboxes, as the mockup has them: a Property
                is a place somebody works, and a row of them reads as a set. An
                empty set is allowed and normal — somebody can be on the roster
                before anybody decides where they work (SP-S1-06). */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("staff.properties")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {properties.map((property) => {
                  const chosen = reaching.includes(property.propertyId);
                  return (
                    <Button
                      aria-pressed={chosen}
                      key={property.propertyId}
                      onClick={() =>
                        setReaching((held) =>
                          chosen
                            ? held.filter((id) => id !== property.propertyId)
                            : [...held, property.propertyId],
                        )
                      }
                      size="sm"
                      type="button"
                      variant={chosen ? "default" : "outline"}
                    >
                      {property.propertyName}
                    </Button>
                  );
                })}
              </div>
            </fieldset>

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
