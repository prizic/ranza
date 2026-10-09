/**
 * Turning rows into a file. Pure, so what ends up in a downloaded CSV is
 * decided by a function with tests rather than by a query.
 *
 * Every cell that is text can be typed by somebody who is not the exporter — a
 * Guest's name, a Folio line's description, a room's reason — and a spreadsheet
 * runs a cell that starts with `=`, `+`, `-` or `@` as a formula. A cell
 * starting a tab or a carriage return is read the same way by some of them. So
 * a text cell that starts with one of those is written with a leading
 * apostrophe, which every spreadsheet reads as "this is text" and displays
 * without. Numbers are never touched: a reversal's `-5000` is an amount and not
 * a formula, and prefixing it would make the file wrong.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Excel reads UTF-8 only when told to; a Turkish or Arabic name is not ANSI. */
const BYTE_ORDER_MARK = "\uFEFF";

/** One dataset's worth of rows, with the columns it is written in. */
export interface Dataset {
  key: string;
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
}

/** A value as the JSON file carries it: no BigInt, and instants as ISO text. */
export function plainValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

/** One cell of a CSV, guarded and quoted. */
export function csvCell(value: unknown): string {
  const plain = plainValue(value);
  if (plain === null) return "";
  if (typeof plain === "number" || typeof plain === "boolean") {
    return String(plain);
  }
  const text = typeof plain === "string" ? plain : JSON.stringify(plain);
  const guarded = FORMULA_TRIGGER.test(text) ? `'${text}` : text;
  return NEEDS_QUOTES.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

function csvSection(dataset: Dataset): string {
  const lines = [dataset.columns.map(csvCell).join(",")];
  for (const row of dataset.rows) {
    lines.push(dataset.columns.map((column) => csvCell(row[column])).join(","));
  }
  return lines.join("\r\n");
}

/**
 * A CSV file. One dataset is a plain CSV a tool can read at once. Several are
 * stacked in one file, each under a `# dataset: name` line and a blank line
 * between: a CSV cannot hold two tables, and a file per dataset needs a
 * container this does not have yet (ADR 0043).
 */
export function renderCsv(datasets: readonly Dataset[]): string {
  const sections = datasets.map((dataset) =>
    datasets.length > 1
      ? `# dataset: ${dataset.key}\r\n${csvSection(dataset)}`
      : csvSection(dataset),
  );
  return `${BYTE_ORDER_MARK}${sections.join("\r\n\r\n")}\r\n`;
}

/** A JSON file: an object with one array of rows per dataset. */
export function renderJson(datasets: readonly Dataset[]): string {
  const body: Record<string, unknown[]> = {};
  for (const dataset of datasets) {
    body[dataset.key] = dataset.rows.map((row) =>
      Object.fromEntries(
        dataset.columns.map((column) => [column, plainValue(row[column])]),
      ),
    );
  }
  return JSON.stringify(body, null, 2);
}
