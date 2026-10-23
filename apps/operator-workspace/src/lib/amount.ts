/**
 * An amount as a person types it, and back. Integer arithmetic only: the
 * digits after the separator are padded or split, never multiplied as a float
 * (ADR 0015). How many a currency has is Intl's to say — 2 for TRY, 3 for KWD,
 * 0 for JPY — not an assumed two.
 */

/** How many minor units a currency has, or null for a code that is not one. */
export function minorDigits(currency: string): number | null {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch (error: unknown) {
    // A malformed code — a hand-made post, not a Folio's — is not an amount.
    if (error instanceof RangeError) return null;
    throw error;
  }
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

/**
 * Why a typed amount is not one, so a refusal can say what to change.
 *
 * `format` is not a number at all, `decimals` has more places than the
 * currency has, `size` is past what a bill can hold.
 */
export type AmountFault = "format" | "decimals" | "size";

export type ParsedAmount =
  { ok: true; minor: number } | { ok: false; fault: AmountFault };

const UNGROUPED = /^(\d{1,12})(?:[.,](\d+))?$/;

/** The character a locale groups thousands with, as ASCII. */
function groupSeparatorOf(locale: string): string {
  const found =
    new Intl.NumberFormat(locale)
      .formatToParts(1234567.5)
      .find((part) => part.type === "group")?.value ?? "";
  return found === "\u066c" ? "," : found;
}

/** `1,250` or `1.250.000`: groups of three after a head of one to three digits. */
function isGrouped(digits: string, separator: string): boolean {
  return new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`).test(digits);
}

/**
 * Splits a typed amount into whole and fractional digits.
 *
 * Without a locale a single `.` or `,` is the decimal point and grouping is
 * not accepted. With one, the characters that locale groups with are read as
 * grouping when they sit in threes ("1,250.00" in English, "1.250,00" in
 * Turkish), and a lone separator that could be either is read by the locale:
 * "1.250" is one thousand two hundred and fifty lira in Turkish and a refused
 * three-place amount in English. Whatever the locale, the later of two
 * different separators is the decimal point.
 */
function splitTyped(
  typed: string,
  locale: string | undefined,
): { whole: string; fraction: string } | null {
  const cleaned = typed.replace(/[\s\u00a0\u202f']/g, "");
  if (locale === undefined) {
    const match = UNGROUPED.exec(cleaned);
    return match ? { whole: match[1] ?? "0", fraction: match[2] ?? "" } : null;
  }
  const ascii = cleaned.replace(/\u066c/g, ",");
  if (!/^[\d.,]+$/.test(ascii)) return null;
  const group = groupSeparatorOf(locale);
  const lastDot = ascii.lastIndexOf(".");
  const lastComma = ascii.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const groupSeparator = decimalAt === lastDot ? "," : ".";
    const head = ascii.slice(0, decimalAt);
    const fraction = ascii.slice(decimalAt + 1);
    const grouped = isGrouped(head, groupSeparator);
    return grouped && /^\d+$/.test(fraction)
      ? { whole: head.split(groupSeparator).join(""), fraction }
      : null;
  }
  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
  if (separator === "") return { whole: ascii, fraction: "" };
  if (
    isGrouped(ascii, separator) &&
    (ascii.split(separator).length > 2 || separator === group)
  ) {
    return { whole: ascii.split(separator).join(""), fraction: "" };
  }
  const match = UNGROUPED.exec(ascii);
  return match ? { whole: match[1] ?? "0", fraction: match[2] ?? "" } : null;
}

/**
 * An amount as a person types it, with the reason when it is not one.
 *
 * `locale` is the language of the screen it was typed on; leave it out where
 * only a plain `450.50` or `450,50` is expected.
 */
export function parseAmount(
  value: string,
  currency: string,
  locale?: string,
): ParsedAmount {
  const digits = minorDigits(currency);
  if (digits === null) return { ok: false, fault: "format" };
  const split = splitTyped(asciiDigits(value.trim()), locale);
  if (!split || split.whole.length > 12) {
    return { ok: false, fault: split ? "size" : "format" };
  }
  if (split.fraction.length > digits) return { ok: false, fault: "decimals" };
  const minor = Number(split.whole + split.fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(minor)
    ? { ok: true, minor }
    : { ok: false, fault: "size" };
}

/** `450`, `450.5`, `450,50`, `٤٥٠٫٥` in whole minor units of `currency`, or null. */
export function toMinorUnits(
  value: string,
  currency: string,
  locale?: string,
): number | null {
  const parsed = parseAmount(value, currency, locale);
  return parsed.ok ? parsed.minor : null;
}

/** Whole minor units as a person would type them: 45050 TRY is `450.5`. */
export function toTypedAmount(minor: number, currency: string): string {
  // Always a currency the database holds, so one that is not is a defect.
  const digits = minorDigits(currency);
  if (digits === null) throw new RangeError(`${currency} is not a currency`);
  if (digits === 0) return String(minor);
  const padded = String(minor).padStart(digits + 1, "0");
  const fraction = padded.slice(-digits).replace(/0+$/, "");
  const whole = padded.slice(0, -digits);
  return fraction === "" ? whole : `${whole}.${fraction}`;
}
