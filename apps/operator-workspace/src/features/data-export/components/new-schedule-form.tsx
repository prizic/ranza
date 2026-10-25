"use client";

import { useState, type FormEvent } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { createExportScheduleAction } from "../../../server/data-export";
import { firstRunAt, holdsPersonalData, inCatalogueOrder } from "../helpers";
import {
  EXPORT_RETENTION_DAYS,
  type ExportAbilities,
  type ExportFormat,
  type ExportResourceType,
  type ScheduleFrequency,
} from "../types";
import { DatasetPicker } from "./dataset-picker";
import { FormatPicker } from "./format-picker";
import { useNow } from "../use-now";

const FREQUENCIES: readonly ScheduleFrequency[] = [
  "daily",
  "weekly",
  "monthly",
];

export function NewScheduleForm({
  abilities,
  onCancel,
  onCreated,
  propertyId,
  timezone,
}: {
  abilities: ExportAbilities;
  onCancel: () => void;
  onCreated: () => void;
  propertyId: string;
  timezone: string;
}) {
  const t = useTranslations("dataExport");
  const permissions = useTranslations("staff.permissions");
  const locale = useLocale() as SupportedLocale;
  const now = useNow(30_000);
  const [name, setName] = useState("");
  const [resources, setResources] = useState<ExportResourceType[]>([]);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = inCatalogueOrder(resources);
  // The one thing still missing, said beside the button that waits on it
  // (DATA-12).
  const whyNotYet = !abilities.mayCreate
    ? t("requestNeedsPermission")
    : name.trim() === ""
      ? t("invalid.name_missing")
      : chosen.length === 0
        ? t("requestNeedsDataset")
        : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setProblem(null);
    try {
      const result = await createExportScheduleAction(locale, propertyId, {
        name,
        resourceTypes: chosen,
        format,
        frequency,
      });
      switch (result.status) {
        case "done":
          onCreated();
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
          setProblem(t("scheduleFailed"));
      }
    } catch (error) {
      console.error("data_export.schedule_create_threw", error);
      setProblem(t("scheduleFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t("scheduleTitle")}
          </CardTitle>
          <CardDescription>{t("scheduleDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {abilities.mayCreate ? null : (
            <p
              className="rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
              role="note"
            >
              {t("cannotRequest", {
                permission: permissions("createDataExports"),
              })}
            </p>
          )}

          <Field htmlFor="schedule-name" label={t("scheduleName")}>
            <Input
              className="max-w-md"
              id="schedule-name"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("scheduleNamePlaceholder")}
              value={name}
            />
          </Field>

          <div className="grid gap-2">
            <Field htmlFor="schedule-frequency" label={t("frequencyTitle")}>
              <Select
                onValueChange={(value) =>
                  setFrequency(value as ScheduleFrequency)
                }
                value={frequency}
              >
                <SelectTrigger
                  className="w-full max-w-xs"
                  id="schedule-frequency"
                >
                  <SelectValue>{t(`frequencies.${frequency}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`frequencies.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {now === null ? null : (
              <p className="text-xs text-muted-foreground">
                {t("firstRun", {
                  when: formatDate(
                    firstRunAt(frequency, new Date(now)),
                    locale,
                    {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      hourCycle: "h23",
                      minute: "2-digit",
                      timeZone: timezone,
                    },
                  ),
                  every: t(`frequencyEvery.${frequency}`),
                })}
              </p>
            )}
          </div>

          <DatasetPicker
            abilities={abilities}
            idPrefix="schedule-dataset"
            onChange={setResources}
            value={resources}
          />

          <FormatPicker
            idPrefix="schedule"
            onChange={setFormat}
            value={format}
          />

          <div
            className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm"
            role="note"
          >
            {holdsPersonalData(chosen) ? (
              <p className="font-medium">{t("personalData")}</p>
            ) : null}
            <p className="text-muted-foreground">
              {t("scheduleKeeps", { days: EXPORT_RETENTION_DAYS })}
            </p>
            <p className="text-muted-foreground">{t("scheduleNoRange")}</p>
          </div>

          {problem ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {problem}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-end gap-2">
          {whyNotYet ? (
            <p
              className="me-auto text-sm text-muted-foreground"
              id="schedule-why-not"
            >
              {whyNotYet}
            </p>
          ) : null}
          <Button onClick={onCancel} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            aria-describedby={whyNotYet ? "schedule-why-not" : undefined}
            disabled={submitting || whyNotYet !== null}
            type="submit"
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                {t("creatingSchedule")}
              </>
            ) : (
              <>
                <CalendarPlus aria-hidden="true" />
                {t("createScheduleButton")}
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
