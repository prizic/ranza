"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, FormError } from "@ranza/ui";
import { claimCheckInFocus } from "../check-in-focus";
import { refusalMessage } from "../refusal";
import {
  checkInReservation,
  type CheckInOutcome,
} from "../../../server/front-office";

/**
 * Checking a Guest in, as a form.
 *
 * A form rather than a button with a click handler, so it works before the
 * JavaScript arrives and so the write goes through a server action — the same
 * funnel every read uses (ADR 0007). Nothing here decides whether the viewer
 * may do it; the row-level policies do, and this only reports what came back.
 *
 * A button rather than a dialog: checking in is undone from the same row, with
 * a reason, so the confirmation belongs to the undo. Check-out is the one that
 * cannot be taken back, which is why it reviews the bill first.
 *
 * `useActionState` is per row, which is why this is a component rather than one
 * form around the table: two rows must be able to fail differently.
 */
export function CheckInAction({
  className,
  guestName,
  locale,
  onDone,
  reservationId,
  room,
}: {
  /** For the button, where it stands among larger ones (the calendar's drawer). */
  className?: string;
  /** Names the button, so a screen reader hears whom it checks in. */
  guestName?: string | undefined;
  locale: string;
  /** Called once the Guest is in: Today refreshes its figures (TD-S2-01). */
  onDone?: () => void;
  reservationId: string;
  /**
   * The room's name and why housekeeping says it is not ready, so the question
   * names the room and the cause rather than an either/or. Absent for a room
   * that is ready, and for a screen that does not know.
   */
  room?:
    { label: string; because: "dirty" | "awaiting_inspection" } | undefined;
}) {
  const t = useTranslations();
  const form = useRef<HTMLFormElement>(null);
  const [outcome, act, pending] = useActionState<CheckInOutcome, FormData>(
    async (previous, data) => {
      // The next row's button is found before the action runs and focused the
      // moment it answers "done", because this row's form is replaced by its
      // Undo button when the list is read again and a hook inside it would
      // never run. The desk checks Guests in one after another: the keyboard
      // goes to the next, not back to the top of the page after every Guest.
      const next = nextCheckIn(form.current);
      const result = await checkInReservation(previous, data);
      if (result === "done") next?.focus();
      return result;
    },
    "idle",
  );

  // Something removed the control that was pressed and said where focus should
  // go afterwards — today that is withdrawing a check-in, which replaces its
  // own dialog with this button. Claimed rather than read, so it happens once.
  const button = useRef<HTMLButtonElement>(null);
  // "Not now" after the warning: the row goes back to its plain button, and
  // the next press asks again, because the server is what decides.
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    if (claimCheckInFocus(reservationId)) button.current?.focus();
  }, [reservationId]);
  useEffect(() => {
    if (outcome === "done") onDone?.();
  }, [outcome, onDone]);

  const refusal = refusalMessage(outcome);
  const message =
    outcome === "unavailable"
      ? t("unitUnavailable")
      : outcome === "occupied"
        ? t("unitOccupied")
        : outcome === "notInService"
          ? t("unitNotInService")
          : outcome === "tooEarly"
            ? t("checkInTooEarly")
            : refusal
              ? t(refusal)
              : null;

  return (
    <form
      action={act}
      className="grid justify-items-end gap-1.5"
      onSubmit={() => setDeclined(false)}
      ref={form}
    >
      <input name="reservation" type="hidden" value={reservationId} />
      <input name="locale" type="hidden" value={locale} />
      {outcome === "notReady" && !declined ? (
        // The question, in place of the button that asked it. A second submit
        // of the same form, so it works before the JavaScript arrives and the
        // server reads readiness again rather than trusting this screen
        // (HK-S2-15, HK-S2-17).
        <div aria-live="polite" className="grid justify-items-end gap-1.5">
          <p className="max-w-48 text-end text-step--1 whitespace-normal [overflow-wrap:anywhere] text-warning">
            {room
              ? t(
                  room.because === "awaiting_inspection"
                    ? "roomNotReadyInspection"
                    : "roomNotReadyDirty",
                  { room: room.label },
                )
              : t("roomNotReady")}
          </p>
          {/* Stacked rather than side by side: at a desk's usual width the
              row's edge padding (packages/ui data-table ROW_CARD) already
              claims back what two buttons in a line need, and a column
              sized to the wider of two stacked buttons is narrower than one
              sized to both plus the gap between them. */}
          <div className="flex flex-col items-end gap-1.5">
            <Button
              disabled={pending}
              onClick={() => setDeclined(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("notNow")}
            </Button>
            <Button
              disabled={pending}
              name="acknowledge"
              ref={button}
              size="sm"
              type="submit"
              value="true"
              variant="outline"
            >
              {pending ? t("checkingIn") : t("checkInAnyway")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          {...(guestName
            ? { "aria-label": t("checkInFor", { guest: guestName }) }
            : {})}
          className={className}
          disabled={pending}
          ref={button}
          size="sm"
          type="submit"
        >
          {pending ? t("checkingIn") : t("checkIn")}
        </Button>
      )}
      {message ? (
        // Polite rather than assertive: the button already changed, so this is
        // additional detail and not an interruption.
        <div aria-live="polite">
          <FormError className="max-w-56 text-end whitespace-normal">
            {message}
          </FormError>
        </div>
      ) : null}
    </form>
  );
}

/**
 * The check-in button of the next row in the table that has one, if any. A DOM
 * walk and not state, because the rows are cells of a table another component
 * draws and this form can see only its own place in it.
 */
function nextCheckIn(form: HTMLFormElement | null): HTMLButtonElement | null {
  let row = form?.closest("tr")?.nextElementSibling ?? null;
  while (row) {
    const next = row.querySelector<HTMLButtonElement>(
      "form button[type='submit']:not([disabled])",
    );
    if (next) return next;
    row = row.nextElementSibling;
  }
  return null;
}
