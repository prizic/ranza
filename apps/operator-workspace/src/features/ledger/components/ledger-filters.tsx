"use client";

import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import { Button, Combobox, DateRangeField, Field } from "@ranza/ui";
import { usePickerLabels } from "../../../lib/picker-labels";
import { accountLabel, useAccountNames } from "../account-names";
import { ANY, type LedgerSearch } from "../query";

/** `days` after a `YYYY-MM-DD` day, in UTC so no timezone moves it. */
function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The ledger's filters, as a form that submits by GET: every filtered view is
 * a URL, answered by the server over every entry the viewer may read and not
 * over the rows on screen.
 *
 * Which fields there are depends on what the ledger holds. The journal can be
 * narrowed by account, and by source once there is more than one kind; the
 * currency is offered once there is more than one; the chart is always in one
 * currency, so its currency field has no "all". The words for a date range,
 * Apply and Clear are the audit log's: they say nothing about audit.
 */
export function LedgerFilters({
  accounts,
  actionHref,
  currencies,
  propertyId,
  sourceTypes,
  today,
  values,
}: {
  /** Null on the chart, which has no account filter. */
  accounts: readonly { id: string; code: string; name: string }[] | null;
  /** The route, without a query. */
  actionHref: string;
  currencies: readonly string[];
  propertyId: string;
  sourceTypes: readonly string[];
  /** The opened Property's day, `YYYY-MM-DD`, which the presets count from. */
  today: string;
  values: LedgerSearch & { shownCurrency?: string | undefined };
}) {
  const t = useTranslations();
  const locale = useLocale() as SupportedLocale;
  const accountLabels = usePickerLabels(t("ledger.allAccounts"));
  const sourceLabels = usePickerLabels(t("ledger.allSources"));
  const currencyLabels = usePickerLabels(t("ledger.allCurrencies"));
  const translatedNames = useAccountNames();
  const onJournal = accounts !== null;
  const presets = [
    { label: t("today"), from: today, to: today },
    { label: t("auditPresetLast7"), from: shiftDay(today, -6), to: today },
    { label: t("auditPresetLast30"), from: shiftDay(today, -29), to: today },
    {
      label: t("auditPresetThisMonth"),
      from: `${today.slice(0, 8)}01`,
      to: today,
    },
  ];
  const filtered = Boolean(
    values.from ||
    values.to ||
    values.account ||
    values.source ||
    (onJournal && values.currency),
  );

  return (
    <form
      action={actionHref}
      aria-label={t("ledger.filtersLabel")}
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
      method="get"
    >
      <input name="property" type="hidden" value={propertyId} />
      {values.tab === "accounts" ? (
        <input name="tab" type="hidden" value="accounts" />
      ) : null}

      <Field htmlFor="ledger-period" label={t("auditPeriod")}>
        <DateRangeField
          defaultValue={{ from: values.from, to: values.to }}
          id="ledger-period"
          labels={{
            from: t("auditFrom"),
            to: t("auditTo"),
            emptyFrom: t("auditFromEmpty"),
            emptyTo: t("auditToEmpty"),
            pickFrom: t("auditPickFrom"),
            pickTo: t("auditPickTo"),
            clear: t("dateRangeClear"),
            done: t("dateRangeDone"),
            span: (days) => t("auditSpanDays", { count: days + 1 }),
          }}
          locale={locale}
          names={{ from: "from", to: "to" }}
          presets={presets}
          today={today}
        />
      </Field>

      {onJournal ? (
        <Field htmlFor="ledger-account" label={t("ledger.account")}>
          <Combobox
            defaultValue={values.account ?? ANY}
            id="ledger-account"
            labels={accountLabels}
            name="account"
            options={[
              { value: ANY, label: t("ledger.allAccounts") },
              ...accounts.map((account) => ({
                value: account.id,
                label: `${account.code} · ${accountLabel(account, translatedNames)}`,
              })),
            ]}
          />
        </Field>
      ) : null}

      {onJournal && sourceTypes.length > 1 ? (
        <Field htmlFor="ledger-source" label={t("ledger.source")}>
          <Combobox
            defaultValue={values.source ?? ANY}
            id="ledger-source"
            labels={sourceLabels}
            name="source"
            options={[
              { value: ANY, label: t("ledger.allSources") },
              ...sourceTypes.map((source) => ({
                value: source,
                label:
                  source === "folio_line"
                    ? t("ledger.sourceFolioLine")
                    : source,
              })),
            ]}
          />
        </Field>
      ) : null}

      {currencies.length > 1 ? (
        <Field htmlFor="ledger-currency" label={t("ledger.currency")}>
          <Combobox
            defaultValue={
              onJournal
                ? (values.currency ?? ANY)
                : (values.shownCurrency ?? currencies[0] ?? ANY)
            }
            id="ledger-currency"
            labels={currencyLabels}
            name="currency"
            options={[
              ...(onJournal
                ? [{ value: ANY, label: t("ledger.allCurrencies") }]
                : []),
              ...currencies.map((currency) => ({
                value: currency,
                label: currency,
              })),
            ]}
          />
        </Field>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit">
          <Search aria-hidden="true" />
          {t("auditApply")}
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            {/* A full load, like the form it resets: the fields take their
                values only when they first render. */}
            <a
              href={`${actionHref}?property=${propertyId}${values.tab === "accounts" ? "&tab=accounts" : ""}`}
            >
              {t("auditClearFilters")}
            </a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
