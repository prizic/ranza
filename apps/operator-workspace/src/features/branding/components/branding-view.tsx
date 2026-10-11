"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, ImageIcon, Palette } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import {
  BrandMark,
  Button,
  Field,
  FormError,
  Input,
  PageHeader,
  brandVariables,
} from "@ranza/ui";
import {
  assessBrandingColor,
  resetBranding,
  saveBranding,
  type BrandingOutcome,
} from "../../../server/branding";
import type { BrandSettings } from "../../../server/viewer";
import { SettingsCard } from "../../configuration/components/settings-card";

const IDLE: BrandingOutcome = { status: "idle" };
const LOGO_MAX_BYTES = 512 * 1024;
const ACCEPTED = "image/png,image/jpeg,image/webp";

/** `#` is optional while typing; the stored form always has it. */
function normalized(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed.startsWith("#")) return trimmed;
  return `#${trimmed}`;
}

type Assessment = Awaited<ReturnType<typeof assessBrandingColor>>;

/**
 * The Branding screen (blueprint 8, ADR 0046): the colour and the logo the
 * Guest Portal is drawn in, with a preview of the Portal's header and controls
 * that follows what is typed.
 *
 * Whether a colour is usable is the module's rule, asked of the server as it is
 * typed rather than restated here. Saving is the policies' call; a reader who
 * may not change it is told who can, and shown nothing to press.
 */
