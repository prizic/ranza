"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert, UserPlus } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
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
import { shippedRoleOf } from "../labels";
import { InvitationLink } from "./invitation-link";
import { useRoleOptions, type RoleOption } from "./role-options";

/**
 * Inviting somebody.
 *
 * The dialog stays open after a successful invitation, which is unusual and
 * deliberate: there is no Notifications module (blueprint 5.12), so the link is
 * shown here for the person who created it to pass on by hand, and closing on
 * success would throw away the only readable copy that will ever exist. Only
 * the token's digest is stored. A person who closes it anyway is not stranded:
 * the roster offers a new link (PEOPLE-07).
 *
 * The role starts empty. A first alphabetical role picked for the person
 * inviting is a role handed out by accident, and for Finance that is the
 * ledger (PEOPLE-03).
 *
 * Presentational. Nothing here asks whether the viewer may invite — the write
 * policies answer, and a check here would go stale between this page rendering
 * and somebody pressing the button.
 */
export function InviteDialog({
  locale,
  organizationId,
  organizationWide,
  properties,
  roles,
}: {
  locale: SupportedLocale;
  organizationId: string;
  /** The viewer reaches the whole Organization, so may give that reach on. */
  organizationWide: boolean;
  properties: readonly { propertyId: string; propertyName: string }[];
  roles: readonly RoleOption[];
}) {
  const t = useTranslations();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" className="size-4" />
          {t("staff.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("staff.inviteTitle")}</DialogTitle>
          <DialogDescription>{t("staff.inviteDescription")}</DialogDescription>
        </DialogHeader>
        <InviteBody
          locale={locale}
          organizationId={organizationId}
          organizationWide={organizationWide}
          properties={properties}
          roles={roles}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounted only while the dialog is open, so closing it forgets the last
 * invitation: reopening shows an empty form and not somebody else's link.
 */
function InviteBody({
  locale,
  organizationId,
  organizationWide,
  properties,
  roles,
}: {
  locale: SupportedLocale;
  organizationId: string;
  organizationWide: boolean;
  properties: readonly { propertyId: string; propertyName: string }[];
  roles: readonly RoleOption[];
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<InviteOutcome, FormData>(
    inviteStaffMember,
    { state: "idle" },
  );
  const [role, setRole] = useState("");
  const [reached, setReached] = useState<string[]>([]);
  const [everywhere, setEverywhere] = useState(false);

  const roleOptions = useRoleOptions(roles);
  const roleLabels = usePickerLabels(t("staff.chooseRole"));
  const propertyLabels = usePickerLabels(t("staff.reachesNothing"));

  const chosen = roles.find(
    (candidate) =>
      `${candidate.organizationId ?? ""}:${candidate.key}` === role,
  );
  const shipped = chosen ? shippedRoleOf(chosen) : null;
  const reachesNothing = !everywhere && reached.length === 0;

  if (outcome.state === "done" && outcome.token && outcome.expiresAt) {
    return (
      <>
        <InvitationLink
          expiresAt={outcome.expiresAt}
          locale={locale}
          token={outcome.token}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{t("staff.done")}</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
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
          required
          aria-describedby="invite-role-description"
          id="invite-role"
          labels={roleLabels}
          name="role"
          onValueChange={setRole}
          options={roleOptions}
          value={role}
        />
        {shipped ? (
          <p
            className="text-sm text-muted-foreground"
            id="invite-role-description"
          >
            {t(`staff.roleDescriptions.${shipped}`)}
          </p>
        ) : null}
      </Field>

      <Field htmlFor="invite-properties" label={t("staff.properties")}>
        <MultiCombobox
          disabled={everywhere}
          id="invite-properties"
          labels={propertyLabels}
          name="properties"
          onValueChange={setReached}
          options={properties.map((property) => ({
            value: property.propertyId,
            label: property.propertyName,
          }))}
          value={everywhere ? [] : reached}
        />
        {organizationWide ? (
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              checked={everywhere}
              className="mt-1"
              name="scope"
              onChange={(event) => setEverywhere(event.target.checked)}
              type="checkbox"
              value="organization_wide"
            />
            {t("staff.everyProperty")}
          </label>
        ) : null}
        {reachesNothing ? (
          <p
            className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning"
            data-testid="reaches-nothing-warning"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {t("staff.reachesNothingWarning")}
          </p>
        ) : null}
      </Field>

      {outcome.state === "alreadyAMember" ? (
        <FormError>{t("staff.alreadyAMember")}</FormError>
      ) : null}
      {outcome.state === "refused" ? (
        <FormError>{t("staff.refused")}</FormError>
      ) : null}

      <p className="text-sm text-muted-foreground">{t("staff.inviteNotice")}</p>

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
  );
}
