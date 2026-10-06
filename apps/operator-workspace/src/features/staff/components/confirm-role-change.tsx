"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StaffMember } from "@ranza/staff";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ranza/ui";
import { changeStaffRole, type StaffOutcome } from "../../../server/staff";
import { heldRoleValue, roleNameOf } from "./role-options";

/** A role change somebody has picked and has not yet confirmed. */
export interface RoleChangeProposal {
  userId: string;
  email: string;
  /**
   * The role the actor was shown, captured when they picked. It is what the
   * command is checked against, so it must not be read again from a roster that
   * has refreshed since: that would quietly rebase the decision onto a role the
   * actor never saw (SP-S1-45).
   */
  fromValue: string;
  fromName: string;
  toValue: string;
  toName: string;
  /** The picker that opened this, which gets focus back (SP-S1-51). */
  triggerId: string;
  self: boolean;
  selfLosesAccess: boolean;
  /** Predicted from the roster; the trigger stays the authority (SP-S1-47). */
  lastAdministrator: boolean;
}

/**
 * Asks before somebody's role changes.
 *
 * A role change ends every session the member holds, so it is not a quiet
 * edit and a mis-click on a picker must not be able to make it. Nothing is sent
 * until the actor confirms, and the dialog stays open on a refusal so the
 * reason is read where the decision was made.
 *
 * Remount it for each proposal (a `key`): its outcome belongs to one decision.
 */
export function ConfirmRoleChange({
  current,
  locale,
  onClose,
  open,
  organizationId,
  proposal,
}: {
  /** The member as the roster reads now, which may not be as it was shown. */
  current: StaffMember | undefined;
  locale: string;
  onClose: () => void;
  open: boolean;
  organizationId: string;
  proposal: RoleChangeProposal;
}) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<StaffOutcome>("idle");
  const cancelButton = useRef<HTMLButtonElement>(null);

  // The roster refreshing to the role this very change just wrote is not
  // somebody else's change, so it is only read as one while nothing is in
  // flight and the change has not been reported done.
  const changedMeanwhile =
    outcome === "roleChangedMeanwhile" ||
    (!pending &&
      outcome !== "done" &&
      current !== undefined &&
      heldRoleValue(current) !== proposal.fromValue);
  // A refusal that cannot change on a second press offers no second press.
  const blocked =
    proposal.lastAdministrator ||
    changedMeanwhile ||
    outcome === "roleRetired" ||
    outcome === "lastAdministrator";

  async function confirm(): Promise<void> {
    setPending(true);

    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("member", proposal.userId);
    form.set("role", proposal.toValue);
    form.set("expected", proposal.fromValue);

    try {
      const result = await changeStaffRole("idle", form);
      setOutcome(result);
      if (result === "done") onClose();
    } catch (error) {
      console.error("staff.role_change_failed", {
        member: proposal.userId,
        error,
      });
      setOutcome("refused");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      open={open}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(proposal.triggerId)?.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButton.current?.focus();
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t("staff.confirmRoleTitle")}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              {changedMeanwhile ? (
                <p>
                  {t("staff.roleChangedMeanwhile", {
                    member: proposal.email,
                    role: current ? roleNameOf(current, t) : proposal.fromName,
                  })}
                </p>
              ) : proposal.lastAdministrator ? (
                <p>{t("staff.lastAdministrator")}</p>
              ) : (
                <>
                  <p>
                    {t("staff.confirmRoleChange", {
                      member: proposal.email,
                      from: proposal.fromName,
                      to: proposal.toName,
                    })}
                  </p>
                  <p>{t("staff.confirmRoleSessions")}</p>
                  {proposal.self ? <p>{t("staff.confirmRoleSelf")}</p> : null}
                  {proposal.self && proposal.selfLosesAccess ? (
                    <p>
                      {t("staff.confirmRoleSelfLosesAccess", {
                        to: proposal.toName,
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        {outcome !== "idle" &&
        outcome !== "done" &&
        outcome !== "roleChangedMeanwhile" ? (
          <p className="text-sm text-destructive" role="alert">
            {outcome === "roleRetired"
              ? t("staff.roleRetired")
              : outcome === "lastAdministrator"
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
            variant="outline"
          >
            {blocked ? t("staff.confirmRoleClose") : t("staff.cancel")}
          </Button>
          {blocked ? null : (
            <Button
              disabled={pending}
              onClick={() => void confirm()}
              type="button"
            >
              {t("staff.confirmRoleConfirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
