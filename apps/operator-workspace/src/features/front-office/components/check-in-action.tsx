"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button, FormError } from "@ranza/ui";
import { claimCheckInFocus } from "../check-in-focus";
import {
  checkInReservation,
  checkOutStay,
  type CheckInOutcome,
} from "../../../server/front-office";

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
  field,
  id,
  locale,
  pendingLabel,
  label,
  refusedLabel,
}: {
  action: typeof checkInReservation;
  field: "reservation" | "stay";
  id: string;
  locale: string;
  label: string;
  pendingLabel: string;
  refusedLabel: string;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<CheckInOutcome, FormData>(
    action,
    "idle",
  );

  // Something removed the control that was pressed and said where focus should
  // go afterwards — today that is withdrawing a check-in, which replaces its
  // own dialog with this button. Claimed rather than read, so it happens once.
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (claimCheckInFocus(id)) button.current?.focus();
  }, [id]);

  const message =
    outcome === "unavailable"
      ? t("unitUnavailable")
      : outcome === "refused"
        ? refusedLabel
        : null;

  return (
    <form action={act} className="grid justify-items-end gap-1.5">
      <input name={field} type="hidden" value={id} />
      <input name="locale" type="hidden" value={locale} />
      <Button disabled={pending} ref={button} size="sm" type="submit">
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
  locale,
  reservationId,
}: {
  locale: string;
  reservationId: string;
}) {
  const t = useTranslations();
  return (
    <RowAction
      action={checkInReservation}
      field="reservation"
      id={reservationId}
      label={t("checkIn")}
      locale={locale}
      pendingLabel={t("checkingIn")}
      refusedLabel={t("checkInRefused")}
    />
  );
}

export function CheckOutAction({
  locale,
  stayId,
}: {
  locale: string;
  stayId: string;
}) {
  const t = useTranslations();
  return (
    <RowAction
      action={checkOutStay}
      field="stay"
      id={stayId}
      label={t("checkOut")}
      locale={locale}
      pendingLabel={t("checkingOut")}
      refusedLabel={t("checkOutRefused")}
    />
  );
}
