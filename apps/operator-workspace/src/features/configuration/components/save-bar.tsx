"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button, FormError } from "@ranza/ui";
import type { SettingsOutcome } from "../../../server/configuration";

/**
 * The foot of a settings card: Save and Discard, enabled only by a change
 * (CF-S3-04), and what happened to the last save, said where a screen reader
 * hears it.
 *
 * A reader without the permission gets one line saying who can change these
 * instead of two buttons that do nothing (CF-S3-01).
 */
export function SaveBar({
  dirty,
  locked = false,
  mayChange,
  onDiscard,
  onSave,
  outcome,
  pending,
  readOnly,
}: {
  dirty: boolean;
  /**
   * Another save of the same record is under way. Both name the version the
   * page was read at, so the second would come back stale and lose its draft.
   */
  locked?: boolean;
  mayChange: boolean;
  onDiscard: () => void;
  onSave: () => void;
  outcome: SettingsOutcome;
  pending: boolean;
  /** Why this reader cannot change it. */
  readOnly: string;
}) {
  const t = useTranslations("configuration");

  if (!mayChange) {
    return (
      <p className="flex items-center gap-2 text-step--1 text-muted-foreground">
        <Lock aria-hidden="true" className="size-3.5" />
        {readOnly}
      </p>
    );
  }

  return (
    <>
      <div aria-live="polite" className="min-h-5 text-step--1">
        {pending ? (
          <span className="text-muted-foreground">{t("saving")}</span>
        ) : (
          <OutcomeMessage dirty={dirty} outcome={outcome} />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!dirty || pending || locked}
          onClick={onDiscard}
          type="button"
          variant="ghost"
        >
          {t("discard")}
        </Button>
        <Button
          disabled={!dirty || pending || locked}
          onClick={onSave}
          type="button"
        >
          {t("save")}
        </Button>
      </div>
    </>
  );
}

/**
 * A refusal stays until it is acted on, because the form still holds what was
 * refused. "Saved" goes as soon as there is a new change, which it no longer
 * describes.
 */
function OutcomeMessage({
  dirty,
  outcome,
}: {
  dirty: boolean;
  outcome: SettingsOutcome;
}) {
  const t = useTranslations("configuration");
  switch (outcome.status) {
    case "saved":
      return dirty ? null : <span className="text-success">{t("saved")}</span>;
    case "unchanged":
      return dirty ? null : (
        <span className="text-muted-foreground">{t("unchanged")}</span>
      );
    case "stale":
      return <FormError>{t("stale")}</FormError>;
    case "refused":
      return <FormError>{t("refused")}</FormError>;
    case "closedDay":
      return <FormError>{t("closedDay")}</FormError>;
    case "currencyFixed":
      return <FormError>{t("currencyFixedRefused")}</FormError>;
    case "invalid":
      return <FormError>{t("invalid")}</FormError>;
    case "idle":
      return null;
  }
}
