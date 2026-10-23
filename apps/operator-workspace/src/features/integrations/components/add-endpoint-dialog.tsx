"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Plus } from "lucide-react";
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
  DialogTrigger,
  FormError,
  Input,
  TickRow,
  dialogFrameClassName,
  fieldClassName,
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
  const all = useTranslations();
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
  const ready =
    name.trim() !== "" && url.trim() !== "" && eventTypes.length > 0;

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
        className={dialogFrameClassName("medium")}
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
            <DialogMasthead
              art="/illustrations/dialogs/webhook.svg"
              eyebrow={t("secretTitle")}
              heading={name}
            />
            <DialogBody simple>
              <DialogDescription className="m-0 text-sm">
                {t("secretWarning")}
              </DialogDescription>
              <code
                className="rounded-2xl border-[1.5px] border-foreground/25 bg-muted px-4 py-3 font-mono text-step--1 break-all select-all"
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
              <p className="m-0 text-sm text-muted-foreground">
                {t("secretUse")}
              </p>
            </DialogBody>
            <DialogActions>
              <ArrowButton
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                type="button"
              >
                {t("secretDone")}
              </ArrowButton>
            </DialogActions>
          </>
        ) : (
          <form className="grid" onSubmit={submit}>
            <DialogMasthead
              art="/illustrations/dialogs/webhook.svg"
              eyebrow={t("addTitle")}
              heading={t("endpointHeading")}
              large
            />
            <DialogBody>
              <DialogDescription className="sr-only">
                {t("addDescription")}
              </DialogDescription>
              <DialogSection
                labelFor="endpoint-name"
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("nameLabel")}
              >
                <Input
                  autoComplete="off"
                  className={fieldClassName}
                  id="endpoint-name"
                  onChange={(event) => {
                    setName(event.target.value);
                    setOutcome({ status: "idle" });
                  }}
                  placeholder={t("namePlaceholder")}
                  required
                  value={name}
                />
              </DialogSection>
              <DialogSection
                hint={t("urlHint")}
                labelFor="endpoint-url"
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("urlLabel")}
              >
                <Input
                  aria-describedby="endpoint-url-hint"
                  autoComplete="off"
                  className={fieldClassName}
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
              </DialogSection>
              <DialogSection
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("eventsLabel")}
              >
                <div className="grid gap-2">
                  {WEBHOOK_EVENT_TYPES.map((eventType) => (
                    <TickRow
                      checked={eventTypes.includes(eventType)}
                      id={`endpoint-event-${eventType}`}
                      key={eventType}
                      name="event"
                      onCheckedChange={(checked) => toggle(eventType, checked)}
                      value={eventType}
                    >
                      {t(`events.${eventKey(eventType)}`)}
                    </TickRow>
                  ))}
                </div>
              </DialogSection>
              {failureKey ? (
                <div aria-live="polite" className="py-5">
                  <FormError>{t(failureKey)}</FormError>
                </div>
              ) : null}
            </DialogBody>
            <DialogActions hint={ready ? null : t("endpointHintMissing")}>
              <CancelButton
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
              >
                {t("dismiss")}
              </CancelButton>
              <ArrowButton disabled={pending || !ready} type="submit">
                {pending ? t("registering") : t("register")}
              </ArrowButton>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
