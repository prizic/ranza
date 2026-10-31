"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowButton,
  CancelButton,
  Combobox,
  DateRangeField,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  FormError,
  Textarea,
  dialogFrameClassName,
  textareaClassName,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { RollCallRow } from "@ranza/attendance";
import { usePickerLabels } from "../../../lib/picker-labels";
import { giveLeave, type AttendanceOutcome } from "../../../server/attendance";
import { placeOf } from "./roll-call-row";

/** `LEAVE_REASON` and `LEAVE_NIGHTS_MAX` in `@ranza/attendance`, restated: that entry point carries Prisma. */
const REASON = { min: 2, max: 300 };
const NIGHTS_MAX = 365;

const DAY = 86_400_000;

function nightsIn(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
    ) + 1
  );
}

/**
 * Give a Resident leave (LA-S2-07, LA-S2-08).
 *
 * Opened from a row it already knows who, and opens on tonight alone, which is
 * the common case, so the usual leave is a reason and one press. Opened from
 * the toolbar it asks who first. The nights are the first and last night away:
 * the same two ends a booking's dates are, picked the same way.
 *
 * The form lives inside the dialog's content, which is unmounted when it
 * closes, so every opening starts clean and a refusal from the last try is
 * never shown before the next.
 */
export function GiveLeaveDialog({
  locale,
  night,
  onOpenChange,
  open,
  rows,
  stayId,
}: {
  locale: SupportedLocale;
  night: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rows: readonly RollCallRow[];
  /** The Resident the dialog was opened on, or null to ask. */
  stayId: string | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={dialogFrameClassName("small")}>
        <GiveLeaveForm
          locale={locale}
          night={night}
          onDone={() => onOpenChange(false)}
          rows={rows}
          stayId={stayId}
        />
      </DialogContent>
    </Dialog>
  );
}

function GiveLeaveForm({
  locale,
  night,
  onDone,
  rows,
  stayId: initialStayId,
}: {
  locale: SupportedLocale;
  night: string;
  onDone: () => void;
  rows: readonly RollCallRow[];
  stayId: string | null;
}) {
  const t = useTranslations("attendance");
  const common = useTranslations();
  const pickerLabels = usePickerLabels(t("leaveWhoPlaceholder"));
  const [stayId, setStayId] = useState(initialStayId ?? "");
  const [range, setRange] = useState({ from: night, to: night });
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<AttendanceOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = rows.find((row) => row.stayId === stayId);
  const reasonLength = [...reason.trim()].length;
  const reasonShort = reasonLength < REASON.min;
  const nights = nightsIn(range.from, range.to);
  const ready =
    chosen !== undefined && !reasonShort && nights >= 1 && nights <= NIGHTS_MAX;

  function submit() {
    if (!ready) return;
    startTransition(async () => {
      const outcome = await giveLeave({
        locale,
        stayId,
        fromNight: range.from,
        toNight: range.to,
        reason: reason.trim(),
      });
      if (outcome === "done") onDone();
      else setProblem(outcome);
    });
  }

  const message =
    problem === "overlaps"
      ? t("problem.overlaps")
      : problem === "invalidNights"
        ? t("problem.invalidNights")
        : problem === "refused"
          ? t("problem.refused")
          : problem
            ? t("problem.failed")
            : null;

  return (
    <form
      className="grid"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogMasthead
        art="/illustrations/dialogs/leave.svg"
        eyebrow={t("leaveDialogEyebrow")}
        facts={chosen ? placeOf(chosen) : undefined}
        heading={chosen?.residentName ?? t("leaveWho")}
      />
      <DialogBody>
        <DialogDescription className="sr-only">
          {t("leaveNightsHint")}
        </DialogDescription>

        {initialStayId === null ? (
          <DialogSection
            hint={t("leaveWhoHint")}
            labelFor="leave-who"
            tag={{ label: common("dialogTagRequired"), required: true }}
            title={t("leaveWho")}
          >
            <Combobox
              id="leave-who"
              labels={pickerLabels}
              onValueChange={setStayId}
              options={rows.map((row) => ({
                value: row.stayId,
                label: row.residentName ?? placeOf(row),
                description: placeOf(row),
                keywords: [row.roomName, row.bedName ?? ""],
              }))}
              value={stayId}
            />
          </DialogSection>
        ) : null}

        <DialogSection
          hint={t("leaveNightsHint")}
          labelFor="leave-nights"
          tag={{ label: common("dialogTagRequired"), required: true }}
          title={t("leaveNights")}
        >
          <DateRangeField
            defaultValue={range}
            id="leave-nights"
            labels={{
              from: t("leaveFirst"),
              to: t("leaveLast"),
              emptyFrom: t("leaveEmptyFrom"),
              emptyTo: t("leaveEmptyTo"),
              pickFrom: t("leavePickFrom"),
              pickTo: t("leavePickTo"),
              clear: common("dateRangeClear"),
              done: common("dateRangeDone"),
              span: (days) => t("leaveNightsCount", { count: days + 1 }),
            }}
            locale={locale}
            maxSpan={NIGHTS_MAX - 1}
            names={{ from: "fromNight", to: "toNight" }}
            onChange={(chosenRange) => {
              if (chosenRange.from && chosenRange.to) {
                setRange({ from: chosenRange.from, to: chosenRange.to });
              }
            }}
            required
            requiredTo
            today={night}
          />
        </DialogSection>

        <DialogSection
          hint={t("leaveReasonHint")}
          labelFor="leave-reason"
          tag={{ label: common("dialogTagRequired"), required: true }}
          title={t("leaveReason")}
        >
          <Textarea
            aria-describedby="leave-reason-hint"
            autoFocus={initialStayId !== null}
            className={textareaClassName}
            id="leave-reason"
            maxLength={REASON.max}
            minLength={REASON.min}
            onChange={(event) => {
              setReason(event.target.value);
              setProblem(null);
            }}
            placeholder={t("leaveReasonExample")}
            required
            rows={3}
            value={reason}
          />
        </DialogSection>

        {message ? (
          <div className="pb-5">
            <FormError>{message}</FormError>
          </div>
        ) : null}
      </DialogBody>

      <DialogActions
        hint={reasonShort && chosen ? common("dialogHintReason") : null}
      >
        <DialogClose asChild>
          <CancelButton type="button">{common("notNow")}</CancelButton>
        </DialogClose>
        <ArrowButton disabled={!ready || pending} type="submit">
          {pending ? t("leaveSubmitting") : t("leaveSubmit")}
        </ArrowButton>
      </DialogActions>
    </form>
  );
}
