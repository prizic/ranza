/**
 * What to call a Staff Member: the name they signed up with, or the part of
 * their email before the @ when that is blank or is itself an address. Never
 * the whole address — a greeting is not the place to print one (TD-S1-31).
 */
export function displayName(
  name: string | null | undefined,
  email: string,
): string {
  const given = name?.trim() ?? "";
  if (given && !given.includes("@")) return given;
  return email.split("@")[0] ?? email;
}
