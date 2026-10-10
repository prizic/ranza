"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@ranza/ui";
import { terminateEmployeeAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

interface TerminateEmployeeDialogProps {
  employeeId: string;
  employeeName: string;
  hiredOn: Date;
  locale: SupportedLocale;
  propertyId: string;
  /** The Property's own calendar date, `YYYY-MM-DD`: the default last day. */
  today: string;
}

/**
 * Ends employment, and says plainly that it does not end access to the system:
 * the two are separate acts on separate screens (HR-S1-01), and a manager who
 * assumed one did the other would leave a former employee signed in.
 */
export function TerminateEmployeeDialog({
  employeeId,
  employeeName,
  hiredOn,
  locale,
  propertyId,
  today,
}: TerminateEmployeeDialogProps) {
  const t = useTranslations("hr.employees");
  const outcomeText = useOutcomeText();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastDay, setLastDay] = useState(today);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const outcome = await terminateEmployeeAction(
        locale,
        propertyId,
        employeeId,
        lastDay,
      );
      if (outcome.status === "done") {
        setOpen(false);
      } else {
        setErrorMessage(outcomeText(outcome));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isPending) return;
        setOpen(isOpen);
        if (!isOpen) {
          setLastDay(today);
          setErrorMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${t("terminate")}: ${employeeName}`}
          className="h-8 px-2 text-step--1 text-muted-foreground hover:text-destructive"
        >
          {t("terminate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={confirm}>
          <DialogHeader>
            <DialogTitle>
              {t("terminateTitle", { name: employeeName })}
            </DialogTitle>
            <DialogDescription>{t("terminateDescription")}</DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium"
            >
              {errorMessage}
            </div>
          )}

          <div className="space-y-1.5 py-4">
            <Label htmlFor={`terminated-on-${employeeId}`}>
              {t("terminateDate")}
            </Label>
            <Input
              id={`terminated-on-${employeeId}`}
              type="date"
              required
              min={new Date(hiredOn).toISOString().slice(0, 10)}
              value={lastDay}
              onChange={(e) => setLastDay(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? t("terminating") : t("terminateConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
