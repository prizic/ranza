"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { MovePreview } from "@ranza/reservations";
import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Fact,
  FactList,
  Field,
  FormError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@ranza/ui";
import { moveGuest, type MoveGuestOutcome } from "../../../server/front-office";
import { usePickerLabels } from "../../../lib/picker-labels";
import { submitWithoutReset } from "../../../lib/submit-without-reset";
import { unitLabel } from "../unit-label";

/**
 * Moving an in-house Guest to another Unit from tonight (amend-booking slice 3,
 * ADR 0039). The Stay, its Folio and its price go with them.
 *
 * The picker lists every Unit the Guest could go to, each with what would
 * refuse the move — booked, somebody in it, not ready — read fresh when the
 * dialog opens; the room is still the command's to decide on save. A reason
 * is required, and "other" needs a note (AB-S3-02).
 *
 * The version is pinned to what the dialog last read, as in Change booking: a
 * later read naming another version says somebody changed the Stay, and the
 * choice is cleared rather than saved over it (AB-S3-09).
 *
 * `REASONS` and `NOTE` restate `MOVE_REASONS` and `CHANGE_NOTE` for the reason
 * `end-booking-dialog.tsx` gives: a value import from the module pulls Prisma
 * into the browser bundle.
 */
const REASONS = ["fault", "upgrade", "guest_request", "other"] as const;
const NOTE = { min: 3, max: 500 };

export interface MovableStay {
  stayId: string;
  guestName: string;
  unitLabel: string;
}

type PreviewAnswer =
  { kind: "preview"; preview: MovePreview } | { kind: "refused" };

type Read =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "refused" }
  | { state: "ready"; preview: MovePreview };

