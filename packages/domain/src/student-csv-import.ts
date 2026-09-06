import { parseStudentDraft, type StudentDraft } from "./student-roster";

export const studentCsvHeaders = [
  "external_reference",
  "display_name",
  "preferred_locale",
] as const;

export const studentCsvTemplate =
  `${studentCsvHeaders.join(",")}\r\n` + 'STU-001,"Ayşe Kaya",tr\r\n';

export interface StudentImportErrorExportRow {
  displayName: string;
  errors: readonly string[];
  externalReference: string;
  preferredLocale: string;
  rowNumber: number;
}

export const studentImportErrorHeaders = [
  "row_number",
  "external_reference",
  "display_name",
  "preferred_locale",
  "errors",
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildStudentImportErrorCsv(
  rows: readonly StudentImportErrorExportRow[],
): string {
  const records = rows.map((row) =>
    [
      String(row.rowNumber),
      row.externalReference,
      row.displayName,
      row.preferredLocale,
      row.errors.join("|"),
    ]
      .map(csvField)
      .join(","),
  );
  return `${studentImportErrorHeaders.join(",")}\r\n${records.map((row) => `${row}\r\n`).join("")}`;
}

export type StudentCsvErrorCode =
  | "DUPLICATE_EXTERNAL_REFERENCE"
  | "INVALID_COLUMN_COUNT"
  | "INVALID_DISPLAY_NAME"
  | "INVALID_EXTERNAL_REFERENCE"
  | "INVALID_LOCALE"
  | "MISSING_DISPLAY_NAME"
  | "MISSING_EXTERNAL_REFERENCE";

export interface StudentCsvRowError {
  code: StudentCsvErrorCode;
  column: (typeof studentCsvHeaders)[number] | null;
  message: string;
}

export interface StudentCsvPreviewRow {
  draft: StudentDraft | null;
  errors: StudentCsvRowError[];
  rowNumber: number;
  values: {
    displayName: string;
    externalReference: string;
    preferredLocale: string;
  } | null;
}

export interface StudentCsvPreview {
  errorCount: number;
  rows: StudentCsvPreviewRow[];
  validCount: number;
}

export class StudentCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentCsvParseError";
  }
}

