export const leadConsentVersion = "2026-09-06";
export type LeadLanguage = "tr" | "en" | "ar";
export type LeadStatus = "new" | "contacted" | "qualified" | "closed";
export interface LeadInput {
  name: string;
  contact: string;
  operator: string;
  beds: number;
  city: string;
  language: LeadLanguage;
  message: string;
}
export type LeadErrors = Record<
  string,
  "required" | "contact" | "beds" | "consent" | "length"
>;
export function validateLead(
  input: unknown,
): { ok: true; value: LeadInput } | { ok: false; errors: LeadErrors } {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const errors: LeadErrors = {};
  const string = (key: string, max: number, required = true) => {
    const value = typeof raw[key] === "string" ? raw[key].trim() : "";
    if (required && !value) errors[key] = "required";
    else if (
      value.length > max ||
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      })
    )
      errors[key] = "length";
    return value;
  };
  const name = string("name", 100),
    contact = string("contact", 200),
    operator = string("operator", 160),
    city = string("city", 100),
    message = string("message", 2000, false);
  if (
    contact &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) &&
    !/^\+?[\d ()-]{7,30}$/.test(contact)
  )
    errors.contact = "contact";
  const beds =
    typeof raw.beds === "string" && /^\d{1,6}$/.test(raw.beds)
      ? Number(raw.beds)
      : NaN;
  if (!Number.isInteger(beds) || beds < 1 || beds > 100000)
    errors.beds = "beds";
  const language = raw.language;
  if (language !== "tr" && language !== "en" && language !== "ar")
    errors.language = "required";
  if (raw.consent !== true) errors.consent = "consent";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      contact,
      operator,
      beds,
      city,
      language: language as LeadLanguage,
      message,
    },
  };
}