async function fetchPreview(
  stayId: string,
  signal: AbortSignal,
): Promise<PreviewAnswer> {
  const response = await fetch(
    `/api/front-office/move-preview?${new URLSearchParams({ stay: stayId })}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) {
    throw Object.assign(new Error("the move could not be previewed"), {
      status: response.status,
    });
  }
  return (await response.json()) as PreviewAnswer;
}

export function MoveGuestDialog({
  locale,
  onDone,
  onOpenChange,
  open,
  stay,
}: {
  locale: SupportedLocale;
  /** Told after a move is saved, for a screen that keeps its own data. */
  onDone?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  stay: MovableStay;
}) {
  const t = useTranslations();
  const unitLabels = usePickerLabels(t("chooseUnit"));
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [read, setRead] = useState<Read>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const pinnedRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [movedUnderneath, setMovedUnderneath] = useState(false);
  const [outcome, act, pending] = useActionState<MoveGuestOutcome, FormData>(
    async (previous, form) => {
      setMovedUnderneath(false);
      const result = await moveGuest(previous, form);
      if (
        result === "changed" ||
        result === "notReady" ||
        result === "occupied" ||
        result === "unavailable" ||
        result === "notInService"
      ) {
        setGeneration((n) => n + 1);
      }
      return result;
    },
    "idle",
  );

  useEffect(() => {
    if (outcome !== "done") return;
    onDone?.();
    onOpenChange(false);
  }, [outcome, onDone, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setRead({ state: "loading" });
    fetchPreview(stay.stayId, controller.signal)
      .then((answer) => {
        if (answer.kind !== "preview") {
          setRead({ state: answer.kind });
          return;
        }
        const fresh = answer.preview;
        if (pinnedRef.current !== null && fresh.version !== pinnedRef.current) {
          // Somebody moved or changed this Stay since it was read: the choice
          // made against the old one is cleared, not saved over it.
          setMovedUnderneath(true);
          setUnitId("");
        }
        pinnedRef.current = fresh.version;
        setPinned(fresh.version);
        setRead({ state: "ready", preview: fresh });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("guest_move.preview_failed", {
          stayId: stay.stayId,
          error,
        });
        setRead({ state: "failed" });
      });
    return () => controller.abort();
  }, [open, stay.stayId, generation]);

  const preview = read.state === "ready" ? read.preview : null;
  const chosen = preview?.options.find((option) => option.unitId === unitId);
  const noteLength = [...note.trim()].length;
  const noteMissing = reason === "other" && noteLength === 0;

  const blocked =
    chosen?.blocker === "booked"
      ? t("changeBookingBlockedBooked", {
          reference: chosen.conflictReference ?? "",
        })
      : chosen?.blocker === "occupied"
        ? t("changeBookingBlockedOccupied")
        : chosen && !chosen.ready
          ? t("moveGuestNotReady")
          : null;

  const price =
    preview === null
      ? null
      : preview.nightlyRateMinor === null || preview.rateCurrency === null
        ? t("moveGuestUnpriced")
        : t("moveGuestPriceKept", {
            price: formatMoney(
              preview.nightlyRateMinor,
              preview.rateCurrency,
              locale,
            ),
          });

  const readMessage =
    read.state === "failed"
      ? t("changeBookingLoadFailed")
      : read.state === "refused"
        ? t("moveGuestRefused")
        : null;

  const outcomeMessage =
    outcome === "changed" || movedUnderneath
      ? t("changeBookingChanged")
      : outcome === "notReady"
        ? t("moveGuestNotReady")
        : outcome === "occupied"
          ? t("bookingOverOccupant")
          : outcome === "unavailable"
            ? t("bookingUnavailable")
            : outcome === "notInService"
              ? t("changeBookingNotInService")
              : outcome === "invalidNote"
                ? t("changeBookingNoteInvalid")
                : outcome === "refused"
                  ? t("moveGuestRefused")
                  : null;

  const canSave =
    preview !== null &&
    pinned !== null &&
    chosen !== undefined &&
    chosen.blocker === null &&
    chosen.ready &&
    reason !== "" &&
    !noteMissing;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form className="grid gap-4" onSubmit={submitWithoutReset(act)}>
          <DialogHeader>
            <DialogTitle>{t("moveGuest")}</DialogTitle>
            <DialogDescription>{t("moveGuestSummary")}</DialogDescription>
          </DialogHeader>

          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{stay.guestName}</bdi>
            </Fact>
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{stay.unitLabel}</bdi>
            </Fact>
          </FactList>

          <input name="stay" type="hidden" value={stay.stayId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="version" type="hidden" value={pinned ?? ""} />

          <Field htmlFor={`move-unit-${stay.stayId}`} label={t("unit")}>
            <Combobox
              disabled={preview === null}
              id={`move-unit-${stay.stayId}`}
              labels={unitLabels}
              name="unit"
              onValueChange={setUnitId}
              options={(preview?.options ?? []).map((option) => ({
                value: option.unitId,
                label: unitLabel(option.roomName, option.unitName),
                description: [
                  t(`unitType.${option.unitType}`),
                  option.blocker === "booked"
                    ? t("changeBookingUnitBooked", {
                        reference: option.conflictReference ?? "",
                      })
                    : option.blocker === "occupied"
                      ? t("changeBookingUnitOccupied")
                      : !option.ready
                        ? t("moveGuestUnitNotReady")
                        : t("changeBookingUnitFree"),
                ].join(" · "),
              }))}
              required
              value={unitId}
            />
          </Field>

          <Field
            htmlFor={`move-reason-${stay.stayId}`}
            label={t("moveGuestReason")}
          >
            <Select
              name="reason"
              onValueChange={setReason}
              required
              value={reason}
            >
              <SelectTrigger
                className="w-full"
                id={`move-reason-${stay.stayId}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`moveReason.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-1.5">
            <Field
              htmlFor={`move-note-${stay.stayId}`}
              label={t("changeBookingNote")}
            >
              <Textarea
                id={`move-note-${stay.stayId}`}
                maxLength={NOTE.max}
                minLength={NOTE.min}
                name="note"
                onChange={(event) => setNote(event.target.value)}
                required={reason === "other"}
                rows={2}
                value={note}
              />
            </Field>
            <p className="text-step--1 text-muted-foreground">
              {noteMissing
                ? t("moveGuestNoteRequired")
                : t("changeBookingNoteHint")}
            </p>
          </div>

          <div aria-live="polite" className="grid gap-2">
            {read.state === "loading" ? (
              <p className="text-step--1 text-muted-foreground">
                {t("changeBookingChecking")}
              </p>
            ) : null}
            {readMessage ? <FormError>{readMessage}</FormError> : null}
            {blocked ? <FormError>{blocked}</FormError> : null}
            {price && !blocked && !readMessage ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-step--1">
                <bdi>{price}</bdi>
              </p>
            ) : null}
          </div>

          {outcomeMessage ? (
            <div aria-live="polite">
              <FormError>{outcomeMessage}</FormError>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepAsItWas")}
              </Button>
            </DialogClose>
            <Button disabled={pending || !canSave} type="submit">
              {pending ? t("saving") : t("moveGuest")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
