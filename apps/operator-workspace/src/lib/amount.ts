/**
 * An amount as a person types it, and back. Integer arithmetic only: the
 * digits after the separator are padded or split, never multiplied as a float
 * (ADR 0015). How many a currency has is Intl's to say — 2 for TRY, 3 for KWD,
 * 0 for JPY — not an assumed two.
 */

function minorDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * Digits as an Arabic keyboard types them — Arabic-Indic, or the Eastern
 * forms Persian and Urdu use — and the Arabic decimal separator, as ASCII. A
 * regex `\d` is ASCII only, and `inputMode="decimal"` offers these.
 */
function asciiDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, ".");
}

/** `450`, `450.5`, `450,50`, `٤٥٠٫٥` in whole minor units of `currency`, or null. */
export function toMinorUnits(value: string, currency: string): number | null {
  const digits = minorDigits(currency);
  const match = /^(\d{1,12})(?:[.,](\d+))?$/.exec(asciiDigits(value.trim()));
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  if (fraction.length > digits) return null;
  const minor = Number(whole + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Whole minor units as a person would type them: 45050 TRY is `450.5`. */
export function toTypedAmount(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(minor);
  const padded = String(minor).padStart(digits + 1, "0");
  const fraction = padded.slice(-digits).replace(/0+$/, "");
  const whole = padded.slice(0, -digits);
  return fraction === "" ? whole : `${whole}.${fraction}`;
}
