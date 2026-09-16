"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { isolate } from "@ranza/i18n";
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
  Fact,
  FactList,
  Field,
  FormError,
  Textarea,
} from "@ranza/ui";
import {
  reverseCheckIn,
  type ReverseCheckInOutcome,
} from "../../../server/front-office";

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
  stayId,
  unitName,
}: {
  guestName: string;
  locale: string;
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

  const message =
    outcome === "charges"
      ? t("stayHasCharges")
      : outcome === "reasonTooShort"
        ? t("reasonTooShort", { min: REASON.min })
        : outcome === "reasonTooLong"
          ? t("reasonTooLong", { max: REASON.max })
          : outcome === "refused"
            ? t("undoCheckInRefused")
            : null;

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

      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("undoCheckInTitle")}</DialogTitle>
            <DialogDescription>{t("undoCheckInSummary")}</DialogDescription>
          </DialogHeader>

          {/* Beside the sentence rather than inside it: a name in a template is
              a name inside another language's grammar, which Turkish and Arabic
              both inflect and a placeholder cannot. */}
          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{guestName}</bdi>
            </Fact>
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{unitName}</bdi>
            </Fact>
          </FactList>

          <input name="stay" type="hidden" value={stayId} />
          <input name="locale" type="hidden" value={locale} />

          <Field htmlFor={`reason-${stayId}`} label={t("reason")}>
            <Textarea
              aria-describedby={`reason-hint-${stayId}`}
              autoFocus
              id={`reason-${stayId}`}
              maxLength={REASON.max}
              minLength={REASON.min}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </Field>
          <p
            className="text-step--1 text-muted-foreground"
            id={`reason-hint-${stayId}`}
          >
            {t("reasonHint")}
          </p>

          {message ? <FormError>{message}</FormError> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepCheckIn")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              {pending ? t("undoingCheckIn") : t("undoCheckIn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
