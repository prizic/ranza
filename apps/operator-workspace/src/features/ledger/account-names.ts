import { useTranslations } from "next-intl";

/**
 * The standard chart's English names as the database writes them
 * (`finance.ensure_default_accounts`), keyed by code.
 *
 * An account is shown in the viewer's language only while it still carries the
 * name it shipped with: an account an Organization named itself reads as it was
 * written (nothing edits the chart yet, ACC-DEF-03, so this is a guard and not
 * a case).
 */
const SHIPPED: Readonly<Record<string, string>> = {
  "1000": "Cash on Hand",
  "1010": "Bank Account",
  "1020": "Payment Card Clearing",
  "1200": "Accounts Receivable",
  "4000": "Accommodation Revenue",
  "4100": "Other Revenue",
};

export function accountLabel(
  account: { code: string; name: string },
  translated: Readonly<Record<string, string>>,
): string {
  return SHIPPED[account.code] === account.name
    ? (translated[account.code] ?? account.name)
    : account.name;
}

/** The shipped chart's names in the viewer's language, by account code. */
export function useAccountNames(): Readonly<Record<string, string>> {
  const t = useTranslations("ledger.accountNames");
  return Object.fromEntries(
    Object.keys(SHIPPED).map((code) => [code, t(code)]),
  );
}
