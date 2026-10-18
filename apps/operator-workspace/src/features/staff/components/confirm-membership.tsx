"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StaffMember } from "@ranza/staff";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ranza/ui";
import {
  addBackStaffMember,
  renewInvitationLink,
  revokeStaffMember,
  undoStaffRevoke,
  type InviteOutcome,
  type StaffOutcome,
} from "../../../server/staff";
import { InvitationLink } from "./invitation-link";
import { UNDO_WINDOW_HOURS } from "../labels";
import { roleNameOf } from "./role-options";

/** What a row's menu proposes to do to a membership, before it is done. */
export interface MembershipProposal {
  kind: "revoke" | "restore" | "renew" | "readd";
  member: StaffMember;
  /** The viewer's own row. */
  self: boolean;
  /** Predicted from the roster; the trigger stays the authority (SP-S1-47). */
  lastAdministrator: boolean;
}

/**
 * Asks before a membership is changed, naming what the change does.
 *
 * Revoking ends every session the person holds and is not undone for good by
 * the same press; the dialog says so, says how long the undo lasts, and says
 * what stays. It is the role-change confirmation's pattern (SP-S1-41) applied
 * to the other irreversible-feeling act on this screen (PEOPLE-02).
 *
 * A refusal the actor can act on is predicted before the press and ends the
 * dialog with the way out (PEOPLE-11); any other stays in the dialog, where
 * the decision was made, and nothing the person typed is lost because nothing
 * is typed here.
 *
 * Remount it for each proposal (a `key`): its outcome belongs to one decision.
 */
export function ConfirmMembership({
  locale,
  onClose,
  open,
  organizationId,
  proposal,
}: {
  locale: SupportedLocale;
  onClose: () => void;
  open: boolean;
  organizationId: string;
  proposal: MembershipProposal;
}) {
  const t = useTranslations();
  const { kind, member, self, lastAdministrator } = proposal;
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<StaffOutcome>("idle");
  const [link, setLink] = useState<InviteOutcome | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  const blocked =
    (kind === "revoke" && lastAdministrator) || outcome === "lastAdministrator";
  const issuesLink = kind === "renew" || kind === "readd";

  async function confirm(): Promise<void> {
    setPending(true);
    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("member", member.userId);

    try {
      if (issuesLink) {
        const result = await (
          kind === "renew" ? renewInvitationLink : addBackStaffMember
        )({ state: "idle" }, form);
        if (result.state === "done") setLink(result);
        else setOutcome(result.state);
        return;
      }
      const result = await (
        kind === "revoke" ? revokeStaffMember : undoStaffRevoke
      )("idle", form);
      setOutcome(result);
      if (result === "done") onClose();
    } catch (error) {
      console.error("staff.membership_change_failed", {
        kind,
        member: member.userId,
        error,
      });
      setOutcome("refused");
    } finally {
      setPending(false);
    }
  }

  const undoUntil = member.revokedAt
    ? formatDate(
        new Date(Date.parse(member.revokedAt) + UNDO_WINDOW_HOURS * 3_600_000),
        locale,
        {
          hour: "numeric",
          minute: "2-digit",
        },
      )
    : null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      open={open}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButton.current?.focus();
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {t(`staff.membership.${kind}.title`, { member: member.email })}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              {link && (kind === "renew" || kind === "readd") ? (
                <p>{t(`staff.membership.${kind}.done`)}</p>
              ) : blocked ? (
                <p>{t("staff.lastAdministrator")}</p>
              ) : (
                <>
                  <p>
                    {t(`staff.membership.${kind}.body`, {
                      member: member.email,
                      role: roleNameOf(member, t),
                    })}
                  </p>
                  {kind === "revoke" ? (
                    <>
                      <p>{t("staff.membership.revoke.keeps")}</p>
                      <p>
                        {t("staff.membership.revoke.undo", {
                          hours: UNDO_WINDOW_HOURS,
                        })}
                      </p>
                    </>
                  ) : null}
                  {kind === "revoke" && self ? (
                    <p className="font-medium text-destructive">
                      {t("staff.membership.revoke.self")}
                    </p>
                  ) : null}
                  {kind === "restore" && undoUntil ? (
                    <p>
                      {t("staff.membership.restore.until", {
                        until: undoUntil,
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {link?.token && link.expiresAt ? (
          <InvitationLink
            expiresAt={link.expiresAt}
            locale={locale}
            token={link.token}
          />
        ) : null}

        {!link && outcome !== "idle" && outcome !== "done" ? (
          <p className="text-sm text-destructive" role="alert">
            {outcome === "lastAdministrator"
              ? t("staff.lastAdministrator")
              : t("staff.refused")}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={onClose}
            ref={cancelButton}
            type="button"
            variant={link ? "default" : "outline"}
          >
            {link
              ? t("staff.done")
              : blocked
                ? t("staff.confirmRoleClose")
                : t("staff.cancel")}
          </Button>
          {blocked || link ? null : (
            <Button
              disabled={pending}
              onClick={() => void confirm()}
              type="button"
              variant={kind === "revoke" ? "destructive" : "default"}
            >
              {t(`staff.membership.${kind}.confirm`)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
