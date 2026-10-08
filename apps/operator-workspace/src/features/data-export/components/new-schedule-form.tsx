"use client";

import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import {
  EXPORT_RESOURCE_TYPES,
  type ExportFormat,
  type ExportResourceType,
  type ScheduleFrequency,
} from "../types";
import { createExportScheduleAction } from "../../../server/data-export";

interface NewScheduleFormProps {
  locale: string;
  propertyId: string;
  onSuccess?: () => void;
}

export function NewScheduleForm({
  locale,
  propertyId,
  onSuccess,
}: NewScheduleFormProps) {
  const t = useTranslations("dataExport");
  const [name, setName] = useState("");
  const [selectedResources, setSelectedResources] = useState<
    ExportResourceType[]
  >(["residents_guests", "folios_payments"]);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const toggleResource = (res: ExportResourceType) => {
    setSelectedResources((prev) =>
      prev.includes(res) ? prev.filter((r) => r !== res) : [...prev, res],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedResources.length === 0) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await createExportScheduleAction(locale, propertyId, {
        name,
        resourceTypes: selectedResources,
        format,
        frequency,
      });

      if (res.status === "done") {
        setFeedback({ type: "success", message: t("scheduleSuccess") });
        setName("");
        if (onSuccess) {
          setTimeout(onSuccess, 1000);
        }
      } else {
        setFeedback({
          type: "error",
          message: res.message || t("scheduleFailed"),
        });
      }
    } catch {
      setFeedback({ type: "error", message: t("scheduleFailed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border max-w-2xl">
      <form onSubmit={handleSubmit}>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg font-semibold text-foreground">
            {t("scheduleTitle")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {t("scheduleDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:p-6 sm:pt-0">
          {/* Schedule Name */}
          <div className="space-y-2">
            <Label
              htmlFor="schedule-name"
              className="text-sm font-medium text-foreground"
            >
              {t("scheduleName")}
            </Label>
            <Input
              id="schedule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("scheduleNamePlaceholder")}
              required
              className="max-w-md"
            />
          </div>

          {/* Frequency & Format */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("frequencyTitle")}
              </Label>
              <Select
                value={frequency}
                onValueChange={(val) => setFrequency(val as ScheduleFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">
                    {t("frequencies.daily")}
                  </SelectItem>
                  <SelectItem value="weekly">
                    {t("frequencies.weekly")}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {t("frequencies.monthly")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("formatTitle")}
              </Label>
              <Select
                value={format}
                onValueChange={(val) => setFormat(val as ExportFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Spreadsheet)</SelectItem>
                  <SelectItem value="json">JSON (Structured)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Datasets Selection */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {t("datasetsTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("datasetsDescription")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {EXPORT_RESOURCE_TYPES.map((res) => {
                const isChecked = selectedResources.includes(res);
                return (
                  <label
                    key={res}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleResource(res)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <span className="text-sm font-medium leading-none block text-foreground">
                        {t(`datasets.${res}` as Parameters<typeof t>[0])}
                      </span>
                      <p className="text-xs text-muted-foreground leading-normal">
                        {t(
                          `datasetDescriptions.${res}` as Parameters<
                            typeof t
                          >[0],
                        )}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-md text-sm ${
                feedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              }`}
            >
              {feedback.message}
            </div>
          )}
        </CardContent>
        <CardFooter className="p-4 sm:p-6 sm:pt-0 flex justify-end">
          <Button
            type="submit"
            disabled={
              isSubmitting || !name.trim() || selectedResources.length === 0
            }
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>{t("creatingSchedule")}</span>
              </>
            ) : (
              <>
                <Calendar className="size-4" />
                <span>{t("createScheduleButton")}</span>
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
