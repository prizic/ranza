import {
  ImportFileError,
  type ColumnMapping,
  type ColumnSpec,
  type ImportLocale,
  type SheetTable,
} from "./contracts";

/**
 * A heading as it is compared: lower case, without accents, spaces or
 * punctuation, and with the Turkish dotless and dotted i folded together, so
 * "Oda No", "ODA NO." and "oda_no" are one heading (IMP-S1-17).
 */
export function normalizeHeading(heading: string): string {
  return heading
    .replace(/İ/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function headingsOf(spec: ColumnSpec): Set<string> {
  return new Set([
    normalizeHeading(spec.key),
    ...Object.values(spec.headers).map(normalizeHeading),
    ...spec.aliases,
  ]);
}

export interface ColumnMatch {
  mapping: ColumnMapping;
  /** Required columns no heading matched: the person is asked which they are. */
  missing: readonly string[];
  /** Headings no column claimed: offered for matching, otherwise ignored. */
  unknown: readonly { index: number; heading: string }[];
}

/** Each column to the first heading that names it, in any of the three languages. */
export function matchColumns(
  headers: readonly string[],
  specs: readonly ColumnSpec[],
): ColumnMatch {
  const normalized = headers.map(normalizeHeading);
  const claimed = new Set<number>();
  const mapping: Record<string, number | null> = {};
  for (const spec of specs) {
    const accepted = headingsOf(spec);
    const index = normalized.findIndex(
      (heading, at) => !claimed.has(at) && accepted.has(heading),
    );
    mapping[spec.key] = index === -1 ? null : index;
    if (index !== -1) claimed.add(index);
  }
  return {
    mapping,
    missing: specs
      .filter((spec) => spec.required && mapping[spec.key] === null)
      .map((spec) => spec.key),
    unknown: headers
      .map((heading, index) => ({ index, heading }))
      .filter(({ index, heading }) => !claimed.has(index) && heading !== ""),
  };
}

/**
 * A mapping a person chose, held to what the file and the kind allow: a column
 * the kind does not know is dropped, an index outside the file is no column,
 * and one file column feeds at most one key, a required one first.
 */
export function chosenMapping(
  chosen: Readonly<Record<string, number | null | undefined>>,
  headers: readonly string[],
  specs: readonly ColumnSpec[],
): ColumnMatch {
  const used = new Set<number>();
  const mapping: Record<string, number | null> = {};
  // A required column claims its file column before an optional one does.
  const requiredFirst = [...specs].sort(
    (a, b) => Number(b.required) - Number(a.required),
  );
  for (const spec of requiredFirst) {
    const index = chosen[spec.key];
    const valid =
      typeof index === "number" &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < headers.length &&
      !used.has(index);
    mapping[spec.key] = valid ? index : null;
    if (valid) used.add(index);
  }
  return {
    mapping,
    missing: specs
      .filter((spec) => spec.required && mapping[spec.key] === null)
      .map((spec) => spec.key),
    unknown: headers
      .map((heading, index) => ({ index, heading }))
      .filter(({ index, heading }) => !used.has(index) && heading !== ""),
  };
}

/** Every row as cells by column key. A file none of whose headings is known is refused. */
export function cellsByColumn(
  table: SheetTable,
  mapping: ColumnMapping,
): { rowNumber: number; cells: Record<string, string> }[] {
  if (Object.values(mapping).every((index) => index === null)) {
    throw new ImportFileError("no_known_column");
  }
  return table.rows.map(({ number, cells }) => ({
    rowNumber: number,
    cells: Object.fromEntries(
      Object.entries(mapping).map(([key, index]) => [
        key,
        index === null ? "" : (cells[index] ?? ""),
      ]),
    ),
  }));
}

/** The template: the headings in one language and one example row (IMP-S1-26). */
export function templateRows(
  specs: readonly ColumnSpec[],
  locale: ImportLocale,
): string[][] {
  return [
    specs.map((spec) => spec.headers[locale]),
    specs.map((spec) => spec.example[locale]),
  ];
}
