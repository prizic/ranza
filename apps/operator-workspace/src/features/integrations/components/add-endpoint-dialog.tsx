"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FormError,
  Input,
} from "@ranza/ui";
import {
  registerEndpointAction,
  type IntegrationsOutcome,
} from "../../../server/integrations";
import { outcomeKey } from "../outcome-message";
import { eventKey, WEBHOOK_EVENT_TYPES } from "../types";

interface AddEndpointDialogProps {
  locale: string;
  propertyId: string;
}

/**
 * Registers an endpoint, and shows its signing secret once.
 *
 * Once is literal: the secret is held in this component's state from the moment
 * the server returns it until the person says they have saved it, and nothing
 * else on the page can show it again. While it is on screen the dialog cannot
 * be dismissed by an outside click or Escape, because a stray click would lose
 * the only copy there is.
 */
export function AddEndpointDialog({
  locale,
  propertyId,
}: AddEndpointDialogProps) {
  const t = useTranslations("integrations");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState<readonly string[]>([]);
  const [outcome, setOutcome] = useState<IntegrationsOutcome>({
    status: "idle",
  });
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startWorking] = useTransition();

  function reset() {
    setName("");
    setUrl("");
    setEventTypes([]);
    setOutcome({ status: "idle" });
    setSecret(null);
    setCopied(false);
  }

  function toggle(eventType: string, checked: boolean) {
    setOutcome({ status: "idle" });
    setEventTypes((current) =>
      checked
        ? [...current, eventType]
        : current.filter((existing) => existing !== eventType),
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startWorking(async () => {
      let result: IntegrationsOutcome;
      try {
        result = await registerEndpointAction(locale, propertyId, {
          name,
          url,
          eventTypes,
        });
      } catch (error: unknown) {
        console.error("integrations.register_endpoint_unreachable", error);
        result = { status: "error" };
      }
      if (result.status === "registered") {
        setSecret(result.secret);
        setOutcome({ status: "done" });
        return;
      }
      setOutcome(result);
    });
  }

  async function copy() {
    if (secret === null) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch (error: unknown) {
      console.error("integrations.copy_secret_failed", error);
    }
  }

  const failureKey = outcomeKey(outcome);
  const showingSecret = secret !== null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && showingSecret) return;
        setOpen(next);
        if (!next) reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Plus aria-hidden="true" className="size-4" />
          {t("addEndpoint")}
        </Button>
      </DialogTrigger>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (showingSecret) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (showingSecret) event.preventDefault();
        }}
        showCloseButton={!showingSecret}
      >
        {showingSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("secretTitle")}</DialogTitle>
              <DialogDescription>{t("secretWarning")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <code
                className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-step--1 break-all select-all"
                data-testid="webhook-secret"
                dir="ltr"
              >
                {secret}
              </code>
              <div>
                <Button
                  onClick={copy}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {copied ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <Copy aria-hidden="true" className="size-4" />
                  )}
                  {copied ? t("secretCopied") : t("secretCopy")}
                </Button>
              </div>
              <p className="text-step--1 text-muted-foreground">
                {t("secretUse")}
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                type="button"
              >
                {t("secretDone")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form className="grid gap-5" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t("addTitle")}</DialogTitle>
              <DialogDescription>{t("addDescription")}</DialogDescription>
            </DialogHeader>
            <Field htmlFor="endpoint-name" label={t("nameLabel")}>
              <Input
                autoComplete="off"
                id="endpoint-name"
                onChange={(event) => {
                  setName(event.target.value);
                  setOutcome({ status: "idle" });
                }}
                placeholder={t("namePlaceholder")}
                required
                value={name}
              />
            </Field>
            <Field
              hint={t("urlHint")}
              htmlFor="endpoint-url"
              label={t("urlLabel")}
            >
              <Input
                aria-describedby="endpoint-url-hint"
                autoComplete="off"
                dir="ltr"
                id="endpoint-url"
                inputMode="url"
                onChange={(event) => {
                  setUrl(event.target.value);
                  setOutcome({ status: "idle" });
                }}
                placeholder={t("urlPlaceholder")}
                required
                type="url"
                value={url}
              />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-step--1 font-medium">
                {t("eventsLabel")}
              </legend>
              {WEBHOOK_EVENT_TYPES.map((eventType) => (
                <label
                  className="flex items-center gap-2.5 text-step--1"
                  key={eventType}
                >
                  <Checkbox
                    checked={eventTypes.includes(eventType)}
                    name="event"
                    onCheckedChange={(checked) =>
                      toggle(eventType, checked === true)
                    }
                    value={eventType}
                  />
                  {t(`events.${eventKey(eventType)}`)}
                </label>
              ))}
            </fieldset>
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
              <Button disabled={pending} type="submit">
                {pending ? t("registering") : t("register")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
