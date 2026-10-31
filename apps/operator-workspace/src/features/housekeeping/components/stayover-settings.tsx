"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import type {
  StayoverCadence,
  StayoverSettings as Settings,
} from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Card,
  FormError,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useUnsavedChangesGuard,
} from "@ranza/ui";
import {
  setStayover,
  type StayoverOutcome,
} from "../../../server/housekeeping";
import { WRAPPING_TRIGGER } from "../../configuration/options";
import { kindOf, weekdayName, type StayoverKind } from "../stayover";
import { cadenceLabel } from "./cadence";

interface Draft {
  kind: StayoverKind;
  everyDays: number;
  weekday: number;
}

/**
 * What the module accepts, handed in by the page: the module is reached from
 * the server only, so its limits cross as props and cannot drift from it.
 */
export interface StayoverLimits {
  everyDays: { min: number; max: number };
  weekdays: readonly number[];
}

function sameCadence(
  a: StayoverCadence | null,
  b: StayoverCadence | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "every_n_days" && b.kind === "every_n_days") {
    return a.everyDays === b.everyDays;
  }
  if (a.kind === "weekly" && b.kind === "weekly") {
    return a.weekday === b.weekday;
  }
  return true;
}

/** What the three controls hold for a cadence, with a starting point for the ones it does not use. */
function draftOf(
  own: StayoverCadence | null,
  fallback: StayoverCadence,
): Draft {
  const source = own ?? fallback;
  return {
    kind: kindOf(own),
    everyDays: source.kind === "every_n_days" ? source.everyDays : 1,
    weekday: source.kind === "weekly" ? source.weekday : 1,
  };
}

function cadenceOf(draft: Draft): StayoverCadence | null {
  if (draft.kind === "default") return null;
  if (draft.kind === "none") return { kind: "none" };
  if (draft.kind === "every_n_days") {
    return { kind: "every_n_days", everyDays: draft.everyDays };
  }
  return { kind: "weekly", weekday: draft.weekday };
}

/**
 * How often a room somebody is staying in is cleaned (RANZ-83, ADR 0063): never,
 * every day or every few days, or one weekday a week. A Property that says
 * nothing follows the default for its operating model, and the choice shows what
 * that default is so "follow it" is never a leap in the dark.
 *
 * Nothing is written until a Save is pressed (CONFIG-02). A reader who may not
 * configure sees what applies and the permission that would let them change it.
 * `embedded` is for a screen that draws its own card around it (Configuration).
 */
export function StayoverSettings({
  embedded = false,
  fallback,
  limits,
  locale,
  propertyId,
  settings,
}: {
  embedded?: boolean;
  /** What applies when the Property has no schedule of its own. */
  fallback: StayoverCadence;
  limits: StayoverLimits;
  locale: SupportedLocale;
  propertyId: string;
  settings: Settings;
}) {
  const t = useTranslations("housekeeping");
  const configuration = useTranslations("configuration");
  const permissions = useTranslations("staff.permissions");
  const everywhere = useTranslations();
  const [outcome, dispatch, pending] = useActionState<
    StayoverOutcome,
    FormData
  >(setStayover, { status: "idle" });

  const intervals = Array.from(
    { length: limits.everyDays.max - limits.everyDays.min + 1 },
    (_, index) => limits.everyDays.min + index,
  );
  const saved = draftOf(settings.own, fallback);
  const [draft, setDraft] = useState<Draft | null>(null);
  const shown = draft ?? saved;

  // The page's fresh read replaces any draft: what was saved is what the next
  // edit is measured against.
  const savedKey = JSON.stringify(settings.own);
  useEffect(() => {
    setDraft(null);
  }, [savedKey]);

  const changed =
    draft !== null && !sameCadence(cadenceOf(draft), settings.own);
  useUnsavedChangesGuard(changed && !pending, everywhere("unsavedChanges"));

  function edit(patch: Partial<Draft>) {
    setDraft({ ...shown, ...patch });
  }

  function save() {
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", propertyId);
    form.set("kind", shown.kind);
    form.set("everyDays", String(shown.everyDays));
    form.set("weekday", String(shown.weekday));
    startTransition(() => dispatch(form));
  }

  const kindLabel = (kind: StayoverKind): string =>
    kind === "default"
      ? t("stayoverKindDefault", { value: cadenceLabel(t, locale, fallback) })
      : kind === "none"
        ? t("stayoverKindNone")
        : kind === "every_n_days"
          ? t("stayoverKindInterval")
          : t("stayoverKindWeekly");

  const applies = cadenceOf(shown) ?? fallback;

  const body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="stayover-kind">{t("stayoverSchedule")}</Label>
          <Select
            disabled={!settings.mayConfigure || pending}
            onValueChange={(value) => edit({ kind: value as StayoverKind })}
            value={shown.kind}
          >
            <SelectTrigger className={WRAPPING_TRIGGER} id="stayover-kind">
              <SelectValue>{kindLabel(shown.kind)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["default", "none", "every_n_days", "weekly"] as const).map(
                (kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kindLabel(kind)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {shown.kind === "every_n_days" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="stayover-every">{t("stayoverEvery")}</Label>
            <Select
              disabled={!settings.mayConfigure || pending}
              onValueChange={(value) => edit({ everyDays: Number(value) })}
              value={String(shown.everyDays)}
            >
              <SelectTrigger className={WRAPPING_TRIGGER} id="stayover-every">
                <SelectValue>
                  {t("cadenceEvery", { count: shown.everyDays })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {intervals.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {t("cadenceEvery", { count: days })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {shown.kind === "weekly" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="stayover-weekday">{t("stayoverOn")}</Label>
            <Select
              disabled={!settings.mayConfigure || pending}
              onValueChange={(value) => edit({ weekday: Number(value) })}
              value={String(shown.weekday)}
            >
              <SelectTrigger className={WRAPPING_TRIGGER} id="stayover-weekday">
                <SelectValue>{weekdayName(shown.weekday, locale)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {limits.weekdays.map((weekday) => (
                  <SelectItem key={weekday} value={String(weekday)}>
                    {weekdayName(weekday, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <p className="text-step--1 text-muted-foreground" data-testid="applies">
        {t("stayoverApplies", { schedule: cadenceLabel(t, locale, applies) })}
      </p>

      {settings.mayConfigure ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button disabled={!changed || pending} onClick={save} type="button">
            {configuration("saveForProperty")}
          </Button>
          {changed ? (
            <Button
              disabled={pending}
              onClick={() => setDraft(null)}
              type="button"
              variant="ghost"
            >
              {configuration("discardChanges")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ReadOnlyReason>
          {configuration("readOnly", {
            permission: permissions("configureAccommodation"),
          })}
        </ReadOnlyReason>
      )}

      <div aria-live="polite" className="min-h-5">
        {pending ? (
          <p className="text-step--1 text-muted-foreground">{t("saving")}</p>
        ) : outcome.status === "done" && !changed ? (
          <p className="text-step--1 text-success">{t("saved")}</p>
        ) : outcome.status === "refused" || outcome.status === "invalid" ? (
          <FormError>{t("settingRefused")}</FormError>
        ) : null}
      </div>
    </>
  );

  if (embedded) return <div className="grid gap-5">{body}</div>;

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1">
        <h2 className="text-step-0 font-semibold">
          {t("stayoverSettingsTitle")}
        </h2>
        <p className="max-w-prose text-step--1 text-muted-foreground">
          {t("stayoverSettingsHint")}
        </p>
      </div>
      {body}
    </Card>
  );
}

function ReadOnlyReason({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-step--1 text-muted-foreground">
      <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}
