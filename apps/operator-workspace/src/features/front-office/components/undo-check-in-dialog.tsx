"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { isolate } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  dialogFrameClassName,
  DialogTrigger,
  FormError,
  Textarea,
  textareaClassName,
} from "@ranza/ui";
import {
  reverseCheckIn,
  type ReverseCheckInOutcome,
} from "../../../server/front-office";
import { claimCheckInFocus, focusCheckInFor } from "../check-in-focus";

/**
 * Taking back a check-in that should not have happened (ADR 0022).
 *
 * A dialog rather than a second button on the row, because this one asks for
 * something: blueprint 4.4 leaves it to the caller to decide which actions need
 * a reason, and withdrawing the record of somebody's arrival is one. A
 * confirmation with no field would be a speed bump; the field is the point.
 *
 * `Dialog` and not `AlertDialog` for the same reason — an alert dialog is for a
 * question with two answers and nothing to type.
 *
 * Presentational. It reports what the server action came back with and decides
 * nothing: whether this viewer may withdraw this Stay is the policy's answer,
 * and whether it may be withdrawn at all is the trigger's.
 *
 * It closes by being taken away. A withdrawal that succeeds revalidates the
 * list, the row comes back `confirmed`, and the cell renders a check-in button
 * where this component was — so there is no "close on success" to write, and no
 * moment where the dialog claims something the row has not caught up with.
 */

/**
 * `REVERSAL_REASON` in `@ranza/reservations`, restated rather than imported:
 * that module's entry point also exports the module factory, so a value import
 * from a client component pulls Prisma into the browser bundle.
 * `tests/unit/undo-check-in.test.tsx` fails if the two ever disagree, which is
 * the only thing the import was buying.
 */
const REASON = { min: 3, max: 2000 };

export function UndoCheckInDialog({
  guestName,
  locale,
  reservationId,
  stayId,
  unitName,
}: {
  guestName: string;
  locale: string;
  reservationId: string;
  stayId: string;
  unitName: string;
}) {
  const t = useTranslations();
  /**
   * Controlled, so a refusal does not take the sentence with it.
   *
   * React clears an uncontrolled form when the action returns, which is right
   * for a field whose work is done and wrong for the one refusal somebody is
   * expected to answer: a reason of spaces passes `required` and `minLength`
   * and fails the module, and the answer to that is an edit rather than a
   * retype.
   *
   * Dismissing the dialog forgets it. Coming back an hour later to a sentence
   * somebody wrote about a different decision is worse than an empty field.
   */
  const [reason, setReason] = useState("");
  const [outcome, act, pending] = useActionState<
    ReverseCheckInOutcome,
    FormData
  >(reverseCheckIn, "idle");

  // Taken back when the withdrawal did not happen. The intention is left at
  // submit rather than on success, because success is the one outcome this
  // component never sees: the row it lives in is replaced by the revalidation,
  // and the state saying it worked is discarded with it. A refusal leaves it
  // mounted and reading, which is exactly when the word has to be withdrawn.
  useEffect(() => {
    if (outcome !== "idle" && outcome !== "done") {
      claimCheckInFocus(reservationId);
    }
  }, [outcome, reservationId]);

  // Answers the desk cannot act on by editing: the check-in stays as it is,
  // and the dialog says why instead of asking again.
  const final =
    outcome === "charges"
      ? t("stayHasCharges")
      : outcome === "dayClosed"
        ? t("checkInDayClosed")
        : outcome === "moved"
          ? t("checkInMoved")
          : outcome === "refused"
            ? t("undoCheckInRefused")
            : null;
  const message =
    outcome === "reasonTooShort"
      ? t("reasonTooShort", { min: REASON.min })
      : outcome === "reasonTooLong"
        ? t("reasonTooLong", { max: REASON.max })
        : null;
  const needsReason = reason.trim().length < REASON.min;

  return (
    <Dialog onOpenChange={(open) => !open && setReason("")}>
      <DialogTrigger asChild>
        {/* Named with the Guest, so a column of identical buttons is still a
            list of different actions to a screen reader. The name is isolated
            because it is data: a Latin name in an Arabic label, or one carrying
            a bracket, is otherwise reordered against the words around it. */}
        <Button
          aria-label={t("undoCheckInFor", { guest: isolate(guestName) })}
          size="sm"
          variant="ghost"
        >
          {/* Marked as a control rather than a caption. A ghost button beside a
              badge is two pieces of text until one of them carries something a
              reader recognises as pressable. */}
          <Undo2 aria-hidden="true" />
          {t("undoCheckIn")}
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogFrameClassName("small")}>
        <form
          action={(data) => {
            // Before the write, for the reason above. Nothing is focused yet —
            // this only says where focus should land if the row comes back.
            focusCheckInFor(reservationId);
            act(data);
          }}
          className="grid"
        >
          <DialogMasthead
            art="/illustrations/dialogs/undo-check-in.svg"
            eyebrow={t("undoCheckInTitle")}
            facts={`${t("roomWord")} ${unitName}`}
            heading={guestName}
          />

          <DialogBody simple>
            <DialogDescription className="sr-only">
              {t("undoCheckInSummary")}
            </DialogDescription>

            <input name="stay" type="hidden" value={stayId} />
            <input name="locale" type="hidden" value={locale} />

            {final ? (
              <div role="alert">
                <DialogNotice>{final}</DialogNotice>
              </div>
            ) : (
              <>
                <DialogNotice>{t("undoCheckInSummary")}</DialogNotice>
                <DialogSection
                  hint={t("reasonHint")}
                  labelFor={`reason-${stayId}`}
                  tag={{ label: t("dialogTagRequired"), required: true }}
                  title={t("undoCheckInWhy")}
                >
                  <Textarea
                    autoFocus
                    className={textareaClassName}
                    aria-describedby={`reason-${stayId}-hint`}
                    id={`reason-${stayId}`}
                    maxLength={REASON.max}
                    minLength={REASON.min}
                    name="reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("undoCheckInReasonExample")}
                    required
                    rows={3}
                    value={reason}
                  />
                </DialogSection>
              </>
            )}

            {message ? <FormError>{message}</FormError> : null}
          </DialogBody>

          <DialogActions
            hint={final || !needsReason ? null : t("dialogHintReason")}
          >
            <DialogClose asChild>
              <CancelButton type="button">{t("keepCheckIn")}</CancelButton>
            </DialogClose>
            {final ? null : (
              <ArrowButton
                disabled={pending || needsReason}
                tone="danger"
                type="submit"
              >
                {pending ? t("undoingCheckIn") : t("undoCheckIn")}
              </ArrowButton>
            )}
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
