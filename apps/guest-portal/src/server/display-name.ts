/**
 * What to call a signed-in Resident: the name on the account, or the part of
 * their email before the @ when that is blank or is itself an address. Never
 * the whole address as a name — the account menu prints the address beneath
 * the name, and the same text twice says nothing (PORTAL-09).
 *
 * The Workspace keeps the same rule in `server/display-name.ts` of its own
 * application; the two applications share a vocabulary, not source files.
 */
export function displayName(
  name: string | null | undefined,
  email: string,
): string {
  const given = name?.trim() ?? "";
  if (given && !given.includes("@")) return given;
  return email.split("@")[0] ?? email;
}
