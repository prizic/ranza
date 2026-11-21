import { isUtf8 } from "node:buffer";
import readXlsxFile from "read-excel-file/node";
import { IMPORT_LIMITS, ImportFileError, type SheetTable } from "./contracts";

/**
 * A file as rows of text (IMP-S1-17, IMP-S1-18).
 *
 * Nothing here knows what the columns mean. A spreadsheet's cell is turned to
 * the text a person would have typed, so one set of rules reads a workbook and
 * a csv alike: a date cell becomes `YYYY-MM-DD`, a whole number loses its
 * `.0`, and yes or no stay words.
 */

const DELIMITERS = [";", ",", "\t"] as const;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  return String(value).trim();
}

/** utf-8, or the code page Excel saves a Turkish csv in when it is not. */
function decode(bytes: Uint8Array): string {
  return new TextDecoder(isUtf8(bytes) ? "utf-8" : "windows-1254").decode(
    bytes,
  );
}

/** The delimiter the first line uses most, outside quotes. */
function delimiterOf(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  let quoted = false;
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  return DELIMITERS.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

/** RFC 4180, with the delimiter found above: quotes, doubled quotes, newlines in a cell. */
function parseDelimited(text: string): string[][] {
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((value) => value.trim()));
}

async function workbookRows(
  bytes: Uint8Array,
): Promise<{ rows: string[][]; sheetsIgnored: number }> {
  let sheets;
  try {
    sheets = await readXlsxFile(Buffer.from(bytes));
  } catch (cause) {
    // A protected workbook, or something named .xlsx that is not one.
    throw new ImportFileError("unreadable", { cause });
  }
  return {
    rows: (sheets[0]?.data ?? []).map((row) => row.map(cellText)),
    sheetsIgnored: Math.max(0, sheets.length - 1),
  };
}

export async function readTable(
  bytes: Uint8Array,
  fileName: string,
): Promise<SheetTable> {
  if (bytes.byteLength > IMPORT_LIMITS.bytes) {
    throw new ImportFileError("too_large");
  }
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "csv") {
    throw new ImportFileError("unsupported_type");
  }
  if (bytes.byteLength === 0) throw new ImportFileError("empty");

  const { rows: raw, sheetsIgnored } =
    extension === "xlsx"
      ? await workbookRows(bytes)
      : {
          rows: parseDelimited(decode(bytes).replace(/^\uFEFF/, "")),
          sheetsIgnored: 0,
        };

  const numbered = raw
    .map((cells, index) => ({ number: index + 1, cells }))
    .filter(({ cells }) => cells.some((value) => value !== ""));
  const [header, ...rows] = numbered;
  if (!header) throw new ImportFileError("empty");
  if (rows.length === 0) throw new ImportFileError("no_rows");
  if (rows.length > IMPORT_LIMITS.rows) {
    throw new ImportFileError("too_many_rows");
  }
  return { headers: header.cells, rows, sheetsIgnored };
}
