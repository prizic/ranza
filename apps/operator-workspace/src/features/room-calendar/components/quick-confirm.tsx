"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { ChangePreview, DeparturePreview } from "@ranza/reservations";
import { Button, Popover, PopoverAnchor, PopoverContent } from "@ranza/ui";
import { changeBooking, changeDeparture } from "../../../server/front-office";
import { daysBetween } from "../layout";
import type { MoveRequest } from "../move";

/** A pulled end: what the inline confirm answers (RC-S5-04). */
export type PlainDrop = Extract<MoveRequest, { kind: "booking" | "departure" }>;

/**
 * What the confirm can save, once the database has been asked: the version to
 * pin, and the words for what changes. Anything the database says that the
 * calendar did not know sends the drop to its full dialog instead.
 */
type Ready =
  | {
      kind: "departure";
      preview: DeparturePreview;
      endsOn: string;
    }
  | {
      kind: "booking";
      preview: ChangePreview;
      endsOn: string;
      rateMinor: number | null;
      currency: string | null;
    };

async function readPreview<T>(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<T | null> {
  const response = await fetch(`${path}?${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw Object.assign(new Error("the change could not be previewed"), {
      status: response.status,
    });
  }
  const answer = (await response.json()) as
    { kind: "preview"; preview: T } | { kind: string };
  return "preview" in answer ? answer.preview : null;
}

/**
 * The database's answer for a pulled end, when it agrees with the calendar:
 * the bar is as drawn, nothing is in the way and the price of a night is
 * kept. Null when it does not, so the full dialog can say why.
 */
async function plainAnswer(
  drop: PlainDrop,
  signal: AbortSignal,
): Promise<Ready | null> {
  if (drop.kind === "departure") {
    const { bar } = drop.entry;
    if (drop.endsOn === null) return null;
    const preview = await readPreview<DeparturePreview>(
      "/api/front-office/departure-change",
      { stay: bar.stayId, to: drop.endsOn },
      signal,
    );
    // An overdue Guest's departure is in the past, which the full dialog
    // explains before offering a day.
    return preview &&
      preview.blocker === null &&
      preview.endsOn === bar.endsOn &&
      preview.endsOn !== null &&
      preview.endsOn >= preview.today &&
      drop.endsOn > preview.today
      ? { kind: "departure", preview, endsOn: drop.endsOn }
      : null;
  }

  const { bar } = drop.entry;
  const { target } = drop;
  if (target.endsOn === null) return null;
  const preview = await readPreview<ChangePreview>(
    "/api/front-office/booking-change",
    {
      reservation: bar.reservationId,
      from: target.startsOn,
      to: target.endsOn,
    },
    signal,
  );
  const option = preview?.options.find(
    (candidate) => candidate.unitId === target.unitId,
  );
  return preview &&
    option &&
    option.blocker === null &&
    (option.takesBookings || option.current) &&
    preview.startsOn === bar.startsOn &&
    preview.endsOn === bar.endsOn &&
    preview.unitId === target.unitId &&
    target.startsOn >= preview.today &&
    option.nightlyRateMinor === preview.nightlyRateMinor &&
    option.rateCurrency === preview.rateCurrency
    ? {
        kind: "booking",
        preview,
        endsOn: target.endsOn,
        rateMinor: option.nightlyRateMinor,
        currency: option.rateCurrency,
      }
    : null;
}

function shortDay(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
    year: undefined,
  });
}

/**
 * A pulled end confirmed beside where it was let go (RC-S5-04): the new
 * departure, the nights it adds or takes and their price, and one press to
 * save it. Nothing is saved without that press.
 *
 * It asks the database the same preview the full dialog does and saves through
 * the same command with the version that preview named. Whenever the database
 * knows something the calendar did not — a booking in the way, a change made
 * elsewhere, another price — or the save is refused, it hands the drop to the
 * full dialog, which reads it again and says why; so does More….
 */
export function QuickConfirm({
  at,
  drop,
  locale,
  onClose,
  onFull,
  onSaved,
}: {
  /** Where the pointer let go, in the viewport. */
  at: { x: number; y: number };
  drop: PlainDrop;
  locale: SupportedLocale;
  onClose: () => void;
  /** Hands the drop to its full dialog; stable, as the preview reads on it. */
  onFull: (drop: PlainDrop) => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const rc = useTranslations("roomCalendar");
  const [ready, setReady] = useState<Ready | null>(null);
  const [saving, startSaving] = useTransition();
  // Save takes the focus once there is something to save, so Enter answers
  // the confirm and Escape keeps it as it was.
  const saveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) saveButton.current?.focus();
  }, [ready]);

  useEffect(() => {
    const controller = new AbortController();
    plainAnswer(drop, controller.signal)
      .then((answer) => (answer ? setReady(answer) : onFull(drop)))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("room_calendar.quick_confirm_preview_failed", {
          kind: drop.kind,
          error,
        });
        onFull(drop);
      });
    return () => controller.abort();
  }, [drop, onFull]);

  const { bar } = drop.entry;
  const guest = bar.guestName ?? rc("noGuestRecorded");
  const was = bar.endsOn;
  // A Guest moved into this room arrived before its bar begins.
  const arrivedOn = bar.kind === "stay" ? bar.arrivedOn : bar.startsOn;
  const title =
    drop.kind === "departure" ? t("changeDeparture") : rc("moveBooking");

  const effect = (() => {
    if (!ready || was === null) return null;
    const delta = daysBetween(was, ready.endsOn);
    if (delta < 0) return t("changeDepartureShorter", { count: -delta });
    if (ready.preview.stayType === "resident") {
      return t("changeDepartureLongerResident", { count: delta });
    }
    const rate =
      ready.kind === "departure"
        ? ready.preview.nightlyRateMinor
        : ready.rateMinor;
    const currency =
      ready.kind === "departure" ? ready.preview.rateCurrency : ready.currency;
    if (rate === null || currency === null) {
      return t("changeDepartureLongerUnpriced", { count: delta });
    }
    return t("changeDepartureLonger", {
      count: delta,
      price: formatMoney(rate, currency, locale),
    });
  })();

  function save() {
    if (!ready) return;
    const form = new FormData();
    form.set("locale", locale);
    form.set("version", String(ready.preview.version));
    form.set("endsOn", ready.endsOn);
    startSaving(async () => {
      let outcome: string;
      if (ready.kind === "departure") {
        form.set("stay", ready.preview.stayId);
        outcome = await changeDeparture("idle", form);
      } else {
        form.set("reservation", ready.preview.reservationId);
        form.set("unit", ready.preview.unitId);
        form.set("startsOn", ready.preview.startsOn);
        form.set("quotedRateMinor", ready.rateMinor?.toString() ?? "");
        form.set(
          "quotedCurrency",
          ready.rateMinor === null ? "" : (ready.currency ?? ""),
        );
        outcome = await changeBooking("idle", form);
      }
      if (outcome === "done") onSaved();
      else onFull(drop);
    });
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: at.x, top: at.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        aria-label={title}
        className="w-80 gap-3"
        data-quick-confirm={drop.kind}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="bottom"
      >
        <div className="grid gap-0.5">
          <p className="m-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          <p className="m-0 text-base font-semibold" dir="auto">
            {guest}
          </p>
        </div>
        {ready && was !== null ? (
          <div aria-live="polite" className="grid gap-0.5">
            <p className="m-0 tabular-nums">
              {rc("quickDeparture", {
                from: shortDay(was, locale),
                to: shortDay(ready.endsOn, locale),
                nights: t("stayNights", {
                  count: daysBetween(arrivedOn, ready.endsOn),
                }),
              })}
            </p>
            {effect ? (
              <p className="m-0 font-medium">
                <bdi>{effect}</bdi>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="m-0 text-muted-foreground" role="status">
            {t("changeBookingChecking")}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={saving}
            onClick={() => onFull(drop)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {rc("quickMore")}
          </Button>
          <Button
            disabled={saving}
            onClick={onClose}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("keepAsItWas")}
          </Button>
          <Button
            disabled={!ready || saving}
            onClick={save}
            ref={saveButton}
            size="sm"
            type="button"
          >
            {saving ? t("saving") : rc("quickSave")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
