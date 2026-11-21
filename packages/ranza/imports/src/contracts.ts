/**
 * The most one file may hold (IMP-S1-18). Two megabytes because the file
 * travels in a server action, whose body the workspace caps at four: a file
 * over the cap fails in transit with an error nobody can read as a reason, so
 * the limit sits well under it and is said before the file is sent.
 */
export const IMPORT_LIMITS = { bytes: 2 * 1024 * 1024, rows: 2000 } as const;

/** How many rows one request imports before answering (IMP-S1-11). */
export const IMPORT_BATCH = 20;

/** How long the rows of an import are kept (IMP-S1-15). */
export const IMPORT_RETENTION_DAYS = 7;

export const RUN_IMPORT_PERMISSION = "import.run";

/** The worker's job name, for the context it sets and the log it writes. */
export const SWEEP_IMPORTS_JOB = "imports.sweep";

export const IMPORT_KINDS = ["rooms", "people"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_LOCALES = ["tr", "en", "ar"] as const;
export type ImportLocale = (typeof IMPORT_LOCALES)[number];

export type ImportStatus = "staged" | "importing" | "finished" | "discarded";

/** What a preview can say of a row. */
export type StagedRowState = "ready" | "wrong" | "skipped";

/** What a commit can say of a ready row, or a close of one nobody reached. */
export type SettledRowState = "imported" | "skipped" | "refused";

export type RowState = StagedRowState | SettledRowState | "left";

/** Why a file cannot be an import at all (IMP-S1-18). */
export type FileRefusal =
  | "unsupported_type"
  | "too_large"
  | "unreadable"
  | "empty"
  | "no_rows"
  | "too_many_rows"
  | "no_known_column";

export class ImportFileError extends Error {
  constructor(
    public readonly reason: FileRefusal,
    options?: ErrorOptions,
  ) {
    super(`that file cannot be imported: ${reason}`, options);
    this.name = "ImportFileError";
  }
}

/** The caller may not import here, or the import is not theirs to move. */
export class ImportRefusedError extends Error {
  constructor(message = "that import is out of reach") {
    super(message);
    this.name = "ImportRefusedError";
  }
}

/** The import is not in a state that allows the move asked for. */
export class ImportStateError extends Error {
  constructor(message = "that import cannot move so") {
    super(message);
    this.name = "ImportStateError";
  }
}

/** Another import is running at the Property (IMP-S1-07). */
export class ImportAlreadyRunningError extends Error {
  constructor() {
    super("another import is running at this Property");
    this.name = "ImportAlreadyRunningError";
  }
}

/** A file as rows of text, whatever it was on disk. */
export interface SheetTable {
  headers: readonly string[];
  /** `number` is the row's own in the file, the header being 1. */
  rows: readonly { number: number; cells: readonly string[] }[];
  /** Sheets after the first, which are not read (IMP-S1-18). */
  sheetsIgnored: number;
}

/** A column a kind of import knows, in every language it is headed in. */
export interface ColumnSpec {
  key: string;
  required: boolean;
  headers: Record<ImportLocale, string>;
  /** Other headings people use for it, already normalized. */
  aliases: readonly string[];
  example: Record<ImportLocale, string>;
}

/** For each column key, the index of the file's column that feeds it. */
export type ColumnMapping = Readonly<Record<string, number | null>>;

/** One cell that is wrong, as a code the screen words in the viewer's language. */
export interface RowProblem {
  column: string;
  code: string;
}

export interface StagedRow {
  rowNumber: number;
  state: StagedRowState;
  cells: Readonly<Record<string, string>>;
  problems: readonly RowProblem[];
}

export interface NewImport {
  propertyId: string;
  kind: ImportKind;
  fileName: string;
  rows: readonly StagedRow[];
}

export interface ImportCounts {
  ready: number;
  wrong: number;
  skipped: number;
  imported: number;
  refused: number;
  left: number;
}

export interface ImportSummary {
  id: string;
  propertyId: string;
  kind: ImportKind;
  status: ImportStatus;
  fileName: string;
  uploadedBy: string;
  /** Null when the reader may not read that person. */
  uploaderEmail: string | null;
  /** Whether the reader is the one who uploaded it, and so reads its rows. */
  mine: boolean;
  createdAt: Date;
  closedAt: Date | null;
  rowsForgotten: boolean;
  counts: ImportCounts;
}

export interface ImportRow {
  rowNumber: number;
  state: RowState;
  cells: Readonly<Record<string, string>>;
  problems: readonly RowProblem[];
  outcome: string | null;
}

export interface ImportDetail extends ImportSummary {
  /** Empty for anybody but the uploader, and once the rows are forgotten. */
  rows: readonly ImportRow[];
}

export interface RowOutcome {
  state: SettledRowState;
  /** A code for why, when it was not simply imported. */
  outcome?: string | null;
  /** The record the row made. */
  resultId?: string | null;
}

export interface SweepImportsReport {
  due: number;
  forgotten: number;
  failures: { importId: string; error: unknown }[];
}
