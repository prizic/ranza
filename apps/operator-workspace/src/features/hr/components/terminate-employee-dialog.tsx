"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  DialogTrigger,
  FormError,
  Input,
  dialogFrameClassName,
  fieldClassName,
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
  const all = useTranslations();
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
      <DialogContent className={dialogFrameClassName("small")}>
        <form className="grid" onSubmit={confirm}>
          <DialogMasthead
            art="/illustrations/dialogs/remove-access.svg"
            eyebrow={t("terminate")}
            heading={employeeName}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {t("terminateDescription")}{" "}
              <Link
                className="font-medium text-primary-text underline underline-offset-4"
                href={localizeHref(locale, `people?property=${propertyId}`)}
              >
                {t("terminatePeople")}
              </Link>
            </DialogDescription>

            <DialogSection
              labelFor={`terminated-on-${employeeId}`}
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("terminateDate")}
            >
              <Input
                className={fieldClassName}
                id={`terminated-on-${employeeId}`}
                max={today}
                min={new Date(hiredOn).toISOString().slice(0, 10)}
                onChange={(e) => setLastDay(e.target.value)}
                required
                type="date"
                value={lastDay}
              />
            </DialogSection>

            {errorMessage ? (
              <div aria-live="polite">
                <FormError>{errorMessage}</FormError>
              </div>
            ) : null}
          </DialogBody>

          <DialogActions>
            <CancelButton
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
            >
              {t("cancel")}
            </CancelButton>
            <ArrowButton
              disabled={isPending || lastDay === ""}
              tone="danger"
              type="submit"
            >
              {isPending ? t("terminating") : t("terminateConfirm")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
