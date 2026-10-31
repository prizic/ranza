"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import {
  Button,
  FormError,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ranza/ui";
import {
  changeCurfew,
  type AttendanceOutcome,
} from "../../../server/attendance";

/** `CURFEW_TIME` in `@ranza/attendance`, restated for the reason the dialogs here give: that entry point carries Prisma. */
const CURFEW_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The Property's curfew, said where the roll call is taken, and changed there
 * by whoever may configure the Property (LA-S2-06).
 *
 * `curfew` is the Property's own setting, or the application's default for a
 * dormitory (`isDefault`), or none. After the curfew a Resident not yet called
 * is missing; the line says which side of it the evening is on.
 */
export function CurfewControl({
  curfew,
  isDefault,
  locale,
  mayChange,
  passed,
  propertyId,
}: {
  curfew: string | null;
  isDefault: boolean;
  locale: string;
  mayChange: boolean;
  passed: boolean;
  propertyId: string;
}) {
  const t = useTranslations("attendance");
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(curfew ?? "23:00");
  const [problem, setProblem] = useState<AttendanceOutcome | "invalid" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function save(next: string | null) {
    if (next !== null && !CURFEW_TIME.test(next)) {
      setProblem("invalid");
      return;
    }
    startTransition(async () => {
      const outcome = await changeCurfew({ locale, propertyId, curfew: next });
      if (outcome === "done") {
        setProblem(null);
        setOpen(false);
      } else {
        setProblem(outcome);
      }
    });
  }

  const line = curfew
    ? [
        t("curfew", { time: curfew }),
        ...(isDefault ? [t("curfewDefault")] : []),
        ...(passed ? [t("curfewPassed")] : []),
      ].join(" · ")
    : t("curfewNone");

  const message =
    problem === "invalid"
      ? t("curfewInvalid")
      : problem === "refused"
        ? t("problem.refused")
        : problem
          ? t("problem.failed")
          : null;

  if (!mayChange) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock aria-hidden="true" className="size-4" />
        {line}
      </p>
    );
  }

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTime(curfew ?? "23:00");
          setProblem(null);
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          className="min-h-11 gap-2 sm:min-h-9"
          type="button"
          variant="ghost"
        >
          <Clock aria-hidden="true" />
          {line}
          <span className="sr-only"> · {t("curfewChange")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save(time);
          }}
        >
          <p className="font-medium">{t("curfewTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("curfewHint")}</p>
          <div className="grid gap-1.5">
            <Label htmlFor="curfew-time">{t("curfewLabel")}</Label>
            <Input
              id="curfew-time"
              onChange={(event) => setTime(event.target.value)}
              required
              type="time"
              value={time}
            />
          </div>
          {message ? <FormError>{message}</FormError> : null}
          <div className="flex items-center justify-between gap-2">
            <Button
              disabled={pending}
              onClick={() => save(null)}
              type="button"
              variant="ghost"
            >
              {t("curfewClear")}
            </Button>
            <Button disabled={pending} type="submit">
              {t("curfewSave")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
