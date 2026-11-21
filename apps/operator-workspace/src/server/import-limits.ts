/**
 * The limits of guided import, for the upload form to state before a file is
 * sent and the detail to say how long rows are kept. They come through this
 * file because the dependency rules let only `src/server/` name a Ranza
 * package at runtime, and both are client components.
 */
export { IMPORT_LIMITS, IMPORT_RETENTION_DAYS } from "@ranza/imports/contracts";
