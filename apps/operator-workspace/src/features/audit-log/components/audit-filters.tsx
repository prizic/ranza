"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button, Combobox, Field, Input } from "@ranza/ui";
import { usePickerLabels } from "../../../lib/table-labels";
import { ANY, KNOWN_ACTIONS } from "../actions";

export interface AuditFilterValues {
  action?: string | undefined;
  at?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
}

/**
 * The log's filters, as a form that submits by GET.
 *
 * They run on the server, over every record the viewer may read — not over the
 * rows already on the screen, which is how a search that finds nothing used to
 * read as "this never happened" when the record was simply older than the
 * page (AL-DEF-03). Submitting by GET makes every filtered view a URL, so a
 * manager can send a colleague exactly what they are looking at.
 *
 * `property` rides along hidden: it is the Property the log is opened from,
 * chosen in the page bar's switcher, and `at` is the narrowing to one Property
 * — two different questions, so two different parameters.
 */
export function AuditFilters({
  actionHref,
  properties,
  propertyId,
  values,
}: {
  /** The route, without a query. */
  actionHref: string;
  properties: readonly { id: string; name: string }[];
  propertyId: string;
  values: AuditFilterValues;
}) {
  const t = useTranslations();
  const actionLabels = usePickerLabels(t("auditAnyAction"));
  const propertyLabels = usePickerLabels(t("auditEveryProperty"));
  const filtered = Boolean(
    values.action || values.at || values.from || values.to || values.q,
  );

  return (
    <form
      action={actionHref}
      aria-label={t("auditFilters")}
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] lg:items-end"
      method="get"
    >
      <input name="property" type="hidden" value={propertyId} />

      <Field htmlFor="audit-action" label={t("auditActionFilter")}>
        <Combobox
          defaultValue={values.action ?? ANY}
          id="audit-action"
          labels={actionLabels}
          name="action"
          options={[
            { value: ANY, label: t("auditAnyAction") },
            ...KNOWN_ACTIONS.map((action) => ({
              value: action,
              label: t(`auditAction.${action}`),
            })),
          ]}
        />
      </Field>

      <Field htmlFor="audit-at" label={t("auditProperty")}>
        <Combobox
          defaultValue={values.at ?? ANY}
          id="audit-at"
          labels={propertyLabels}
          name="at"
          options={[
            { value: ANY, label: t("auditEveryProperty") },
            ...properties.map((property) => ({
              value: property.id,
              label: property.name,
            })),
          ]}
        />
      </Field>

      <Field htmlFor="audit-from" label={t("auditFrom")}>
        <Input
          defaultValue={values.from}
          id="audit-from"
          name="from"
          type="date"
        />
      </Field>

      <Field htmlFor="audit-to" label={t("auditTo")}>
        <Input defaultValue={values.to} id="audit-to" name="to" type="date" />
      </Field>

      <Field htmlFor="audit-q" label={t("auditSearch")}>
        <Input
          defaultValue={values.q}
          id="audit-q"
          maxLength={100}
          name="q"
          placeholder={t("auditSearchHint")}
          type="search"
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit">
          <Search aria-hidden="true" />
          {t("auditApply")}
        </Button>
        {filtered ? (
          <Button asChild variant="ghost">
            {/* A full load, like the form it resets: the fields take their
                values only when they first render, so a client navigation
                would leave them showing filters the table no longer applies. */}
            <a href={`${actionHref}?property=${propertyId}`}>
              {t("auditClearFilters")}
            </a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
