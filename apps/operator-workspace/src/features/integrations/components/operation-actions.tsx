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
  Field,
  FormError,
  Textarea,
} from "@ranza/ui";
import {
  cancelOperationAction,
  resolveOperationAction,
  retryOperationAction,
  type IntegrationsOutcome,
} from "../../../server/integrations";
import type { OperationStatus } from "../../../server/viewer";
import { outcomeKey } from "../outcome-message";

type Closing = "cancel" | "resolve";

interface OperationActionsProps {
  locale: string;
  operationId: string;
  propertyId: string;
  status: OperationStatus;
}

async function attempt(
  command: () => Promise<IntegrationsOutcome>,
  event: string,
): Promise<IntegrationsOutcome> {
  try {
    return await command();
  } catch (error: unknown) {
    console.error(event, error);
    return { status: "error" };
  }
}

/**
 * What a person can do about one failure: send the delivery again now, stop
 * retrying it while it still is, or say it has been dealt with once it has
 * stopped. The last two ask for a reason, which is recorded with their name.
 */
export function OperationActions({
  locale,
  operationId,
  propertyId,
  status,
}: OperationActionsProps) {
  const t = useTranslations("integrations");
  const [closing, setClosing] = useState<Closing | null>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<IntegrationsOutcome>({
    status: "idle",
  });
  const [pending, startWorking] = useTransition();

  const failureKey = outcomeKey(outcome);

  function retry() {
    setOutcome({ status: "idle" });
    startWorking(async () => {
      setOutcome(
        await attempt(
          () => retryOperationAction(locale, propertyId, operationId),
          "integrations.retry_operation_unreachable",
        ),
      );
    });
  }

  function close() {
    if (closing === null) return;
    startWorking(async () => {
      const command =
        closing === "cancel" ? cancelOperationAction : resolveOperationAction;
      const result = await attempt(
        () => command(locale, propertyId, operationId, reason),
        `integrations.${closing}_operation_unreachable`,
      );
      if (result.status === "done") {
        setClosing(null);
        setReason("");
        return;
      }
      setOutcome(result);
    });
  }

  function open(next: Closing) {
    setOutcome({ status: "idle" });
    setReason("");
    setClosing(next);
  }

  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          disabled={pending}
          onClick={retry}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 ${pending && closing === null ? "animate-spin" : ""}`}
          />
          {pending && closing === null ? t("retrying") : t("retry")}
        </Button>
        {status === "retrying" ? (
          <Button
            disabled={pending}
            onClick={() => open("cancel")}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("cancelOperation")}
          </Button>
        ) : (
          <Button
            disabled={pending}
            onClick={() => open("resolve")}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("resolveOperation")}
          </Button>
        )}
      </div>
      {failureKey && closing === null ? (
        <FormError>{t(failureKey)}</FormError>
      ) : null}

      <Dialog
        onOpenChange={(next) => {
          if (!next) setClosing(null);
        }}
        open={closing !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {closing === "cancel" ? t("cancelTitle") : t("resolveTitle")}
            </DialogTitle>
            <DialogDescription>
              {closing === "cancel"
                ? t("cancelDescription")
                : t("resolveDescription")}
            </DialogDescription>
          </DialogHeader>
          <Field
            hint={t("reasonHint")}
            htmlFor={`reason-${operationId}`}
            label={t("reasonLabel")}
          >
            <Textarea
              aria-describedby={`reason-${operationId}-hint`}
              id={`reason-${operationId}`}
              onChange={(event) => {
                setReason(event.target.value);
                setOutcome({ status: "idle" });
              }}
              placeholder={t("reasonPlaceholder")}
              value={reason}
            />
          </Field>
          {failureKey ? <FormError>{t(failureKey)}</FormError> : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setClosing(null)}
              type="button"
              variant="outline"
            >
              {t("dismiss")}
            </Button>
            <Button disabled={pending} onClick={close} type="button">
              {closing === "cancel" ? t("cancelConfirm") : t("resolveConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
