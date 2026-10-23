/**
 * What to call a Staff Member where only their email is known.
 *
 * An account carries no display name (blueprint 4.4: identity is the email), so
 * the part before the `@` is the name a colleague would use: `maria.demir@…`
 * reads "Maria Demir". The full address stays available to the reader as a
 * secondary line or tooltip; it is never the first thing a board shows.
 */
export function staffName(email: string | null, fallback: string): string {
  if (email === null) return fallback;
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._\-+\s]+/).filter((word) => word !== "");
  if (words.length === 0) return email;
  return words
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");
}
