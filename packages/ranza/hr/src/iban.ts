import { HrInputError } from "./errors";

/**
 * An IBAN as it is stored: no spaces, upper case. Null for blank, because a
 * Staff Member paid in cash has none. Anything else that is not the shape of
 * one is refused here rather than written into a payslip.
 */
export function normalizeIban(value: string | null | undefined): string | null {
  const compact = (value ?? "").replace(/\s+/g, "").toUpperCase();
  if (compact === "") return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) {
    throw new HrInputError("iban");
  }
  return compact;
}

/**
 * What a screen may show of an IBAN: the country and the last four. The whole
 * number never leaves the server (HR-S1-30): its only reader would be a
 * payout, which is not built, and a number that is never sent cannot be read
 * out of a page, a log or a browser extension.
 */
export function maskIban(iban: string | null): string | null {
  if (iban === null) return null;
  const compact = iban.replace(/\s+/g, "");
  if (compact.length < 8) return "••••";
  return `${compact.slice(0, 2)}•• •••• •••• ${compact.slice(-4)}`;
}
