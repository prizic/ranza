/**
 * A catalogue with an overlay's strings in place of its own. A new object
 * wherever the overlay reaches and the base's own objects everywhere else, so
 * nothing the overlay does not name is copied, and the base is never changed.
 */
export function withOverlay<T extends object>(base: T, overlay: object): T {
  const merged: Record<string, unknown> = { ...(base as object) };
  for (const [key, value] of Object.entries(overlay)) {
    const own = merged[key];
    merged[key] =
      typeof value === "object" && value !== null && typeof own === "object"
        ? withOverlay(own as object, value)
        : value;
  }
  return merged as T;
}
