"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
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
  DialogNotice,
  DialogSection,
  FormError,
  MultiCombobox,
  dialogFrameClassName,
} from "@ranza/ui";
import {
  changeStaffProperties,
  type StaffOutcome,
} from "../../../server/staff";
import { usePickerLabels } from "../../../lib/picker-labels";
import { propertiesToOffer, reachChange } from "../acts-on";

/** A Property as the picker names it. */
export interface PropertyChoice {
  propertyId: string;
  propertyName: string;
}

/**
 * Where somebody works, changed from the roster (PEOPLE-01).
 *
 * The invitation was the only place reach could be set, while three screens
 * promised "until you assign one". The picker opens with what the roster shows
 * and the dialog says what saving does before it is pressed: every session the
 * person holds ends (SP-S1-18, SP-S1-28), which Properties are added and which
 * taken away, and when the result is no Property at all.
 *
 * The Properties on offer are the viewer's own reach plus the ones the member
 * already holds, because giving a Property is bounded by the actor's reach and
 * taking one away is not (SP-S1-36). A held one the viewer does not reach is
 * said so rather than left looking like something that can be put back.
 *
 * Remount it for each proposal (a `key`): its outcome belongs to one decision.
 */
export function ChangePropertiesDialog({
  locale,
  member,
  onClose,
  open,
  organizationId,
  reachable,
  self,
}: {
  locale: string;
  member: StaffMember;
  onClose: () => void;
  open: boolean;
  organizationId: string;
  /** The Properties the viewer may give: every one they reach. */
  reachable: readonly PropertyChoice[];
  /** The viewer's own row. */
  self: boolean;
}) {
  const t = useTranslations();
  const held = member.properties.map((property) => property.propertyId);
  const [selected, setSelected] = useState<string[]>(held);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<StaffOutcome>("idle");
  const labels = usePickerLabels(t("staff.reachesNothing"));

  const options = propertiesToOffer(reachable, member.properties);
  const nameOf = (propertyId: string): string =>
    options.find((option) => option.propertyId === propertyId)?.propertyName ??
    propertyId;
  const { added, removed } = reachChange(held, selected);
  const changed = added.length + removed.length > 0;
  const reachesNothing = selected.length === 0;
  const stale = outcome === "reachChangedMeanwhile";

  async function confirm(): Promise<void> {
    setPending(true);
    const form = new FormData();
    form.set("locale", locale);
    form.set("organization", organizationId);
    form.set("member", member.userId);
    for (const propertyId of held) form.append("expected", propertyId);
    for (const propertyId of selected) form.append("properties", propertyId);

    try {
      const result = await changeStaffProperties("idle", form);
      setOutcome(result);
      if (result === "done") onClose();
    } catch (error) {
      console.error("staff.properties_change_failed", {
        member: member.userId,
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
        className={dialogFrameClassName("medium")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .getElementById(`staff-properties-${member.membershipId}`)
            ?.focus();
        }}
      >
        <DialogMasthead
          art="/illustrations/dialogs/invite.svg"
          eyebrow={t("staff.reach.change")}
          heading={member.email}
        />
        <DialogBody>
          <DialogDescription className="sr-only">
            {t("staff.reach.description", { member: member.email })}
          </DialogDescription>
          <DialogSection
            labelFor="staff-properties-picker"
            title={t("staff.properties")}
          >
            <MultiCombobox
              disabled={stale}
              id="staff-properties-picker"
              labels={labels}
              onValueChange={setSelected}
              options={options.map((option) => ({
                value: option.propertyId,
                label: option.propertyName,
              }))}
              value={selected}
            />
          </DialogSection>

          <div className="grid gap-3 py-5" data-testid="reach-consequence">
            {stale ? null : (
              <>
                {added.length > 0 ? (
                  <p className="m-0 text-sm" data-testid="reach-adds">
                    {t("staff.reach.adds", {
                      names: added.map(nameOf).join(", "),
                    })}
                  </p>
                ) : null}
                {removed.length > 0 ? (
                  <p className="m-0 text-sm" data-testid="reach-removes">
                    {t("staff.reach.removes", {
                      names: removed.map(nameOf).join(", "),
                    })}
                  </p>
                ) : null}
                <DialogNotice>
                  {t("staff.reach.sessions", { member: member.email })}
                </DialogNotice>
                {self ? (
                  <p className="m-0 text-sm">{t("staff.reach.self")}</p>
                ) : null}
                {reachesNothing && changed ? (
                  <div data-testid="reaches-nothing-warning">
                    <DialogNotice icon={TriangleAlert}>
                      {self
                        ? t("staff.reach.selfNone")
                        : t("staff.reachesNothingWarning")}
                    </DialogNotice>
                  </div>
                ) : null}
              </>
            )}
            {stale ? (
              <div aria-live="polite">
                <FormError>{t("staff.reach.changedMeanwhile")}</FormError>
              </div>
            ) : null}
            {outcome === "refused" ? (
              <div aria-live="polite">
                <FormError>{t("staff.refused")}</FormError>
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogActions
          hint={changed || stale ? null : t("staff.reach.hintNoChange")}
        >
          <CancelButton disabled={pending} onClick={onClose} type="button">
            {stale ? t("staff.confirmRoleClose") : t("staff.cancel")}
          </CancelButton>
          {stale ? null : (
            <ArrowButton
              disabled={pending || !changed}
              onClick={() => void confirm()}
              type="button"
            >
              {t("staff.reach.save")}
            </ArrowButton>
          )}
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