function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  const finishField = () => {
    record.push(field);
    field = "";
    closedQuote = false;
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character !== '"') {
        field += character;
        continue;
      }
      if (csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
        closedQuote = true;
      }
      continue;
    }

    if (
      closedQuote &&
      character !== "," &&
      character !== "\r" &&
      character !== "\n"
    ) {
      throw new StudentCsvParseError(
        "Unexpected content after a quoted field.",
      );
    }
    if (character === '"') {
      if (field.length > 0) {
        throw new StudentCsvParseError("A quote must begin a CSV field.");
      }
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRecord();
    } else if (character === "\r") {
      finishRecord();
      if (csv[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new StudentCsvParseError("The final quoted field is not closed.");
  }
  if (field.length > 0 || record.length > 0) finishRecord();
  return records;
}

function fieldError(
  code: StudentCsvErrorCode,
  column: StudentCsvRowError["column"],
  message: string,
): StudentCsvRowError {
  return { code, column, message };
}

export function parseStudentCsv(
  input: string,
  options: { maxBytes?: number; maxRows?: number } = {},
): StudentCsvPreview {
  const maxBytes = options.maxBytes ?? 5_000_000;
  const maxRows = options.maxRows ?? 1_000;
  if (new TextEncoder().encode(input).byteLength > maxBytes) {
    throw new StudentCsvParseError("The CSV file is too large.");
  }
  if (input.includes("\ufffd")) {
    throw new StudentCsvParseError("The file is not valid UTF-8.");
  }

  const csv = input.startsWith("\ufeff") ? input.slice(1) : input;
  const records = parseRecords(csv);
  const header = records.shift();
  if (
    !header ||
    header.length !== studentCsvHeaders.length ||
    !studentCsvHeaders.every((expected, index) => header[index] === expected)
  ) {
    throw new StudentCsvParseError(
      `CSV headers must be exactly: ${studentCsvHeaders.join(",")}.`,
    );
  }

  const dataRecords = records.filter(
    (record) => !record.every((value) => value.trim().length === 0),
  );
  if (dataRecords.length > maxRows) {
    throw new StudentCsvParseError(
      `The CSV file contains more than ${maxRows} Student rows.`,
    );
  }
  if (dataRecords.length === 0) {
    throw new StudentCsvParseError("The CSV file has no Student rows.");
  }

  const rows: StudentCsvPreviewRow[] = dataRecords.map((record, index) => {
    const errors: StudentCsvRowError[] = [];
    if (record.length !== studentCsvHeaders.length) {
      errors.push(
        fieldError(
          "INVALID_COLUMN_COUNT",
          null,
          `Expected ${studentCsvHeaders.length} columns but received ${record.length}.`,
        ),
      );
      return { draft: null, errors, rowNumber: index + 2, values: null };
    }

    const externalReference = (record[0] ?? "").trim();
    const displayName = (record[1] ?? "").trim();
    const preferredLocale = (record[2] ?? "").trim().toLowerCase();
    if (!externalReference) {
      errors.push(
        fieldError(
          "MISSING_EXTERNAL_REFERENCE",
          "external_reference",
          "External reference is required for safe retry.",
        ),
      );
    } else if (externalReference.length > 120) {
      errors.push(
        fieldError(
          "INVALID_EXTERNAL_REFERENCE",
          "external_reference",
          "External reference must contain at most 120 characters.",
        ),
      );
    }
    if (!displayName) {
      errors.push(
        fieldError(
          "MISSING_DISPLAY_NAME",
          "display_name",
          "Student name is required.",
        ),
      );
    } else if (displayName.length < 2 || displayName.length > 120) {
      errors.push(
        fieldError(
          "INVALID_DISPLAY_NAME",
          "display_name",
          "Student name must contain 2–120 characters.",
        ),
      );
    }
    if (
      preferredLocale !== "tr" &&
      preferredLocale !== "en" &&
      preferredLocale !== "ar"
    ) {
      errors.push(
        fieldError(
          "INVALID_LOCALE",
          "preferred_locale",
          "Language must be tr, en, or ar.",
        ),
      );
    }

    let draft: StudentDraft | null = null;
    if (errors.length === 0) {
      draft = parseStudentDraft({
        displayName,
        externalReference,
        preferredLocale,
      });
    }
    return {
      draft,
      errors,
      rowNumber: index + 2,
      values: { displayName, externalReference, preferredLocale },
    };
  });

  const referenceCounts = new Map<string, number>();
  for (const row of rows) {
    const reference = row.draft?.externalReference;
    if (reference) {
      referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
    } else if (dataRecords[row.rowNumber - 2]?.length === 3) {
      const rawReference = (dataRecords[row.rowNumber - 2]?.[0] ?? "").trim();
      if (rawReference) {
        referenceCounts.set(
          rawReference,
          (referenceCounts.get(rawReference) ?? 0) + 1,
        );
      }
    }
  }
  for (const row of rows) {
    const rawReference = dataRecords[row.rowNumber - 2]?.[0]?.trim();
    if (rawReference && (referenceCounts.get(rawReference) ?? 0) > 1) {
      row.errors.push(
        fieldError(
          "DUPLICATE_EXTERNAL_REFERENCE",
          "external_reference",
          "External reference appears more than once in this file.",
        ),
      );
      row.draft = null;
    }
  }

  return {
    errorCount: rows.reduce((total, row) => total + row.errors.length, 0),
    rows,
    validCount: rows.filter((row) => row.errors.length === 0).length,
  };
}

export async function createStudentImportKey(
  operatorId: string,
  branchId: string,
  csv: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${operatorId}\u0000${branchId}\u0000${csv}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
