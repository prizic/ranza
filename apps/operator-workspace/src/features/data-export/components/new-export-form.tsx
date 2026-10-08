"use client";

import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
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
} from "@ranza/ui";
import {
  EXPORT_RESOURCE_TYPES,
  type ExportFormat,
  type ExportResourceType,
} from "../types";
import { requestDataExportAction } from "../../../server/data-export";

interface NewExportFormProps {
  locale: string;
  propertyId: string;
  onSuccess?: () => void;
}

export function NewExportForm({
  locale,
  propertyId,
  onSuccess,
}: NewExportFormProps) {
  const t = useTranslations("dataExport");

  const getDatasetLabel = (res: ExportResourceType): string => {
    switch (res) {
      case "residents_guests":
        return t("datasets.residents_guests");
      case "reservations_stays":
        return t("datasets.reservations_stays");
      case "rooms_beds":
        return t("datasets.rooms_beds");
      case "folios_payments":
        return t("datasets.folios_payments");
      case "audit_log":
        return t("datasets.audit_log");
    }
  };

  const getDatasetDescription = (res: ExportResourceType): string => {
    switch (res) {
      case "residents_guests":
        return t("datasetDescriptions.residents_guests");
      case "reservations_stays":
        return t("datasetDescriptions.reservations_stays");
      case "rooms_beds":
        return t("datasetDescriptions.rooms_beds");
      case "folios_payments":
        return t("datasetDescriptions.folios_payments");
      case "audit_log":
        return t("datasetDescriptions.audit_log");
    }
  };
  const [selectedResources, setSelectedResources] = useState<
    ExportResourceType[]
  >(["residents_guests", "reservations_stays"]);
  const [format, setFormat] = useState<ExportFormat>("csv");
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
    if (selectedResources.length === 0) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await requestDataExportAction(locale, propertyId, {
        resourceTypes: selectedResources,
        format,
      });

      if (res.status === "done") {
        setFeedback({ type: "success", message: t("requestSuccess") });
        if (onSuccess) {
          setTimeout(onSuccess, 1000);
        }
      } else {
        setFeedback({
          type: "error",
          message: res.message || t("requestFailed"),
        });
      }
    } catch {
      setFeedback({ type: "error", message: t("requestFailed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border max-w-2xl">
      <form onSubmit={handleSubmit}>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-lg font-semibold text-foreground">
            {t("newExportTitle")}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {t("newExportDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:p-6 sm:pt-0">
          {/* Datasets Selection */}
          <div className="space-y-3">
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
                        {getDatasetLabel(res)}
                      </span>
                      <p className="text-xs text-muted-foreground leading-normal">
                        {getDatasetDescription(res)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {t("formatTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("formatDescription")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  format === "csv"
                    ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                  className="sr-only"
                />
                <FileSpreadsheet className="size-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <span className="text-sm font-medium block text-foreground">
                    CSV (Spreadsheet)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Excel, Numbers, Sheets
                  </span>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  format === "json"
                    ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={format === "json"}
                  onChange={() => setFormat("json")}
                  className="sr-only"
                />
                <FileJson className="size-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="text-sm font-medium block text-foreground">
                    JSON (Structured)
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Developer APIs, Backup
                  </span>
                </div>
              </label>
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
            disabled={isSubmitting || selectedResources.length === 0}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>{t("requesting")}</span>
              </>
            ) : (
              <>
                <Download className="size-4" />
                <span>{t("requestButton")}</span>
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
