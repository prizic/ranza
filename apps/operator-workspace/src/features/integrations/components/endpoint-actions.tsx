"use client";

import { useState, useTransition } from "react";
import { Send, Trash2 } from "lucide-react";
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
  FormError,
  dialogFrameClassName,
} from "@ranza/ui";
import {
  removeEndpointAction,
  sendTestEventAction,
  type IntegrationsOutcome,
} from "../../../server/integrations";
import { outcomeKey } from "../outcome-message";

interface EndpointActionsProps {
  endpointId: string;
  endpointName: string;
  locale: string;
  propertyId: string;
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

/** Send a test event, and remove, for one endpoint. */
export function EndpointActions({
  endpointId,
  endpointName,
  locale,
  propertyId,
}: EndpointActionsProps) {
  const t = useTranslations("integrations");
  const [outcome, setOutcome] = useState<IntegrationsOutcome>({
    status: "idle",
  });
  const [removing, setRemoving] = useState(false);
  const [pending, startWorking] = useTransition();

  const failureKey = outcomeKey(outcome);

  function sendTest() {
    setOutcome({ status: "idle" });
    startWorking(async () => {
      setOutcome(
        await attempt(
          () => sendTestEventAction(locale, propertyId, endpointId),
          "integrations.send_test_event_unreachable",
        ),
      );
    });
  }

  function remove() {
    startWorking(async () => {
      const result = await attempt(
        () => removeEndpointAction(locale, propertyId, endpointId),
        "integrations.remove_endpoint_unreachable",
      );
      if (result.status === "done") {
        setRemoving(false);
        return;
      }
      setOutcome(result);
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={pending}
          onClick={sendTest}
          size="sm"
          type="button"
          variant="outline"
        >
          <Send aria-hidden="true" className="size-3.5" />
          {pending && !removing ? t("sendingTest") : t("sendTest")}
        </Button>
        <Button
          disabled={pending}
          onClick={() => {
            setOutcome({ status: "idle" });
            setRemoving(true);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          {t("remove")}
        </Button>
      </div>
      {outcome.status === "done" ? (
        <p className="text-step--1 text-muted-foreground" role="status">
          {t("testQueued")}
        </p>
      ) : null}
      {failureKey && !removing ? <FormError>{t(failureKey)}</FormError> : null}

      <Dialog onOpenChange={setRemoving} open={removing}>
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/webhook.svg"
            eyebrow={t("removeTitle")}
            heading={endpointName}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {t("removeDescription", { name: endpointName })}
            </DialogDescription>
            {failureKey ? <FormError>{t(failureKey)}</FormError> : null}
          </DialogBody>
          <DialogActions>
            <CancelButton
              disabled={pending}
              onClick={() => setRemoving(false)}
              type="button"
            >
              {t("dismiss")}
            </CancelButton>
            <ArrowButton
              disabled={pending}
              onClick={remove}
              tone="danger"
              type="button"
            >
              {pending ? t("removing") : t("removeConfirm")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
