"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { formatDate, formatMoney, localizeHref } from "@ranza/i18n";
import type { SupportedLocale } from "@ranza/i18n";
import type { EntryView } from "../../../server/ledger";
import { accountLabel, useAccountNames } from "../account-names";

/**
 * One entry: when it is for, what it came from and the lines that balance it.
 *
 * The way back is the page bar's back button (`entry` is one of its detail
 * keys, ADR 0035), which keeps the filters the reader came from.
 */
export function EntryPanel({
  timeZone,
  view,
}: {
  /** The opened Property's zone, which the time of posting is read in. */
  timeZone: string;
  view: EntryView;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale() as SupportedLocale;
  const translatedNames = useAccountNames();
  const { entry, folio } = view;
  const money = (minor: number) => formatMoney(minor, entry.currency, locale);
  const debits = entry.lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const credits = entry.lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + line.amountMinor, 0);

  return (
    <article className="mt-6 grid gap-6">
      <header className="grid gap-1">
        <h2 className="text-step-2 font-semibold">
          {t("entryTitle", { number: entry.entryNumber })}
        </h2>
        <p className="text-muted-foreground">{entry.description}</p>
      </header>

      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("entryDate")}>
          {formatDate(entry.entryDate, locale, { timeZone: "UTC" })}
        </Fact>
        <Fact label={t("postedAt")}>
          {formatDate(entry.postedAt, locale, {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Fact>
        <Fact label={t("currency")}>{entry.currency}</Fact>
        <Fact label={t("entrySource")}>
          {entry.sourceType === "folio_line"
            ? t("sourceFolioLine")
            : entry.sourceType}
          {folio ? (
            <>
              {" · "}
              <Link
                className="underline-offset-2 hover:underline"
                href={`${localizeHref(locale, "finance")}?property=${folio.propertyId}&folio=${folio.folioId}`}
                prefetch={false}
              >
                {t("openFolio")}
              </Link>
            </>
          ) : entry.sourceType === "folio_line" ? (
            <span className="block text-muted-foreground">
              {t("folioNotOpenable")}
            </span>
          ) : null}
        </Fact>
      </dl>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableCaption className="sr-only">
            {t("entryTitle", { number: entry.entryNumber })}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accountColumn")}</TableHead>
              <TableHead className="text-end">{t("debit")}</TableHead>
              <TableHead className="text-end">{t("credit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <span className="tabular-nums text-muted-foreground">
                    {line.accountCode}
                  </span>{" "}
                  {accountLabel(
                    { code: line.accountCode, name: line.accountName },
                    translatedNames,
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {line.direction === "debit" ? money(line.amountMinor) : null}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {line.direction === "credit" ? money(line.amountMinor) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-muted-foreground">
                {debits === credits
                  ? t("balanced", { amount: money(debits) })
                  : null}
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {money(debits)}
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {money(credits)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </article>
  );
}

function Fact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
