"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Banknote, TriangleAlert } from "lucide-react";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { PriceList, PricedUnitType } from "@ranza/rates";
import { FormError, Input, Label } from "@ranza/ui";
import { toMinorUnits, toTypedAmount } from "../../../lib/amount";
import { savePrices, type PricesOutcome } from "../../../server/rates";
import { SaveBar } from "./save-bar";
import { SettingsCard } from "./settings-card";

const IDLE: PricesOutcome = { status: "idle" };

/** What each field holds, as typed. Only fields somebody touched are in it. */
type Draft = Partial<Record<PricedUnitType, string>>;

/**
 * A Property's nightly prices, one per kind of Unit (ADR 0038).
 *
 * Typed as a person writes an amount and converted to minor units here, by the
 * same rule every other money field uses, so the server receives whole numbers
 * and nothing is rounded on the way. A blank field clears that type's price.
 * The list saves as one: the version names the list as read, and a save after
 * somebody else's comes back stale rather than undoing theirs.
 *
 * A reader without `rates.manage` sees every price and changes none (RT-S1-15).
 */
export function RatesCard({
  locale,
  priceList,
}: {
  locale: SupportedLocale;
  priceList: PriceList;
}) {
  const t = useTranslations("rates");
  const unitTypes = useTranslations("unitType");
  const [draft, setDraft] = useState<Draft>({});
  const [outcome, setOutcome] = useState<PricesOutcome>(IDLE);
  const [pending, startSaving] = useTransition();
  const fields = useRef<Partial<Record<PricedUnitType, HTMLInputElement>>>({});

  const { currency } = priceList;
  const saved = (unitType: PricedUnitType): string => {
    const entry = priceList.entries.find((e) => e.unitType === unitType);
    return entry?.amountMinor == null || entry.currency === null
      ? ""
      : toTypedAmount(entry.amountMinor, entry.currency);
  };
  const shown = (unitType: PricedUnitType) =>
    draft[unitType] ?? saved(unitType);
  // A touched stale price is a change even at the same amount: saving it is
  // what restates it in the Property's currency.
  const dirty = priceList.entries.some((entry) => {
    const typed = draft[entry.unitType];
    return (
      typed !== undefined &&
      (typed.trim() !== saved(entry.unitType) || entry.stale)
    );
  });
  const unreadable = priceList.entries.find((entry) => {
    const typed = draft[entry.unitType]?.trim();
    return typed !== undefined && typed !== "" && !isPrice(typed, currency);
  });

  function save() {
    if (unreadable) {
      setOutcome({ status: "invalid", unitType: unreadable.unitType });
      fields.current[unreadable.unitType]?.focus();
      return;
    }
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", priceList.propertyId);
    form.set("version", priceList.version);
    // Only the types somebody touched: an untouched stale price stays as it is,
    // visibly stale, rather than being restated by a save about another type.
    for (const [unitType, typed] of Object.entries(draft)) {
      const value = typed.trim();
      form.set(
        unitType,
        value === "" ? "" : String(toMinorUnits(value, currency)),
      );
    }
    startSaving(async () => {
      const result = await savePrices(IDLE, form);
      startSaving(() => {
        setOutcome(result);
        if (
          result.status === "saved" ||
          result.status === "unchanged" ||
          result.status === "stale"
        ) {
          setDraft({});
        }
      });
      if (result.status === "invalid" && result.unitType) {
        fields.current[result.unitType]?.focus();
      }
    });
  }

  return (
    <SettingsCard
      footer={
        <SaveBar
          dirty={dirty}
          mayChange={priceList.mayManage}
          onDiscard={() => {
            setDraft({});
            setOutcome(IDLE);
          }}
          onSave={save}
          outcome={
            outcome.status === "invalid"
              ? { status: "invalid", field: null }
              : { status: outcome.status }
          }
          pending={pending}
          readOnly={t("readOnly")}
        />
      }
      hint={t("hint")}
      icon={Banknote}
      id="rates"
      title={t("title")}
    >
      <ul className="grid gap-5">
        {priceList.entries.map((entry) => {
          const id = `rate-${entry.unitType}`;
          const type = unitTypes(entry.unitType);
          const refused =
            outcome.status === "invalid" && outcome.unitType === entry.unitType;
          return (
            <li
              className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-start sm:gap-6"
              key={entry.unitType}
            >
              <div className="grid gap-0.5 sm:pt-2">
                <span className="text-step--1 font-medium">{type}</span>
                <span className="text-step--2 text-muted-foreground">
                  {t("units", { count: entry.sellableUnits })}
                </span>
              </div>
              <div className="grid gap-1.5">
                {priceList.mayManage ? (
                  <>
                    <Label className="sr-only" htmlFor={id}>
                      {t("priceFor", { type })}
                    </Label>
                    <div className="flex max-w-xs items-center gap-2">
                      <Input
                        aria-describedby={`${id}-note`}
                        aria-invalid={refused || undefined}
                        autoComplete="off"
                        className="tabular-nums"
                        dir="ltr"
                        disabled={pending}
                        id={id}
                        inputMode="decimal"
                        onChange={(event) => {
                          const value = event.target.value;
                          setDraft((current) => ({
                            ...current,
                            [entry.unitType]: value,
                          }));
                        }}
                        placeholder={t("noPrice")}
                        ref={(element) => {
                          if (element) fields.current[entry.unitType] = element;
                        }}
                        value={shown(entry.unitType)}
                      />
                      <span className="shrink-0 text-step--1 text-muted-foreground">
                        {currency} · {t("perNight")}
                      </span>
                    </div>
                    <div id={`${id}-note`}>
                      {refused ? (
                        <FormError>{t("invalid", { currency })}</FormError>
                      ) : shown(entry.unitType).trim() === "" &&
                        entry.sellableUnits > 0 ? (
                        // Only where it changes something: a kind the
                        // Property has none of cannot be booked unpriced.
                        <p className="text-step--2 text-muted-foreground">
                          {t("unpricedHint")}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-step--1 sm:pt-2">
                    {entry.amountMinor === null || entry.currency === null ? (
                      <span className="text-muted-foreground">
                        {t("noPrice")}
                      </span>
                    ) : (
                      <>
                        <bdi className="tabular-nums">
                          {formatMoney(
                            entry.amountMinor,
                            entry.currency,
                            locale,
                          )}
                        </bdi>{" "}
                        <span className="text-muted-foreground">
                          {t("perNight")}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {entry.stale && entry.currency ? (
                  <p className="flex items-start gap-1.5 text-step--2 text-warning">
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    {t("stale", {
                      currency: entry.currency,
                      property: currency,
                    })}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

function isPrice(typed: string, currency: string): boolean {
  const minor = toMinorUnits(typed, currency);
  return minor !== null && minor >= 1;
}
