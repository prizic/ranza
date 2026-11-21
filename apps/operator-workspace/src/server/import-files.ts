import type { SupportedLocale } from "@ranza/i18n";
import {
  ROOM_COLUMNS,
  resultRows,
  rowsToFix,
  templateRows,
  workbookOf,
  type ImportRow,
  type ReportWording,
} from "@ranza/imports";
import type { ImportColumn } from "../features/imports/components/import-upload";
import {
  importsMessages,
  type ImportsMessages,
} from "../features/imports/messages";
import { reasonOf } from "../features/imports/wording";
import { getComposition } from "./composition";

/**
 * The files guided import hands a person, and the columns the screen names
 * (IMP-S1-25, IMP-S1-26). They come through here because the dependency rules
 * let only `src/server/` name a Ranza package at runtime.
 */

/** The columns of a rooms file, in the reader's language. */
export function roomColumns(locale: SupportedLocale): ImportColumn[] {
  return ROOM_COLUMNS.map((spec) => ({
    key: spec.key,
    label: spec.headers[locale],
    required: spec.required,
  }));
}

/** The headings in the reader's language and one example row. */
export function roomTemplate(locale: SupportedLocale): Promise<Buffer> {
  return workbookOf(templateRows(ROOM_COLUMNS, locale));
}

/** A message by its code, or the code itself where a newer writer knew more. */
function worded(sentences: Record<string, string>, code: string): string {
  return sentences[code] ?? code;
}

function wordingIn(
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
          ROOM_COLUMNS.find((spec) => spec.key === column)?.headers[locale] ??
          column,
        problem: (code) => worded(messages.problems, code),
        outcome: (code) => worded(messages.outcomes, code),
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
  const detail = await getComposition().imports.getImport(userId, importId);
  if (!detail || detail.rows.length === 0) return null;
  const wording = wordingIn(importsMessages[locale], locale);
  return workbookOf(
    which === "fix"
      ? rowsToFix(ROOM_COLUMNS, locale, detail.rows, wording)
      : resultRows(ROOM_COLUMNS, locale, detail.rows, wording),
  );
}
