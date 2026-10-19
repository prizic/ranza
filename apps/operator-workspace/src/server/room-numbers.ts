/**
 * How a batch of rooms is named, for the Add rooms form to preview.
 *
 * The functions are pure and the module writes with these very ones. They come
 * through this file because the dependency rules let only `src/server/` name a
 * Ranza package at runtime, and the form is a client component.
 */
export { bedLetters, roomNumbers } from "@ranza/accommodation/numbering";
