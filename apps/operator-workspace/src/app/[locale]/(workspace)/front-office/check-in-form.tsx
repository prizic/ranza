"use client";

import { useActionState } from "react";
import { Button } from "@ranza/ui";
import {
  checkInReservation,
  type CheckInOutcome,
} from "../../../../server/front-office";

/**
 * The check-in control for one arrival.
 *
 * A form rather than a button with a click handler, so it works before the
 * JavaScript arrives and so the write goes through a server action — the same
 * funnel every read uses (ADR 0007). Nothing here decides whether the viewer
 * may check this Guest in; the row-level policies do, and this only reports
 * what came back.
 *
 * `useActionState` is per row, which is why this is a component rather than one
 * form around the whole list: two arrivals must be able to fail differently.
 */
export function CheckInForm({
  copy,
  locale,
  reservationId,
}: {
  copy: {
    checkIn: string;
    checkingIn: string;
    checkedIn: string;
    unitUnavailable: string;
    checkInRefused: string;
  };
  locale: string;
  reservationId: string;
}) {
  const [outcome, act, pending] = useActionState<CheckInOutcome, FormData>(
    checkInReservation,
    "idle",
  );

  const message =
    outcome === "unavailable"
      ? copy.unitUnavailable
      : outcome === "refused"
        ? copy.checkInRefused
        : null;

  return (
    <form action={act} className="arrival-action">
      <input name="reservation" type="hidden" value={reservationId} />
      <input name="locale" type="hidden" value={locale} />
      <Button disabled={pending} type="submit">
        {pending ? copy.checkingIn : copy.checkIn}
      </Button>
      {message ? (
        // Polite rather than assertive: the button label already changed, so
        // this is additional detail and not an interruption.
        <p aria-live="polite" className="field-error">
          {message}
        </p>
      ) : null}
    </form>
  );
}
