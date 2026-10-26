"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  EmptyState,
  ScrollCue,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { formatMoney } from "@ranza/i18n";
import type { SupportedLocale } from "@ranza/i18n";
import type { AccountsView } from "../../../server/ledger";
import { accountLabel, useAccountNames } from "../account-names";

/**
 * The chart of accounts with what each holds, in one currency.
 *
 * Amounts in different currencies are never added, so a ledger in several is
 * read one at a time and the currency is said above the table (ACC-S3-05).
 */
export function AccountsTable({
  currency,
  view,
}: {
  /** The currency the balances are in. */
  currency: string | undefined;
  view: AccountsView;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale() as SupportedLocale;
  const translatedNames = useAccountNames();

  if (view.balances.length === 0 || !currency) {
    return (
      <div className="mt-6">
        <EmptyState
          description={t("accountsEmptyDescription")}
          title={t("accountsEmptyTitle")}
        />
      </div>
    );
  }

  const money = (minor: number) => formatMoney(minor, currency, locale);
  return (
    <div className="mt-6 grid gap-3">
      <p className="text-step--1 text-muted-foreground">
        {t("inCurrency", { currency })}
      </p>
      <ScrollCue className="overflow-hidden rounded-lg border">
        <Table>
          <TableCaption className="sr-only">{t("accountsTab")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accountCode")}</TableHead>
              <TableHead>{t("accountName")}</TableHead>
              <TableHead>{t("accountType")}</TableHead>
              <TableHead className="text-end">{t("debits")}</TableHead>
              <TableHead className="text-end">{t("credits")}</TableHead>
              <TableHead className="text-end">{t("balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.balances.map((balance) => (
              <TableRow key={balance.accountId}>
                <TableCell className="tabular-nums">
                  {balance.accountCode}
                </TableCell>
                <TableCell>
                  {accountLabel(
                    { code: balance.accountCode, name: balance.accountName },
                    translatedNames,
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(`types.${balance.accountType}`)}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {money(balance.debitMinor)}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {money(balance.creditMinor)}
                </TableCell>
                <TableCell className="text-end font-medium tabular-nums">
                  {money(balance.netBalanceMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollCue>
    </div>
  );
}
