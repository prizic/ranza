import type { SupportedLocale } from "@ranza/i18n";
import {
  IMPORT_KINDS,
  PEOPLE_COLUMNS,
  ROOM_COLUMNS,
  resultRows,
  rowsToFix,
  templateRows,
  workbookOf,
  type ColumnSpec,
  type ImportKind,
  type ImportRow,
  type ReportWording,
} from "@ranza/imports";
import type { ImportColumn } from "../features/imports/components/import-upload";
import type { ImportsMessages } from "../features/imports/messages";
import { reasonOf } from "../features/imports/wording";
import { catalogueFor } from "../words/catalogue";
import { getComposition } from "./composition";

/**
 * The files guided import hands a person, and the columns the screen names
 * (IMP-S1-25, IMP-S1-26, IMP-S2-06). They come through here because the
 * dependency rules let only `src/server/` name a Ranza package at runtime.
 */

const COLUMNS: Record<ImportKind, readonly ColumnSpec[]> = {
  rooms: ROOM_COLUMNS,
  people: PEOPLE_COLUMNS,
};

/** A kind named in a link or a form, read only when it is one. */
export function isImportKind(value: unknown): value is ImportKind {
  return (IMPORT_KINDS as readonly unknown[]).includes(value);
}

/** The columns of a kind's file, in the reader's language. */
export function importColumns(
  kind: ImportKind,
  locale: SupportedLocale,
): ImportColumn[] {
  return COLUMNS[kind].map((spec) => ({
    key: spec.key,
    label: spec.headers[locale],
    required: spec.required,
  }));
}

/** The headings in the reader's language and one example row. */
export function importTemplate(
  kind: ImportKind,
  locale: SupportedLocale,
): Promise<Buffer> {
  return workbookOf(templateRows(COLUMNS[kind], locale));
}

/** A message by its code, or the code itself where a newer writer knew more. */
function worded(sentences: Record<string, string>, code: string): string {
  return sentences[code] ?? code;
}

function wordingIn(
  kind: ImportKind,
  messages: ImportsMessages,
  locale: SupportedLocale,
): ReportWording {
  return {
    rowHeading: messages.detail.row,
    outcomeHeading: messages.detail.outcome,
    reasonHeading: messages.detail.reason,
    outcome: (row: ImportRow) => messages.rowStates[row.state],
    reason: (row: ImportRow) =>
      reasonOf(row, {
        heading: (column) =>
          COLUMNS[kind].find((spec) => spec.key === column)?.headers[locale] ??
          column,
        problem: (code) => worded(messages.problems[kind], code),
        outcome: (code) => worded(messages.outcomes[kind], code),
      }),
  };
}

/**
 * Every row with its outcome, or only the rows to fix in the template's own
 * columns. Null when the caller may not read the rows or they are gone: the
 * database returns them to the uploader alone, while they are held.
 */
export async function importResultFile(
  userId: string,
  importId: string,
  which: "result" | "fix",
  locale: SupportedLocale,
): Promise<Buffer | null> {
  const composition = getComposition();
  const detail = await composition.imports.getImport(userId, importId);
  if (!detail || detail.rows.length === 0) return null;
  // In the words the screen used: a dormitory's Student, not Resident.
  const model = await composition.core.operatingModel(
    userId,
    detail.propertyId,
  );
  const columns = COLUMNS[detail.kind];
  const wording = wordingIn(
    detail.kind,
    catalogueFor(locale, model).imports,
    locale,
  );
  return workbookOf(
    which === "fix"
      ? rowsToFix(columns, locale, detail.rows, wording)
      : resultRows(columns, locale, detail.rows, wording),
  );
}
