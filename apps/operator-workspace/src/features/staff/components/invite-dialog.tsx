"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert, UserPlus } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogTrigger,
  FormError,
  Input,
  MultiCombobox,
  TickRow,
  dialogFrameClassName,
  fieldClassName,
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
      <DialogContent className={dialogFrameClassName("medium")}>
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
  const [email, setEmail] = useState("");
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

  const masthead = (
    <DialogMasthead
      art="/illustrations/dialogs/invite.svg"
      eyebrow={t("staff.invite")}
      heading={t("staff.inviteTitle")}
      large
    />
  );

  if (outcome.state === "done" && outcome.token && outcome.expiresAt) {
    return (
      <>
        {masthead}
        <DialogBody simple>
          <DialogDescription className="sr-only">
            {t("staff.inviteDescription")}
          </DialogDescription>
          <InvitationLink
            expiresAt={outcome.expiresAt}
            locale={locale}
            token={outcome.token}
          />
        </DialogBody>
        <DialogActions>
          <DialogClose asChild>
            <ArrowButton type="button">{t("staff.done")}</ArrowButton>
          </DialogClose>
        </DialogActions>
      </>
    );
  }

  const ready = email.trim() !== "" && role !== "";

  return (
    <form action={act} className="grid">
      {masthead}
      <DialogBody>
        <DialogDescription className="sr-only">
          {t("staff.inviteDescription")}
        </DialogDescription>
        <input name="locale" type="hidden" value={locale} />
        <input name="organization" type="hidden" value={organizationId} />

        <DialogSection
          labelFor="invite-email"
          tag={{ label: t("dialogTagRequired"), required: true }}
          title={t("staff.email")}
        >
          <Input
            required
            autoComplete="off"
            className={fieldClassName}
            id="invite-email"
            maxLength={254}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
        </DialogSection>

        <DialogSection
          hint={shipped ? t(`staff.roleDescriptions.${shipped}`) : null}
          labelFor="invite-role"
          tag={{ label: t("dialogTagRequired"), required: true }}
          title={t("staff.role")}
        >
          <Combobox
            required
            aria-describedby="invite-role-hint"
            id="invite-role"
            labels={roleLabels}
            name="role"
            onValueChange={setRole}
            options={roleOptions}
            value={role}
          />
        </DialogSection>

        <DialogSection
          labelFor="invite-properties"
          tag={{ label: t("dialogTagOptional"), required: false }}
          title={t("staff.properties")}
        >
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
            <TickRow
              checked={everywhere}
              id="invite-everywhere"
              name="scope"
              onCheckedChange={setEverywhere}
              value="organization_wide"
            >
              {t("staff.everyProperty")}
            </TickRow>
          ) : null}
          {reachesNothing ? (
            <div data-testid="reaches-nothing-warning">
              <DialogNotice icon={TriangleAlert}>
                {t("staff.reachesNothingWarning")}
              </DialogNotice>
            </div>
          ) : null}
        </DialogSection>

        <div className="grid gap-3 py-5">
          <DialogNotice>{t("staff.inviteNotice")}</DialogNotice>
          {outcome.state === "alreadyAMember" ? (
            <div aria-live="polite">
              <FormError>{t("staff.alreadyAMember")}</FormError>
            </div>
          ) : null}
          {outcome.state === "refused" ? (
            <div aria-live="polite">
              <FormError>{t("staff.refused")}</FormError>
            </div>
          ) : null}
        </div>
      </DialogBody>

      <DialogActions hint={ready ? null : t("staff.inviteHintMissing")}>
        <DialogClose asChild>
          <CancelButton type="button">{t("staff.cancel")}</CancelButton>
        </DialogClose>
        <ArrowButton disabled={pending || !ready} type="submit">
          {t("staff.sendInvitation")}
        </ArrowButton>
      </DialogActions>
    </form>
  );
}
