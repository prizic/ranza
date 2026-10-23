"use client";

import { useState, type FormEvent } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DateRangeField,
  Field,
} from "@ranza/ui";
import { requestDataExportAction } from "../../../server/data-export";
import {
  holdsPersonalData,
  inCatalogueOrder,
  rangeCutsAny,
  rangePresets,
} from "../helpers";
import {
  EXPORT_RETENTION_DAYS,
  type ExportAbilities,
  type ExportFormat,
  type ExportRange,
  type ExportResourceType,
} from "../types";
import { DatasetPicker } from "./dataset-picker";
import { FormatPicker } from "./format-picker";

/** What the form starts with: nothing, or a request being made again. */
export interface ExportDraft {
  resources: ExportResourceType[];
  format: ExportFormat;
  range: ExportRange | null;
}

export function NewExportForm({
  abilities,
  draft,
  onCancel,
  onRequested,
  organization,
  propertyId,
  timezone,
  today,
}: {
  abilities: ExportAbilities;
  draft: ExportDraft;
  onCancel: () => void;
  onRequested: () => void;
  organization: string;
  propertyId: string;
  timezone: string;
  /** The Property's own day, `YYYY-MM-DD`. */
  today: string;
}) {
  const t = useTranslations("dataExport");
  const permissions = useTranslations("staff.permissions");
  const locale = useLocale() as SupportedLocale;
  const [resources, setResources] = useState<ExportResourceType[]>(
    draft.resources.filter((dataset) => abilities.datasets[dataset]),
  );
  const [format, setFormat] = useState<ExportFormat>(draft.format);
  const [range, setRange] = useState<{ from?: string; to?: string }>({
    ...(draft.range?.from ? { from: draft.range.from } : {}),
    ...(draft.range?.to ? { to: draft.range.to } : {}),
  });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = inCatalogueOrder(resources);
  const ranged = Boolean(range.from || range.to);
  const presets = rangePresets(today);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setProblem(null);
    try {
      const result = await requestDataExportAction(locale, propertyId, {
        resourceTypes: chosen,
        format,
        range: ranged
          ? { from: range.from ?? null, to: range.to ?? null }
          : null,
      });
      switch (result.status) {
        case "done":
          onRequested();
          return;
        case "refused":
          setProblem(
            !abilities.mayCreate || result.datasets.length === 0
              ? t("cannotRequest", {
                  permission: permissions("createDataExports"),
                })
              : t("refusedDatasets", {
                  datasets: result.datasets
                    .map((dataset) => t(`datasets.${dataset}`))
                    .join(", "),
                }),
          );
          return;
        case "invalid":
          setProblem(t(`invalid.${result.problem}`));
          return;
        default:
          setProblem(t("requestFailed"));
      }
    } catch (error) {
      console.error("data_export.request_threw", error);
      setProblem(t("requestFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t("newExportTitle")}
          </CardTitle>
          <CardDescription>
            {t("newExportDescription", { organization })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {abilities.mayCreate ? (
            <p className="text-sm text-muted-foreground">
              {t("scope", { organization })}
            </p>
          ) : (
            <p
              className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
              role="note"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {t("cannotRequest", {
                permission: permissions("createDataExports"),
              })}
            </p>
          )}

          <div className="grid gap-2">
            <DatasetPicker
              abilities={abilities}
              idPrefix="export-dataset"
              onChange={setResources}
              value={resources}
            />
            <p className="text-xs text-muted-foreground">{t("notIncluded")}</p>
          </div>

          <div className="grid gap-2">
            <Field htmlFor="export-period" label={t("rangeTitle")}>
              <DateRangeField
                defaultValue={{ from: range.from, to: range.to }}
                id="export-period"
                labels={{
                  from: t("rangeFrom"),
                  to: t("rangeTo"),
                  emptyFrom: t("rangeEmptyFrom"),
                  emptyTo: t("rangeEmptyTo"),
                  pickFrom: t("rangePickFrom"),
                  pickTo: t("rangePickTo"),
                  clear: t("rangeClear"),
                  done: t("rangeDone"),
                  // Both ends are included: the 3rd to the 5th is three days.
                  span: (days) => t("rangeSpan", { count: days + 1 }),
                }}
                locale={locale}
                names={{ from: "from", to: "to" }}
                onChange={setRange}
                presets={[
                  { label: t("presetLast30"), ...presets.last30 },
                  { label: t("presetThisMonth"), ...presets.thisMonth },
                  { label: t("presetLastMonth"), ...presets.lastMonth },
                  { label: t("presetThisYear"), ...presets.thisYear },
                ]}
                today={today}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {t("rangeDescription")}
            </p>
            {ranged && chosen.length > 0 && !rangeCutsAny(chosen) ? (
              <p className="text-xs text-foreground" role="status">
                {t("rangeMoot")}
              </p>
            ) : null}
            {ranged && chosen.includes("audit_log") ? (
              <p className="text-xs text-muted-foreground">
                {t("rangeClock", { timezone })}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <FormatPicker
              idPrefix="export"
              onChange={setFormat}
              value={format}
            />
            {format === "csv" && chosen.length > 1 ? (
              <p
                className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
                role="note"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                {t("stackedWarning")}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("columnsNote")}</p>
          </div>

          {chosen.length > 0 ? (
            <div
              className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm"
              role="note"
            >
              {holdsPersonalData(chosen) ? (
                <p className="font-medium">{t("personalData")}</p>
              ) : null}
              <p className="text-muted-foreground">
                {t("whoCanDownload", { days: EXPORT_RETENTION_DAYS })}
              </p>
            </div>
          ) : null}

          {problem ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {problem}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            disabled={submitting || !abilities.mayCreate || chosen.length === 0}
            type="submit"
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                {t("requesting")}
              </>
            ) : (
              <>
                <Download aria-hidden="true" />
                {t("requestButton")}
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
