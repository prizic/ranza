export interface StudentDraft {
  displayName: string;
  preferredLocale: "tr" | "en" | "ar";
  externalReference: string | null;
}

export function parseStudentDraft(input: unknown): StudentDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Student details are required");
  }
  const value = input as Record<string, unknown>;
  const displayName =
    typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > 120)
    throw new RangeError("Student name must contain 2–120 characters");
  const locale = value.preferredLocale;
  if (locale !== "tr" && locale !== "en" && locale !== "ar")
    throw new RangeError("Unsupported Student language");
  if (
    value.externalReference != null &&
    typeof value.externalReference !== "string"
  )
    throw new TypeError("External reference must be text");
  const externalReference =
    typeof value.externalReference === "string"
      ? value.externalReference.trim() || null
      : null;
  if (externalReference && externalReference.length > 120)
    throw new RangeError("External reference is too long");
  return { displayName, preferredLocale: locale, externalReference };
}
