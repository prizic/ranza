"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BedDouble, Eye, ImageIcon, Palette, Upload } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  BrandMark,
  Button,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  Field,
  FormError,
  Input,
  PageHeader,
  brandVariables,
  dialogFrameClassName,
  useUnsavedChangesGuard,
} from "@ranza/ui";
import {
  assessBrandingColor,
  resetBranding,
  saveBranding,
  type BrandingOutcome,
} from "../../../server/branding";
import type { BrandSettings } from "../../../server/viewer";
import { SettingsCard } from "../../configuration/components/settings-card";
import {
  fileProblem,
  imageProblem,
  readImageSize,
  type ImageSize,
  type LogoLimits,
  type LogoProblem,
} from "../logo-check";

const IDLE: BrandingOutcome = { status: "idle" };
const ACCEPTED = "image/png,image/jpeg,image/webp";
/** The theme's own green (`--accent`), which a brand without a colour is drawn in. */
const THEME_GREEN = "#12544b";

/** A logo the person chose, and what was found out about it before any save. */
interface ChosenLogo {
  file: File;
  size: ImageSize | null;
  problem: LogoProblem | null;
}

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
  limits,
  locale,
  organizationId,
  organizationName,
  propertyId,
}: {
  brand: BrandSettings["brand"];
  /** The branding module's own limits for a logo, quoted back to the person. */
  limits: LogoLimits;
  locale: SupportedLocale;
  organizationId: string;
  organizationName: string;
  propertyId: string;
}) {
  const t = useTranslations("branding");
  const everywhere = useTranslations();
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const kilobytes = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    style: "unit",
    unit: "kilobyte",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const latestChoice = useRef(0);

  const savedColor = brand.primaryColor ?? "";
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ChosenLogo | null>(null);
  const [reading, setReading] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [outcome, setOutcome] = useState<BrandingOutcome>(IDLE);
  const [assessed, setAssessed] = useState<{
    candidate: string;
    answer: Assessment | "failed";
  } | null>(null);
  const [pending, startWorking] = useTransition();

  const typed = colorDraft ?? savedColor;
  const candidate = normalized(typed);
  const colorChanged = candidate !== savedColor;
  const file = chosen && chosen.problem === null ? chosen.file : null;
  const dirty = colorChanged || chosen !== null || removeLogo;
  useUnsavedChangesGuard(dirty && !pending, everywhere("unsavedChanges"));
  const isDefault = brand.primaryColor === null && brand.logo === null;

  // Debounced, and ignored once the colour has moved on: an answer for what
  // was typed a moment ago must not judge what is there now.
  useEffect(() => {
    if (candidate === "") return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const answer = await assessBrandingColor(candidate);
        if (current) setAssessed({ candidate, answer });
      } catch (error: unknown) {
        // Reported, and said on the screen: a colour that could not be judged
        // is not one that may be saved.
        console.error("branding.assess_failed", { candidate }, error);
        if (current) setAssessed({ candidate, answer: "failed" });
      }
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [candidate]);

  const judged =
    candidate !== "" && assessed?.candidate === candidate
      ? assessed.answer
      : null;
  const assessFailed = judged === "failed";
  const verdict = judged === "failed" ? null : judged;

  // The module still judges a logo on save; what is said here is the same
  // limits, read from it, so a file that cannot pass is known before the trip.
  const colorUsable = candidate === "" || verdict?.status === "ok";
  const logoBlocks = reading || (chosen !== null && chosen.problem !== null);
  const canSave = dirty && !pending && colorUsable && !logoBlocks;

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
      ? brandVariables({
          color: verdict.color,
          foreground: verdict.foreground,
          text: verdict.textColor,
        })
      : // The saved colour, until the server has judged what was typed: what is
        // there already needs no judging, and a preview that waited for it
        // would draw the default theme for a moment under a saved brand.
        candidate === savedColor &&
          brand.primaryColor &&
          brand.primaryForeground &&
          brand.primaryText
        ? brandVariables({
            color: brand.primaryColor,
            foreground: brand.primaryForeground,
            text: brand.primaryText,
          })
        : undefined;

  function clearDrafts() {
    latestChoice.current += 1;
    setColorDraft(null);
    setChosen(null);
    setReading(false);
    setRemoveLogo(false);
  }

  async function choose(next: File | null) {
    const choice = ++latestChoice.current;
    setRemoveLogo(false);
    setOutcome(IDLE);
    if (!next) {
      setChosen(null);
      setReading(false);
      return;
    }
    const early = fileProblem(next, limits);
    if (early) {
      setChosen({ file: next, size: null, problem: early });
      setReading(false);
      return;
    }
    setChosen(null);
    setReading(true);
    let size: ImageSize | null = null;
    try {
      size = await readImageSize(next);
    } catch (error: unknown) {
      console.error("branding.logo_read_failed", error);
    }
    if (choice !== latestChoice.current) return;
    setChosen({ file: next, size, problem: imageProblem(size, limits) });
    setReading(false);
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
    setConfirmingReset(false);
    startWorking(async () => {
      const answer = await resetBranding(IDLE, form());
      startWorking(() => {
        setOutcome(answer);
        if (answer.status === "reset") clearDrafts();
      });
    });
  }

  const ratio = (contrast: number) => numbers.format(contrast);
  const foregroundWord = (foreground: string) =>
    t(`foreground.${foreground === "#ffffff" ? "white" : "black"}`);
  const wellColor = verdict?.status === "ok" ? verdict.color : "var(--accent)";

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
                      verdict?.status === "invalid" || assessFailed
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
              {/* The well shows the theme's own green, dashed, while no colour
                  is set: a black swatch read as "black is chosen". The native
                  picker sits invisibly on top of it. */}
              <span
                className={`relative inline-flex h-9 w-12 rounded-md border focus-within:ring-3 focus-within:ring-ring/30 ${
                  candidate === "" ? "border-dashed" : ""
                }`}
                data-testid="brand-color-well"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-1 rounded-sm"
                  style={{ backgroundColor: wellColor }}
                />
                <input
                  aria-label={t("colorPicker")}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  onChange={(event) => setColorDraft(event.target.value)}
                  type="color"
                  value={
                    /^#[0-9a-f]{6}$/.test(candidate) ? candidate : THEME_GREEN
                  }
                />
              </span>
            </div>
            <div aria-live="polite" id="brand-color-verdict">
              {candidate === "" ? (
                <p className="text-step--1 text-muted-foreground">
                  {t("colorEmpty")}
                </p>
              ) : verdict?.status === "invalid" ? (
                <FormError>{t("colorInvalid")}</FormError>
              ) : assessFailed ? (
                <FormError>{t("error")}</FormError>
              ) : verdict?.status === "ok" ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-4">
                    <Swatch color={verdict.color} label={t("swatchFill")} />
                    <Swatch color={verdict.textColor} label={t("swatchText")} />
                  </div>
                  <p className="text-step--1 text-success">
                    {t("colorReadable", {
                      foreground: foregroundWord(verdict.foreground),
                    })}
                  </p>
                  <p className="text-step--1 text-muted-foreground">
                    {verdict.textColor === verdict.color
                      ? t("colorTextSame")
                      : t("colorTextDarker", { shade: verdict.textColor })}
                  </p>
                  <details className="text-step--1 text-muted-foreground">
                    <summary className="w-fit cursor-pointer hover:text-foreground">
                      {t("colorDetails")}
                    </summary>
                    <ul className="mt-1 grid gap-0.5 ps-4">
                      <li>
                        {t("colorDetailsFill", {
                          foreground: foregroundWord(verdict.foreground),
                          ratio: ratio(verdict.foregroundContrast),
                        })}
                      </li>
                      <li>
                        {t("colorDetailsText", {
                          ratio: ratio(verdict.textContrast),
                        })}
                      </li>
                    </ul>
                  </details>
                </div>
              ) : null}
            </div>
          </div>
        </SettingsCard>

        {/* Under the colour, not at the foot of the page: on a phone the result
            of typing a colour must be in view while it is typed. */}
        <SettingsCard
          hint={t("previewHint")}
          icon={Eye}
          id="preview"
          title={t("previewTitle")}
        >
          <div className="grid gap-3">
            <div
              className="overflow-hidden rounded-2xl border"
              data-testid="brand-preview"
              style={previewStyle}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)]">
                <div className="grid content-start gap-3 bg-frame p-3 text-on-frame max-sm:w-16 sm:w-36">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-primary-text">
                    <BrandMark className="size-5" />
                  </span>
                  <span className="flex items-center gap-2 rounded-xl bg-frame-active px-2.5 py-2 text-xs font-semibold">
                    <BedDouble aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate max-sm:sr-only">
                      {t("previewStay")}
                    </span>
                  </span>
                </div>
                <div className="grid min-w-0 content-start bg-background">
                  <div className="flex h-14 items-center gap-3 border-b px-4">
                    {previewLogo ? (
                      <img
                        alt=""
                        className="h-8 w-auto max-w-40 shrink-0 object-contain"
                        src={previewLogo}
                      />
                    ) : null}
                    <span className="truncate text-sm font-semibold tracking-tight">
                      {t("previewStay")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <Button tabIndex={-1} type="button">
                      {t("previewButton")}
                    </Button>
                    <span className="text-primary-text underline underline-offset-4">
                      {t("previewLink")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-step--1 text-muted-foreground">
              {t("previewWhere")}
            </p>
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
            <div className="flex flex-wrap items-center gap-3">
              <input
                accept={ACCEPTED}
                aria-label={t("logoLabel")}
                className="peer sr-only"
                id="brand-logo"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  // Emptied, so choosing the same file again after discarding
                  // it is a change the browser reports.
                  event.target.value = "";
                  void choose(next);
                }}
                ref={inputRef}
                type="file"
              />
              <Button
                asChild
                className="peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30"
                variant="outline"
              >
                <label className="cursor-pointer" htmlFor="brand-logo">
                  <Upload aria-hidden="true" />
                  {chosen || brand.logo ? t("logoChange") : t("logoChoose")}
                </label>
              </Button>
              {brand.logo && !chosen ? (
                <Button
                  onClick={() => setRemoveLogo((removing) => !removing)}
                  type="button"
                  variant="outline"
                >
                  {removeLogo ? t("logoKeep") : t("logoRemove")}
                </Button>
              ) : null}
              {chosen ? (
                <span
                  className="min-w-0 text-step--1 break-words text-muted-foreground"
                  data-testid="logo-facts"
                >
                  {chosen.size
                    ? t("logoFacts", {
                        height: chosen.size.height,
                        name: chosen.file.name,
                        size: kilobytes.format(
                          Math.max(1, Math.round(chosen.file.size / 1024)),
                        ),
                        width: chosen.size.width,
                      })
                    : chosen.file.name}
                </span>
              ) : brand.logo ? null : (
                <span className="text-step--1 text-muted-foreground">
                  {t("logoNoFile")}
                </span>
              )}
            </div>
            <div aria-live="polite">
              {reading ? (
                <p className="text-step--1 text-muted-foreground">
                  {t("logoReading")}
                </p>
              ) : chosen?.problem ? (
                <FormError>
                  {chosenProblemText(chosen, limits, kilobytes, t)}
                </FormError>
              ) : chosen ? (
                <p className="text-step--1 text-success">{t("logoUsable")}</p>
              ) : null}
            </div>
            {removeLogo ? (
              <p className="text-step--1 text-muted-foreground">
                {t("logoWillBeRemoved")}
              </p>
            ) : null}
            {outcome.status === "invalid" &&
            outcome.rejection.field === "logo" ? (
              <FormError>
                {t(`logoErrors.${outcome.rejection.reason}`)}
              </FormError>
            ) : null}
          </div>
        </SettingsCard>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-6 py-4">
          <div aria-live="polite" className="min-h-5 text-step--1">
            {pending ? (
              <span className="text-muted-foreground">{t("saving")}</span>
            ) : logoBlocks && dirty && !reading ? (
              <span className="text-muted-foreground">
                {t("logoBlocksSave")}
              </span>
            ) : (
              <OutcomeLine dirty={dirty} outcome={outcome} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || isDefault}
              onClick={() => setConfirmingReset(true)}
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
        </div>
      </div>

      <Dialog onOpenChange={setConfirmingReset} open={confirmingReset}>
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/reverse.svg"
            eyebrow={t("reset")}
            heading={t("resetTitle")}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {t("resetConsequence")}
            </DialogDescription>
            <ul className="m-0 grid list-none gap-2 p-0 text-sm">
              {brand.logo ? <li>{t("resetLogoLine")}</li> : null}
              {brand.primaryColor ? (
                <li>{t("resetColorLine", { color: brand.primaryColor })}</li>
              ) : null}
              {dirty ? <li>{t("resetDraftLine")}</li> : null}
            </ul>
          </DialogBody>
          <DialogActions>
            <CancelButton
              onClick={() => setConfirmingReset(false)}
              type="button"
            >
              {t("resetKeep")}
            </CancelButton>
            <ArrowButton onClick={reset} type="button">
              {t("resetConfirm")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Why the chosen file cannot be used, with the numbers that broke the rule. */
function chosenProblemText(
  chosen: ChosenLogo,
  limits: LogoLimits,
  kilobytes: Intl.NumberFormat,
  t: ReturnType<typeof useTranslations<"branding">>,
): string {
  const problem = chosen.problem;
  if (problem === "too_large") {
    return t("logoChosenErrors.too_large", {
      maximum: kilobytes.format(limits.maxBytes / 1024),
      size: kilobytes.format(Math.round(chosen.file.size / 1024)),
    });
  }
  if (problem === "too_small" && chosen.size) {
    return t("logoChosenErrors.too_small", {
      height: chosen.size.height,
      minimum: limits.minHeight,
    });
  }
  if (problem === "dimensions_too_large" && chosen.size) {
    return t("logoChosenErrors.dimensions_too_large", {
      height: chosen.size.height,
      maximum: limits.maxDimension,
      width: chosen.size.width,
    });
  }
  return t(`logoErrors.${problem ?? "corrupt"}`);
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
      return <FormError>{t("colorInvalid")}</FormError>;
    case "idle":
      return null;
  }
}

/** A colour as it is drawn, named, with its value for somebody who wants to copy it. */
function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-step--1">
      <span
        aria-hidden="true"
        className="size-6 rounded-md border"
        style={{ backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
      <bdi className="font-mono">{color}</bdi>
    </span>
  );
}
