"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Building2, CalendarClock, Lock } from "lucide-react";
import {
  formatCurrencyName,
  formatDate,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import {
  previewBusinessDate,
  saveProperty,
  type SettingsOutcome,
} from "../../../server/configuration";
import type { PropertySettings } from "../../../server/viewer";
import {
  currencyOptions,
  cutoffOptions,
  timezoneOptions,
  zoneCity,
} from "../options";
import { SaveBar } from "./save-bar";
import { SearchablePicker } from "./searchable-picker";
import { SettingsCard } from "./settings-card";

/**
 * A Property's four settings, as two cards: what it is called and trades in,
 * and which clock it runs on.
 *
 * They are one command in the database, so each card saves its own edits with
 * the saved values of the other — never the other card's unsaved draft, which
 * would ride along into a save its author never pressed. Every draft is
 * dropped the moment the save it belongs to ends, and the page's fresh read is
 * what the cards show next.
 */

interface IdentityDraft {
  name: string;
  currency: string;
}

interface ClockDraft {
  timezone: string;
  businessDateCutoff: string;
}

type Card = "identity" | "clock";

/** What the server holds, as far as this form knows, and at which version. */
interface Saved {
  name: string;
  currency: string;
  timezone: string;
  businessDateCutoff: string;
  version: string;
}

/**
 * The newer of what the page was read with and what this form last saved.
 * A save answers before the page's refresh lands, so for that moment the props
 * are older than the server: a second save built from them would name a
 * version that no longer exists, or — worse — send the other card's old values
 * under the new one and quietly undo the save before it. Versions are
 * fixed-width ISO text, so they compare as strings.
 */
function newest(settings: PropertySettings, local: Saved | null): Saved {
  if (local && local.version > settings.version) return local;
  return {
    name: settings.name,
    currency: settings.currency,
    timezone: settings.timezone,
    businessDateCutoff: settings.businessDateCutoff,
    version: settings.version,
  };
}

const IDLE: SettingsOutcome = { status: "idle" };

/** A saved draft, a stale one and a refusal that is not about a value all end the draft. */
function endsTheDraft(outcome: SettingsOutcome): boolean {
  return (
    outcome.status === "saved" ||
    outcome.status === "unchanged" ||
    outcome.status === "stale"
  );
}

export function PropertySettingsForm({
  locale,
  settings,
  timezones,
}: {
  locale: SupportedLocale;
  settings: PropertySettings;
  timezones: readonly string[];
}) {
  const t = useTranslations("configuration");
  const [identity, setIdentity] = useState<IdentityDraft | null>(null);
  const [clock, setClock] = useState<ClockDraft | null>(null);
  const [outcomes, setOutcomes] = useState<Record<Card, SettingsOutcome>>({
    identity: IDLE,
    clock: IDLE,
  });
  const [saving, setSaving] = useState<Card | null>(null);
  const [lastSaved, setLastSaved] = useState<Saved | null>(null);
  const [, startSaving] = useTransition();

  const nameRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const timezoneRef = useRef<HTMLButtonElement>(null);
  const cutoffRef = useRef<HTMLButtonElement>(null);

  const saved = newest(settings, lastSaved);
  // Once a Folio has fixed the currency, a draft of another one is not
  // something this form can save: it shows and sends the saved currency, and a
  // name edit in the same draft still saves on its own.
  const fixed = settings.currencyFixed;
  const shown = {
    name: identity?.name ?? saved.name,
    currency: fixed ? saved.currency : (identity?.currency ?? saved.currency),
    timezone: clock?.timezone ?? saved.timezone,
    businessDateCutoff: clock?.businessDateCutoff ?? saved.businessDateCutoff,
  };
  const identityDirty =
    identity !== null &&
    (shown.name !== saved.name || shown.currency !== saved.currency);
  const clockDirty =
    clock !== null &&
    (shown.timezone !== saved.timezone ||
      shown.businessDateCutoff !== saved.businessDateCutoff);
  const editable = settings.mayConfigure;

  function save(card: Card) {
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", settings.propertyId);
    // This card's edits, and the other card's saved values.
    const sent = {
      name: card === "identity" ? shown.name : saved.name,
      currency: card === "identity" ? shown.currency : saved.currency,
      timezone: card === "clock" ? shown.timezone : saved.timezone,
      businessDateCutoff:
        card === "clock" ? shown.businessDateCutoff : saved.businessDateCutoff,
    };
    form.set("version", saved.version);
    for (const [key, value] of Object.entries(sent)) form.set(key, value);

    setSaving(card);
    startSaving(async () => {
      const outcome = await saveProperty(IDLE, form);
      startSaving(() => {
        setSaving(null);
        setOutcomes((current) => ({ ...current, [card]: outcome }));
        if (outcome.status === "saved" && outcome.version) {
          setLastSaved({ ...sent, version: outcome.version });
        }
        if (endsTheDraft(outcome)) {
          if (card === "identity") setIdentity(null);
          else setClock(null);
        }
      });
      // A refusal points at a field, and that is where attention goes, so
      // focus goes there too (CF-S3-05).
      const fields = {
        name: nameRef,
        currency: currencyRef,
        timezone: timezoneRef,
        businessDateCutoff: cutoffRef,
      } as const;
      // A closed day is about the clock as a whole; point at the half that
      // changed, the time zone when it alone did.
      const field =
        outcome.status === "closedDay" &&
        sent.timezone !== saved.timezone &&
        sent.businessDateCutoff === saved.businessDateCutoff
          ? "timezone"
          : outcome.field;
      if (field && field in fields) {
        fields[field as keyof typeof fields].current?.focus();
      }
    });
  }

  const fieldError = (card: Card, field: string) =>
    outcomes[card].status === "invalid" && outcomes[card].field === field;

  const currencyLabel = (code: string) => {
    const name = formatCurrencyName(code, locale);
    return name ? `${name} (${code})` : code;
  };

  return (
    <>
      <SettingsCard
        footer={
          <SaveBar
            dirty={identityDirty}
            locked={saving !== null}
            mayChange={editable}
            onDiscard={() => setIdentity(null)}
            onSave={() => save("identity")}
            outcome={outcomes.identity}
            pending={saving === "identity"}
            readOnly={t("readOnly")}
          />
        }
        hint={t("propertyHint")}
        icon={Building2}
        id="property"
        title={t("propertyTitle")}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Field htmlFor="property-name" label={t("propertyName")}>
              <Input
                aria-describedby={
                  fieldError("identity", "name")
                    ? "property-name-error"
                    : undefined
                }
                aria-invalid={fieldError("identity", "name") || undefined}
                autoComplete="organization"
                disabled={!editable}
                id="property-name"
                maxLength={120}
                onChange={(event) =>
                  setIdentity({
                    name: event.target.value,
                    currency: shown.currency,
                  })
                }
                ref={nameRef}
                value={shown.name}
              />
            </Field>
            {fieldError("identity", "name") ? (
              <p
                className="text-step--1 text-destructive"
                id="property-name-error"
              >
                {t("invalidName")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Field htmlFor="property-currency" label={t("currency")}>
              <SearchablePicker
                buttonRef={currencyRef}
                disabled={!editable || settings.currencyFixed}
                empty={t("noCurrency")}
                id="property-currency"
                invalid={fieldError("identity", "currency")}
                onChange={(currency) =>
                  setIdentity({ name: shown.name, currency })
                }
                options={() => currencyOptions(locale)}
                search={t("searchCurrency")}
                selectedLabel={currencyLabel(shown.currency)}
                value={shown.currency}
              />
            </Field>
            {settings.currencyFixed ? (
              <p className="flex items-start gap-1.5 text-step--1 text-muted-foreground">
                <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {t("currencyFixed")}
              </p>
            ) : fieldError("identity", "currency") ? (
              <p className="text-step--1 text-destructive">
                {t("invalidCurrency")}
              </p>
            ) : null}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        footer={
          <SaveBar
            dirty={clockDirty}
            locked={saving !== null}
            mayChange={editable}
            onDiscard={() => setClock(null)}
            onSave={() => save("clock")}
            outcome={outcomes.clock}
            pending={saving === "clock"}
            readOnly={t("readOnly")}
          />
        }
        hint={t("timeHint")}
        icon={CalendarClock}
        id="time"
        title={t("timeTitle")}
      >
        <div className="grid gap-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Field htmlFor="property-timezone" label={t("timezone")}>
                <SearchablePicker
                  buttonRef={timezoneRef}
                  disabled={!editable}
                  empty={t("noTimezone")}
                  id="property-timezone"
                  invalid={fieldError("clock", "timezone")}
                  onChange={(timezone) =>
                    setClock({
                      timezone,
                      businessDateCutoff: shown.businessDateCutoff,
                    })
                  }
                  options={() =>
                    timezoneOptions(
                      timezones.includes(shown.timezone)
                        ? timezones
                        : [shown.timezone, ...timezones],
                      locale,
                    )
                  }
                  search={t("searchTimezone")}
                  selectedLabel={`${zoneCity(shown.timezone)} (${shown.timezone})`}
                  value={shown.timezone}
                />
              </Field>
              {fieldError("clock", "timezone") ? (
                <p className="text-step--1 text-destructive">
                  {t("invalidTimezone")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Field htmlFor="property-cutoff" label={t("cutoff")}>
                <Select
                  disabled={!editable}
                  onValueChange={(businessDateCutoff) =>
                    setClock({ timezone: shown.timezone, businessDateCutoff })
                  }
                  value={shown.businessDateCutoff}
                >
                  <SelectTrigger
                    aria-invalid={
                      fieldError("clock", "businessDateCutoff") || undefined
                    }
                    className="w-full tabular-nums"
                    id="property-cutoff"
                    ref={cutoffRef}
                  >
                    {/* Named here: a closed Select has no mounted item to
                        read its label from on first render. */}
                    <SelectValue>{shown.businessDateCutoff}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {cutoffOptions(saved.businessDateCutoff).map((time) => (
                      <SelectItem
                        className="tabular-nums"
                        key={time}
                        value={time}
                      >
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {fieldError("clock", "businessDateCutoff") ? (
                <p className="text-step--1 text-destructive">
                  {t("invalidCutoff")}
                </p>
              ) : null}
            </div>
          </div>

          <BusinessDate
            current={settings.businessDate}
            cutoff={shown.businessDateCutoff}
            changed={clockDirty}
            locale={locale}
            propertyId={settings.propertyId}
            timezone={shown.timezone}
          />
        </div>
      </SettingsCard>
    </>
  );
}

/**
 * The business date now and, while the clock is being changed, the one the
 * change would make — asked of the database, whose rule it is (CF-S1-10). A
 * move backwards is said in words, because a Guest checked in today would then
 * read as arriving tomorrow.
 */
function BusinessDate({
  changed,
  current,
  cutoff,
  locale,
  propertyId,
  timezone,
}: {
  changed: boolean;
  current: string;
  cutoff: string;
  locale: SupportedLocale;
  propertyId: string;
  timezone: string;
}) {
  const t = useTranslations("configuration");
  // The business date now comes back with the proposed one, from the same
  // statement: a page left open past the cutoff would otherwise compare a
  // fresh date with a stale one and claim a move that is not a move.
  const [preview, setPreview] = useState<{
    key: string;
    current: string | null;
    proposed: string | null;
  } | null>(null);
  const key = `${timezone}|${cutoff}`;

  useEffect(() => {
    if (!changed) return;
    let live = true;
    previewBusinessDate(propertyId, timezone, cutoff).then(
      (answer) => {
        // A slower answer to an earlier choice must not overwrite this one.
        if (live) {
          setPreview({
            key,
            current: answer?.current ?? null,
            proposed: answer?.proposed ?? null,
          });
        }
      },
      () => {
        if (live) setPreview({ key, current: null, proposed: null });
      },
    );
    return () => {
      live = false;
    };
  }, [changed, cutoff, key, propertyId, timezone]);

  const day = (value: string) =>
    formatDate(new Date(`${value}T00:00:00Z`), locale, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  const answered = changed && preview?.key === key ? preview : null;
  const proposed = answered?.proposed ?? null;
  const now = answered?.current ?? current;

  return (
    <div
      aria-live="polite"
      className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-2"
    >
      <div className="grid gap-0.5">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("businessDateNow")}
        </span>
        <span className="text-step-0 font-medium">{day(now)}</span>
      </div>
      {proposed ? (
        <div className="grid gap-0.5">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("businessDateAfter")}
          </span>
          <span className="text-step-0 font-medium">{day(proposed)}</span>
          {proposed !== now ? (
            <span
              className={
                proposed < now
                  ? "text-step--1 text-destructive"
                  : "text-step--1 text-muted-foreground"
              }
            >
              {proposed < now
                ? t("businessDateBack", { date: day(proposed) })
                : t("businessDateForward", { date: day(proposed) })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
