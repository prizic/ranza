"use client";

import { FileJson, FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { ExportFormat } from "../types";

/** The programs that open a CSV. Product names, not words: never translated. */
const SPREADSHEET_PROGRAMS = ["Excel", "Numbers", "Google Sheets"] as const;

/**
 * CSV or JSON, as two cards. The radios are real and visually hidden, so the
 * card carries their focus: a keyboard user sees which is focused and which is
 * chosen (DX-21).
 */
export function FormatPicker({
  idPrefix,
  onChange,
  value,
}: {
  idPrefix: string;
  onChange: (next: ExportFormat) => void;
  value: ExportFormat;
}) {
  const t = useTranslations("dataExport");

  const option = (format: ExportFormat) => (
    <label
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        value === format
          ? "cursor-pointer border-primary bg-primary/5"
          : "cursor-pointer hover:bg-muted/50",
      )}
      htmlFor={`${idPrefix}-${format}`}
    >
      <input
        checked={value === format}
        className="sr-only"
        id={`${idPrefix}-${format}`}
        name={`${idPrefix}-format`}
        onChange={() => onChange(format)}
        type="radio"
        value={format}
      />
      {format === "csv" ? (
        <FileSpreadsheet aria-hidden="true" className="size-5 text-primary" />
      ) : (
        <FileJson aria-hidden="true" className="size-5 text-primary" />
      )}
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">
          {t(`formats.${format}.title`)}
        </span>
        <span className="text-xs text-muted-foreground">
          {format === "csv"
            ? // Latin product names inside a right-to-left line: each is its own
              // isolated run, so the separator cannot attach to the wrong name
              // (DX-18).
              SPREADSHEET_PROGRAMS.map((program, index) => (
                <span key={program}>
                  {index > 0 ? " · " : null}
                  <bdi dir="ltr">{program}</bdi>
                </span>
              ))
            : t("formats.json.hint")}
        </span>
      </span>
    </label>
  );

  return (
    <fieldset className="grid gap-3">
      <legend className="grid gap-0.5">
        <span className="text-sm font-medium">{t("formatTitle")}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {t("formatDescription")}
        </span>
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {option("csv")}
        {option("json")}
      </div>
    </fieldset>
  );
}
