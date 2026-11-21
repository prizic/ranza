import writeXlsxFile from "write-excel-file/node";
import type { ColumnSpec, ImportLocale, ImportRow } from "./contracts";

/** Rows of text as a workbook: what the template and both result files are. */
export async function workbookOf(rows: readonly string[][]): Promise<Buffer> {
  const file = await writeXlsxFile(
    rows.map((row, index) =>
      row.map((value) =>
        index === 0
          ? { value, type: String, fontWeight: "bold" as const }
          : { value, type: String },
      ),
    ),
  );
  return file.toBuffer();
}

export interface ReportWording {
  /** The headings of the two columns a report adds. */
  outcomeHeading: string;
  reasonHeading: string;
  rowHeading: string;
  outcome(row: ImportRow): string;
  reason(row: ImportRow): string;
}

/**
 * The rows to fix, in the template's own columns with the reason beside them,
 * so the file is corrected and uploaded again as it is (IMP-S1-25). The reason
 * column is not one the reader knows, and is ignored on the way back in.
 */
export function rowsToFix(
  specs: readonly ColumnSpec[],
  locale: ImportLocale,
  rows: readonly ImportRow[],
  wording: ReportWording,
): string[][] {
  return [
    [...specs.map((spec) => spec.headers[locale]), wording.reasonHeading],
    ...rows
      .filter((row) => row.state === "wrong" || row.state === "refused")
      .map((row) => [
        ...specs.map((spec) => row.cells[spec.key] ?? ""),
        wording.reason(row),
      ]),
  ];
}

/** Every row with what became of it. */
export function resultRows(
  specs: readonly ColumnSpec[],
  locale: ImportLocale,
  rows: readonly ImportRow[],
  wording: ReportWording,
): string[][] {
  return [
    [
      wording.rowHeading,
      ...specs.map((spec) => spec.headers[locale]),
      wording.outcomeHeading,
      wording.reasonHeading,
    ],
    ...rows.map((row) => [
      String(row.rowNumber),
      ...specs.map((spec) => row.cells[spec.key] ?? ""),
      wording.outcome(row),
      wording.reason(row),
    ]),
  ];
}
