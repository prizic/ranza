"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StaffMember } from "@ranza/staff";
import {
  ArrowButton,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  dialogFrameClassName,
} from "@ranza/ui";
import { changeStaffRole, type StaffOutcome } from "../../../server/staff";
import { asPermission } from "../labels";
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
  /** The picker that opened this, which gets focus back (SP-S1-52). */
  triggerId: string;
  self: boolean;
  selfLosesAccess: boolean;
  /** Predicted from the roster; the trigger stays the authority (SP-S1-47). */
  lastAdministrator: boolean;
  /** What the person can do after that they cannot now (PEOPLE-10). */
  gained: readonly string[];
  /** What they can do now and will not be able to. */
  lost: readonly string[];
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
        className={dialogFrameClassName("small")}
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
        <DialogMasthead
          art="/illustrations/dialogs/change-role.svg"
          eyebrow={t("staff.confirmRoleConfirm")}
          facts={`${proposal.fromName} → ${proposal.toName}`}
          heading={proposal.email}
        />
        <DialogBody simple>
          <DialogDescription asChild>
            <div className="grid gap-3 text-sm">
              {changedMeanwhile ? (
                <p className="m-0">
                  {t("staff.roleChangedMeanwhile", {
                    member: proposal.email,
                    role: current ? roleNameOf(current, t) : proposal.fromName,
                  })}
                </p>
              ) : proposal.lastAdministrator ? (
                <p className="m-0">{t("staff.lastAdministrator")}</p>
              ) : (
                <>
                  <p className="m-0">
                    {t("staff.confirmRoleChange", {
                      member: proposal.email,
                      from: proposal.fromName,
                      to: proposal.toName,
                    })}
                  </p>
                  <p className="m-0">{t("staff.confirmRoleSessions")}</p>
                  <PermissionDifference
                    lost={proposal.lost}
                    gained={proposal.gained}
                  />
                  {proposal.self ? (
                    <p className="m-0">{t("staff.confirmRoleSelf")}</p>
                  ) : null}
                  {proposal.self && proposal.selfLosesAccess ? (
                    <p className="m-0">
                      {t("staff.confirmRoleSelfLosesAccess", {
                        to: proposal.toName,
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </DialogDescription>
          {outcome !== "idle" &&
          outcome !== "done" &&
          outcome !== "roleChangedMeanwhile" ? (
            <p className="m-0 text-sm text-destructive" role="alert">
              {outcome === "roleRetired"
                ? t("staff.roleRetired")
                : outcome === "lastAdministrator"
                  ? t("staff.lastAdministrator")
                  : t("staff.refused")}
            </p>
          ) : null}
        </DialogBody>
        <DialogActions>
          <CancelButton
            disabled={pending}
            onClick={onClose}
            ref={cancelButton}
            type="button"
          >
            {blocked ? t("staff.confirmRoleClose") : t("staff.cancel")}
          </CancelButton>
          {blocked ? null : (
            <ArrowButton
              disabled={pending}
              onClick={() => void confirm()}
              type="button"
            >
              {t("staff.confirmRoleConfirm")}
            </ArrowButton>
          )}
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a role change gives and takes, in the words of the roles grid.
 *
 * Going from Housekeeping to Manager reads as "a different job" until it is
 * listed as payroll and the ledger. The money and staff items come first
 * because they are the ones a person would want to have been told about.
 */
function PermissionDifference({
  gained,
  lost,
}: {
  gained: readonly string[];
  lost: readonly string[];
}) {
  const t = useTranslations();
  const named = (keys: readonly string[]): string =>
    [...keys]
      .sort((a, b) => weight(b) - weight(a))
      .map((key) => {
        const known = asPermission(key);
        return known ? t(`staff.permissions.${known}`) : key;
      })
      .join(", ");

  return (
    <>
      {gained.length > 0 ? (
        <p className="m-0" data-testid="role-gains">
          {t("staff.confirmRoleGains", { permissions: named(gained) })}
        </p>
      ) : null}
      {lost.length > 0 ? (
        <p className="m-0" data-testid="role-losses">
          {t("staff.confirmRoleLosses", { permissions: named(lost) })}
        </p>
      ) : null}
    </>
  );
}

/** Money and staff first: 1 for those, 0 for the rest. */
function weight(permission: string): number {
  return permission.startsWith("finance.") ||
    permission.startsWith("staff.") ||
    permission.startsWith("hr.")
    ? 1
    : 0;
}
