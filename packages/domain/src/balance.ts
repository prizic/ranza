export const balanceEntryTypes = [
  "charge",
  "external_payment",
  "credit",
  "adjustment",
  "reversal",
] as const;
export type BalanceEntryType = (typeof balanceEntryTypes)[number];
export type PostableBalanceEntryType = Exclude<BalanceEntryType, "reversal">;

const moneyPattern = /^([+-]?)(\d{1,12})(?:\.(\d{1,2}))?$/;

function parseMinorUnits(value: string): bigint {
  const match = moneyPattern.exec(value.trim());
  if (!match) throw new TypeError("money must have at most two decimal places");
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2] ?? "0");
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0"));
  return sign * (whole * 100n + fraction);
}

export function toSignedMinorUnits(
  type: PostableBalanceEntryType,
  amount: string,
): bigint {
  const parsed = parseMinorUnits(amount);
  if (parsed === 0n) throw new RangeError("amount must be non-zero");
  if (type === "adjustment") return parsed;
  if (parsed < 0n) throw new RangeError("amount must be positive");
  return type === "charge" ? parsed : -parsed;
}

export function remainingBalance(entries: readonly bigint[]): bigint {
  return entries.reduce((total, amount) => total + amount, 0n);
}

export function formatMinorUnits(amount: bigint): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