export function BrandingView({
  brand,
  locale,
  organizationId,
  organizationName,
  propertyId,
}: {
  brand: BrandSettings["brand"];
  locale: SupportedLocale;
  organizationId: string;
  organizationName: string;
  propertyId: string;
}) {
  const t = useTranslations("branding");
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  const savedColor = brand.primaryColor ?? "";
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [outcome, setOutcome] = useState<BrandingOutcome>(IDLE);
  const [assessed, setAssessed] = useState<{
    candidate: string;
    answer: Assessment;
  } | null>(null);
  const [pending, startWorking] = useTransition();

  const typed = colorDraft ?? savedColor;
  const candidate = normalized(typed);
  const colorChanged = candidate !== savedColor;
  const logoChanged = file !== null || removeLogo;
  const dirty = colorChanged || logoChanged;
  const isDefault = brand.primaryColor === null && brand.logo === null;

  // Debounced, and ignored once the colour has moved on: an answer for what
  // was typed a moment ago must not judge what is there now.
  useEffect(() => {
    if (candidate === "") return;
    let current = true;
    const timer = setTimeout(async () => {
      const answer = await assessBrandingColor(candidate);
      if (current) setAssessed({ candidate, answer });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [candidate]);

  const verdict =
    candidate !== "" && assessed?.candidate === candidate
      ? assessed.answer
      : null;

  const fileTooLarge = file !== null && file.size > LOGO_MAX_BYTES;
  const colorUsable = candidate === "" || verdict?.status === "ok";
  const canSave = dirty && !pending && colorUsable && !fileTooLarge;

  const chosenLogo = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (chosenLogo) URL.revokeObjectURL(chosenLogo);
    },
    [chosenLogo],
  );
  const savedLogo = brand.logo
    ? `/api/branding/${organizationId}/logo?v=${brand.logo.hash}`
    : null;
  const previewLogo = chosenLogo ?? (removeLogo ? null : savedLogo);

  const previewStyle =
    verdict?.status === "ok"
      ? brandVariables({ color: verdict.color, foreground: verdict.foreground })
      : candidate === "" && brand.primaryColor && brand.primaryForeground
        ? brandVariables({
            color: brand.primaryColor,
            foreground: brand.primaryForeground,
          })
        : undefined;

  function clearDrafts() {
    setColorDraft(null);
    setFile(null);
    setRemoveLogo(false);
  }

  function discard() {
    clearDrafts();
    setOutcome(IDLE);
  }

  function form(): FormData {
    const data = new FormData();
    data.set("locale", locale);
    data.set("propertyId", propertyId);
    return data;
  }

  function save() {
    const data = form();
    if (colorChanged) data.set("color", candidate);
    if (file) data.set("logo", file);
    else if (removeLogo) data.set("logoAction", "remove");
    startWorking(async () => {
      const answer = await saveBranding(IDLE, data);
      startWorking(() => {
        setOutcome(answer);
        if (answer.status === "saved") clearDrafts();
      });
    });
  }

  function reset() {
    startWorking(async () => {
      const answer = await resetBranding(IDLE, form());
      startWorking(() => {
        setOutcome(answer);
        if (answer.status === "reset") clearDrafts();
      });
    });
  }

  const ratio = (contrast: number) => numbers.format(contrast);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader>
        <h2 className="text-step-2 font-semibold tracking-tight">
          {t("subtitle", { organization: organizationName })}
        </h2>
      </PageHeader>

      <div className="grid min-w-0 gap-6">
        <SettingsCard
          hint={t("colorHint")}
          icon={Palette}
          id="color"
          title={t("colorTitle")}
        >
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Field htmlFor="brand-color" label={t("colorLabel")}>
                  <Input
                    aria-describedby="brand-color-verdict"
                    aria-invalid={
                      verdict !== null && verdict.status !== "ok"
                        ? true
                        : undefined
                    }
                    autoComplete="off"
                    className="w-40 font-mono"
                    dir="ltr"
                    id="brand-color"
                    maxLength={7}
                    onChange={(event) => setColorDraft(event.target.value)}
                    placeholder="#0f5132"
                    spellCheck={false}
                    value={typed}
                  />
                </Field>
              </div>
              <input
                aria-label={t("colorPicker")}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                onChange={(event) => setColorDraft(event.target.value)}
                type="color"
                value={/^#[0-9a-f]{6}$/.test(candidate) ? candidate : "#000000"}
              />
            </div>
            <div aria-live="polite" id="brand-color-verdict">
              {candidate === "" ? (
                <p className="text-step--1 text-muted-foreground">
                  {t("colorEmpty")}
                </p>
              ) : verdict?.status === "invalid" ? (
                <FormError>{t("colorInvalid")}</FormError>
              ) : verdict?.status === "unreadable" ? (
                <FormError>
                  {t("colorUnreadable", { ratio: ratio(verdict.contrast) })}
                </FormError>
              ) : verdict?.status === "ok" ? (
                <p className="text-step--1 text-success">
                  {t("colorReadable", {
                    foreground: t(
                      `foreground.${verdict.foreground === "#ffffff" ? "white" : "black"}`,
                    ),
                    ratio: ratio(verdict.contrast),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          hint={t("logoHint")}
          icon={ImageIcon}
          id="logo"
          title={t("logoTitle")}
        >
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {previewLogo ? (
                <img
                  alt={t("logoCurrent")}
                  className="h-16 w-auto max-w-56 rounded-lg border bg-white object-contain p-2"
                  src={previewLogo}
                />
              ) : (
                <p className="text-step--1 text-muted-foreground">
                  {t("logoNone")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field htmlFor="brand-logo" label={t("logoLabel")}>
                <Input
                  accept={ACCEPTED}
                  id="brand-logo"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setRemoveLogo(false);
                  }}
                  type="file"
                />
              </Field>
              {brand.logo && !file ? (
                <Button
                  onClick={() => setRemoveLogo((removing) => !removing)}
                  type="button"
                  variant="outline"
                >
                  {removeLogo ? t("logoKeep") : t("logoRemove")}
                </Button>
              ) : null}
            </div>
            {removeLogo ? (
              <p className="text-step--1 text-muted-foreground">
                {t("logoWillBeRemoved")}
              </p>
            ) : null}
            {fileTooLarge ? (
              <FormError>{t("logoErrors.too_large")}</FormError>
            ) : null}
            {outcome.status === "invalid" &&
            outcome.rejection.field === "logo" ? (
              <FormError>
                {t(`logoErrors.${outcome.rejection.reason}`)}
              </FormError>
            ) : null}
          </div>
        </SettingsCard>

        <SettingsCard
          footer={
            <>
              <div aria-live="polite" className="min-h-5 text-step--1">
                {pending ? (
                  <span className="text-muted-foreground">{t("saving")}</span>
                ) : (
                  <OutcomeLine dirty={dirty} outcome={outcome} />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending || (isDefault && !dirty)}
                  onClick={reset}
                  type="button"
                  variant="outline"
                >
                  {t("reset")}
                </Button>
                <Button
                  disabled={!dirty || pending}
                  onClick={discard}
                  type="button"
                  variant="ghost"
                >
                  {t("discard")}
                </Button>
                <Button disabled={!canSave} onClick={save} type="button">
                  {t("save")}
                </Button>
              </div>
            </>
          }
          hint={t("previewHint")}
          icon={Eye}
          id="preview"
          title={t("previewTitle")}
        >
          <div
            className="grid gap-4"
            data-testid="brand-preview"
            style={previewStyle}
          >
            <div className="flex h-16 items-center gap-3 rounded-2xl border bg-card px-4">
              {previewLogo ? (
                <img
                  alt=""
                  className="h-8 w-auto max-w-40 shrink-0 object-contain"
                  src={previewLogo}
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BrandMark className="size-5" />
                </span>
              )}
              <span className="truncate text-sm font-semibold tracking-tight">
                {t("previewHeader")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button tabIndex={-1} type="button">
                {t("previewButton")}
              </Button>
              <span className="text-primary underline underline-offset-4">
                {t("previewLink")}
              </span>
              <span className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                {t("previewActive")}
              </span>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

/**
 * What the last save or reset came to. A refusal stays until it is acted on,
 * because the form still holds what was refused; "saved" goes with the next
 * change, which it no longer describes.
 */
function OutcomeLine({
  dirty,
  outcome,
}: {
  dirty: boolean;
  outcome: BrandingOutcome;
}) {
  const t = useTranslations("branding");
  switch (outcome.status) {
    case "saved":
      return dirty ? null : <span className="text-success">{t("saved")}</span>;
    case "reset":
      return <span className="text-success">{t("resetDone")}</span>;
    case "refused":
      return <FormError>{t("refused")}</FormError>;
    case "error":
      return <FormError>{t("error")}</FormError>;
    case "invalid":
      if (outcome.rejection.field === "logo") return null;
      return outcome.rejection.reason === "unreadable" ? (
        <FormError>{t("colorUnreadable", { ratio: "4.5" })}</FormError>
      ) : (
        <FormError>{t("colorInvalid")}</FormError>
      );
    case "idle":
      return null;
  }
}
