export const balanceExportHeaders = [
  "account_id",
  "student_id",
  "student_name",
  "currency",
  "remaining_balance",
  "entry_id",
  "entry_type",
  "amount",
  "effective_date",
  "due_date",
  "reversal_of",
  "created_by",
  "created_at",
  "description",
] as const;

export type BalanceExportHeader = (typeof balanceExportHeaders)[number];
export type BalanceExportRow = Record<BalanceExportHeader, string>;

function csvCell(value: string): string {
  const safe =
    /^[=+@-]/.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value)
      ? `'${value}`
      : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function buildBalanceExportCsv(
  rows: readonly BalanceExportRow[],
): string {
  return [
    balanceExportHeaders.join(","),
    ...rows.map((row) =>
      balanceExportHeaders.map((header) => csvCell(row[header])).join(","),
    ),
    "",
  ].join("\r\n");
}
