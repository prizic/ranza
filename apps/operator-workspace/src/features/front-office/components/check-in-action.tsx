"use client";

import { useActionState } from "react";
import { Button, FormError } from "@ranza/ui";
import {
  checkInReservation,
  checkOutStay,
  type CheckInOutcome,
} from "../../../server/front-office";
import type { Messages } from "../../../messages";

/**
 * The one action a row offers, as a form.
 *
 * A form rather than a button with a click handler, so it works before the
 * JavaScript arrives and so the write goes through a server action — the same
 * funnel every read uses (ADR 0007). Nothing here decides whether the viewer
 * may do it; the row-level policies do, and this only reports what came back.
 *
 * Not a `DataTableRowActions` menu: a row has exactly one thing to do, and
 * burying a single verb behind a second click is a menu for its own sake. The
 * menu earns its place when a row grows a second action.
 *
 * `useActionState` is per row, which is why this is a component rather than one
 * form around the table: two rows must be able to fail differently.
 */
function RowAction({
  action,
  copy,
  field,
  id,
  locale,
  pendingLabel,
  label,
  refusedLabel,
}: {
  action: typeof checkInReservation;
  copy: Messages;
  field: "reservation" | "stay";
  id: string;
  locale: string;
  label: string;
  pendingLabel: string;
  refusedLabel: string;
}) {
  const [outcome, act, pending] = useActionState<CheckInOutcome, FormData>(
    action,
    "idle",
  );

  const message =
    outcome === "unavailable"
      ? copy.unitUnavailable
      : outcome === "refused"
        ? refusedLabel
        : null;

  return (
    <form action={act} className="grid justify-items-end gap-1.5">
      <input name={field} type="hidden" value={id} />
      <input name="locale" type="hidden" value={locale} />
      <Button disabled={pending} size="sm" type="submit">
        {pending ? pendingLabel : label}
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

export function CheckInAction({
  copy,
  locale,
  reservationId,
}: {
  copy: Messages;
  locale: string;
  reservationId: string;
}) {
  return (
    <RowAction
      action={checkInReservation}
      copy={copy}
      field="reservation"
      id={reservationId}
      label={copy.checkIn}
      locale={locale}
      pendingLabel={copy.checkingIn}
      refusedLabel={copy.checkInRefused}
    />
  );
}

export function CheckOutAction({
  copy,
  locale,
  stayId,
}: {
  copy: Messages;
  locale: string;
  stayId: string;
}) {
  return (
    <RowAction
      action={checkOutStay}
      copy={copy}
      field="stay"
      id={stayId}
      label={copy.checkOut}
      locale={locale}
      pendingLabel={copy.checkingOut}
      refusedLabel={copy.checkOutRefused}
    />
  );
}
