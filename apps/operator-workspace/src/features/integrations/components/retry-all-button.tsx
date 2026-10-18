"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormError,
} from "@ranza/ui";
import {
  retryAllOperationsAction,
  type IntegrationsOutcome,
} from "../../../server/integrations";
import { outcomeKey } from "../outcome-message";

interface RetryAllButtonProps {
  locale: string;
  propertyId: string;
}

/**
 * Sends every stopped delivery at the Property again, after saying what that
 * does: they are tried now, the ones that fail again follow the usual schedule,
 * and the ones that cannot be sent again are left as they are.
 */
export function RetryAllButton({ locale, propertyId }: RetryAllButtonProps) {
  const t = useTranslations("integrations");
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<IntegrationsOutcome>({
    status: "idle",
  });
  const [pending, startWorking] = useTransition();
  const failureKey = outcomeKey(outcome);

  function confirm() {
    startWorking(async () => {
      let result: IntegrationsOutcome;
      try {
        result = await retryAllOperationsAction(locale, propertyId);
      } catch (error: unknown) {
        console.error("integrations.retry_all_operations_unreachable", error);
        result = { status: "error" };
      }
      setOutcome(result);
      if (result.status === "retried") setOpen(false);
    });
  }

  return (
    <>
      <Button
        data-testid="retry-all"
        onClick={() => {
          setOutcome({ status: "idle" });
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        {t("retryAll")}
      </Button>
      {outcome.status === "retried" ? (
        <p className="w-full text-step--1 text-muted-foreground" role="status">
          {t("retriedAll", { count: outcome.count })}
        </p>
      ) : null}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("retryAllTitle")}</DialogTitle>
            <DialogDescription>{t("retryAllDescription")}</DialogDescription>
          </DialogHeader>
          {failureKey ? <FormError>{t(failureKey)}</FormError> : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("dismiss")}
            </Button>
            <Button disabled={pending} onClick={confirm} type="button">
              {pending ? t("retrying") : t("retryAllConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
