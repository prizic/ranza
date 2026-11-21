"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import {
  IMPORT_LIMITS,
  type ColumnMapping,
  type FileRefusal,
  type ImportDetail,
  type ImportStatus,
  type ImportSummary,
} from "@ranza/imports";
import { getComposition } from "./composition";
import { createImportRun } from "./import-run";
import { currentViewer } from "./viewer";

/**
 * Server actions and reads for guided import (IMP-S1-*, ADR 0065).
 *
 * Every one runs as the signed-in Staff Member. What they may import, and
 * every room an import adds, is decided by the database under that session;
 * nothing here holds a permission of its own.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a preview came to, as data the screen words in the reader's language. */
export type PreviewOutcome =
  | { status: "idle" }
  | {
      status: "needsMapping";
      headers: readonly string[];
      mapping: ColumnMapping;
      missing: readonly string[];
    }
  | { status: "refusedFile"; reason: FileRefusal }
  | { status: "notPermitted" }
  | { status: "error" };

/** What moving an import came to. `stale`: it had already moved on. */
export type ImportMoveOutcome =
  | { status: ImportStatus }
  | { status: "alreadyRunning" | "stale" | "notPermitted" | "error" };

/** By name and not `instanceof`: an action is bundled apart from the page. */
function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function importRun() {
  const composition = getComposition();
  return createImportRun({
    imports: composition.imports,
    accommodation: composition.accommodation,
    operatingModel: (userId, propertyId) =>
      composition.core.operatingModel(userId, propertyId),
    report: (event, context, error) => console.error(event, context, error),
  });
}

function revalidate(locale: string): void {
  revalidatePath(`/${locale}/import`);
  revalidatePath(`/${locale}/rooms`);
}

/**
 * The columns a person chose, from the form: one `map.<column>` field each,
 * holding the index of the file's column or nothing. Absent when the form sent
 * none, so the headings decide.
 */
function chosenFrom(form: FormData): Record<string, number | null> | undefined {
  const chosen: Record<string, number | null> = {};
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("map.") || typeof value !== "string") continue;
    chosen[name.slice(4)] = /^\d+$/.test(value) ? Number(value) : null;
  }
  return Object.keys(chosen).length > 0 ? chosen : undefined;
}

/**
 * Reads the uploaded file and records the preview, then opens it. When a
 * required column has no heading that names it, answers with the headings so
 * the person can say which is which; the browser still holds the file and
 * sends it again with the answer, so nothing is kept here in between.
 */
export async function previewImport(
  _previous: PreviewOutcome,
  form: FormData,
): Promise<PreviewOutcome> {
  const viewer = await currentViewer();
  const locale = form.get("locale");
  const propertyId = form.get("propertyId");
  const file = form.get("file");
  if (
    !viewer ||
    typeof locale !== "string" ||
    !isSupportedLocale(locale) ||
    typeof propertyId !== "string" ||
    !UUID.test(propertyId)
  ) {
    return { status: "notPermitted" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: "refusedFile", reason: "empty" };
  }
  if (file.size > IMPORT_LIMITS.bytes) {
    return { status: "refusedFile", reason: "too_large" };
  }

  let importId: string;
  let sheetsIgnored: number;
  try {
    const preview = await importRun().previewRooms(viewer.userId, {
      propertyId,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      chosen: chosenFrom(form),
    });
    if (preview.status === "needsMapping") return preview;
    importId = preview.importId;
    sheetsIgnored = preview.sheetsIgnored;
  } catch (error: unknown) {
    if (isNamed(error, "ImportFileError")) {
      return {
        status: "refusedFile",
        reason: (error as unknown as { reason: FileRefusal }).reason,
      };
    }
    if (isNamed(error, "ImportRefusedError")) return { status: "notPermitted" };
    console.error(
      "import.preview_failed",
      { propertyId, userId: viewer.userId },
      error,
    );
    return { status: "error" };
  }
  revalidate(locale);
  // `record` is the page bar's word for a detail view, so its back button
  // returns to the list of imports and not to Today (ADR 0035).
  redirect(
    `${localizeHref(locale, "import")}?property=${propertyId}&record=${importId}${
      sheetsIgnored > 0 ? `&sheets=${sheetsIgnored}` : ""
    }`,
  );
}

async function move(
  event: string,
  importId: string,
  locale: string,
  run: (userId: string) => Promise<ImportStatus>,
): Promise<ImportMoveOutcome> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(importId) || !isSupportedLocale(locale)) {
    return { status: "notPermitted" };
  }
  try {
    const status = await run(viewer.userId);
    revalidate(locale);
    return { status };
  } catch (error: unknown) {
    revalidate(locale);
    if (isNamed(error, "ImportAlreadyRunningError")) {
      return { status: "alreadyRunning" };
    }
    if (isNamed(error, "ImportStateError")) return { status: "stale" };
    if (isNamed(error, "ImportRefusedError")) return { status: "notPermitted" };
    console.error(event, { importId, userId: viewer.userId }, error);
    return { status: "error" };
  }
}

/** Starts a previewed import and imports its first rows. */
export async function startImport(
  importId: string,
  locale: string,
): Promise<ImportMoveOutcome> {
  return move("import.start_failed", importId, locale, async (userId) => {
    await getComposition().imports.startImport(userId, importId);
    return importRun().importNext(userId, importId);
  });
}

/** Imports the next rows; the page asks again while the answer is `importing`. */
export async function continueImport(
  importId: string,
  locale: string,
): Promise<ImportMoveOutcome> {
  return move("import.continue_failed", importId, locale, (userId) =>
    importRun().importNext(userId, importId),
  );
}

export async function stopImport(
  importId: string,
  locale: string,
): Promise<ImportMoveOutcome> {
  return move("import.stop_failed", importId, locale, async (userId) => {
    await getComposition().imports.stopImport(userId, importId);
    return "finished";
  });
}

export async function discardImport(
  importId: string,
  locale: string,
): Promise<ImportMoveOutcome> {
  return move("import.discard_failed", importId, locale, async (userId) => {
    await getComposition().imports.discardImport(userId, importId);
    return "discarded";
  });
}

/**
 * A Property's imports, newest first. A failure is the page's, not an empty
 * list: a list that reads empty when the database is down says nobody imported
 * anything.
 */
export async function listImports(
  propertyId: string,
): Promise<ImportSummary[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().imports.listImports(viewer.userId, propertyId);
}

/** One import of this Property, or null when it is not one the viewer may read here. */
export async function importDetail(
  propertyId: string,
  importId: string,
): Promise<ImportDetail | null> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(importId)) return null;
  const detail = await getComposition().imports.getImport(
    viewer.userId,
    importId,
  );
  return detail?.propertyId === propertyId ? detail : null;
}
