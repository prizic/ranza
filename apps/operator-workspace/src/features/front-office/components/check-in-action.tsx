"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button, FormError } from "@ranza/ui";
import { claimCheckInFocus } from "../check-in-focus";
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
  locale,
  reservationId,
}: {
  locale: string;
  reservationId: string;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<CheckInOutcome, FormData>(
    checkInReservation,
    "idle",
  );

  // Something removed the control that was pressed and said where focus should
  // go afterwards — today that is withdrawing a check-in, which replaces its
  // own dialog with this button. Claimed rather than read, so it happens once.
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (claimCheckInFocus(reservationId)) button.current?.focus();
  }, [reservationId]);

  const message =
    outcome === "unavailable"
      ? t("unitUnavailable")
      : outcome === "occupied"
        ? t("unitOccupied")
        : outcome === "notInService"
          ? t("unitNotInService")
          : outcome === "refused"
            ? t("checkInRefused")
            : null;

  return (
    <form action={act} className="grid justify-items-end gap-1.5">
      <input name="reservation" type="hidden" value={reservationId} />
      <input name="locale" type="hidden" value={locale} />
      <Button disabled={pending} ref={button} size="sm" type="submit">
        {pending ? t("checkingIn") : t("checkIn")}
      </Button>
      {message ? (
        // Polite rather than assertive: the button already changed, so this is
        // additional detail and not an interruption.
        <div aria-live="polite">
          <FormError>{message}</FormError>
        </div>
      ) : null}
    </form>
  );
}
