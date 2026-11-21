import type { ImportRow } from "@ranza/imports";

interface ReasonWords {
  heading(column: string): string;
  problem(code: string): string;
  outcome(code: string): string;
}

/**
 * Why a row is not imported: one sentence per wrong cell, or the outcome of
 * the commit. Given the words rather than finding them, so the page (through
 * next-intl) and the result file (outside any page) say the same thing.
 */
export function reasonsOf(
  row: Pick<ImportRow, "problems" | "outcome">,
  words: ReasonWords,
): string[] {
  if (row.problems.length > 0) {
    return row.problems.map(
      (problem) =>
        `${words.heading(problem.column)}: ${words.problem(problem.code)}`,
    );
  }
  return row.outcome ? [words.outcome(row.outcome)] : [];
}

/** The same, as the one cell a spreadsheet gives it. */
export function reasonOf(
  row: Pick<ImportRow, "problems" | "outcome">,
  words: ReasonWords,
): string {
  return reasonsOf(row, words).join(" ");
}

/** Rows a person must act on first, then the rest in the file's order. */
export function inReadingOrder<
  Row extends Pick<ImportRow, "state" | "rowNumber">,
>(rows: readonly Row[]): Row[] {
  const urgency = (row: Row) =>
    row.state === "wrong" || row.state === "refused" ? 0 : 1;
  return [...rows].sort(
    (a, b) => urgency(a) - urgency(b) || a.rowNumber - b.rowNumber,
  );
}
