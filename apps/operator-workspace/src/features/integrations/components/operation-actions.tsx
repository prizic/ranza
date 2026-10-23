"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
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
  FormError,
  Textarea,
  dialogFrameClassName,
  textareaClassName,
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
  /** Whether there is a delivery to send again; a refused event has none. */
  retryable: boolean;
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
  retryable,
  status,
}: OperationActionsProps) {
  const t = useTranslations("integrations");
  const all = useTranslations();
  const [closing, setClosing] = useState<Closing | null>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<IntegrationsOutcome>({
    status: "idle",
  });
  const [pending, startWorking] = useTransition();

  const failureKey = outcomeKey(outcome);
  const reasonGiven = reason.trim().length >= 3;

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
    <div className="grid justify-items-start gap-1.5 sm:justify-items-end">
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {retryable ? (
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
        ) : null}
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
        <DialogContent className={dialogFrameClassName("medium")}>
          <DialogMasthead
            art="/illustrations/dialogs/webhook.svg"
            eyebrow={
              closing === "cancel" ? t("cancelTitle") : t("resolveTitle")
            }
            heading={t("operationHeading")}
          />
          <DialogBody>
            <DialogDescription className="m-0 py-5 text-sm">
              {closing === "cancel"
                ? t("cancelDescription")
                : t("resolveDescription")}
            </DialogDescription>
            <DialogSection
              hint={t("reasonHint")}
              labelFor={`reason-${operationId}`}
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("reasonLabel")}
            >
              <Textarea
                aria-describedby={`reason-${operationId}-hint`}
                className={textareaClassName}
                id={`reason-${operationId}`}
                onChange={(event) => {
                  setReason(event.target.value);
                  setOutcome({ status: "idle" });
                }}
                placeholder={t("reasonPlaceholder")}
                value={reason}
              />
            </DialogSection>
            {failureKey ? (
              <div aria-live="polite" className="py-5">
                <FormError>{t(failureKey)}</FormError>
              </div>
            ) : null}
          </DialogBody>
          <DialogActions
            hint={reasonGiven ? null : t("refused.reason_required")}
          >
            <CancelButton
              disabled={pending}
              onClick={() => setClosing(null)}
              type="button"
            >
              {t("dismiss")}
            </CancelButton>
            <ArrowButton
              disabled={pending || !reasonGiven}
              onClick={close}
              type="button"
            >
              {closing === "cancel" ? t("cancelConfirm") : t("resolveConfirm")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
