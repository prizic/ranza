"use client";

import { useState, useTransition } from "react";
import { Send, Trash2 } from "lucide-react";
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("removeDescription", { name: endpointName })}
            </DialogDescription>
          </DialogHeader>
          {failureKey ? <FormError>{t(failureKey)}</FormError> : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setRemoving(false)}
              type="button"
              variant="outline"
            >
              {t("dismiss")}
            </Button>
            <Button
              disabled={pending}
              onClick={remove}
              type="button"
              variant="destructive"
            >
              {pending ? t("removing") : t("removeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
