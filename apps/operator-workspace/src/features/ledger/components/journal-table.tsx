"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
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
import { formatDate, formatMoney, localizeHref } from "@ranza/i18n";
import type { SupportedLocale } from "@ranza/i18n";
import type { JournalRow } from "../../../server/ledger";
import { ledgerHref, type LedgerSearch } from "../query";

/**
 * One page of the journal, newest first.
 *
 * Presentational: it receives the page from the route, which got it through the
 * server funnel (ADR 0007). Not the shared DataTable, for the audit log's
 * reason: that table sorts and filters the rows it holds, and this page holds
 * fifty of what may be thousands.
 *
 * Opening an entry is a link stretched over its row, so a row that lights up
 * under the pointer is a target and an entry can be sent to a colleague. The
 * Folio link in the row sits above it and stays its own.
 */
export function JournalTable({
  entries,
  filtered,
  newestHref,
  olderHref,
  route,
  propertyId,
  search,
}: {
  entries: readonly JournalRow[];
  filtered: boolean;
  /** The first page of what is being read; absent on it. */
  newestHref: string | null;
  olderHref: string | null;
  route: string;
  propertyId: string;
  search: LedgerSearch;
}) {
  const t = useTranslations("ledger");
  const locale = useLocale() as SupportedLocale;

  if (entries.length === 0 && !newestHref) {
    return (
      <div className="mt-6">
        <EmptyState
          description={t(filtered ? "noMatchDescription" : "emptyDescription")}
          title={t(filtered ? "noMatchTitle" : "emptyTitle")}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      <ScrollCue className="overflow-hidden rounded-lg border">
        <Table>
          <TableCaption className="sr-only">{t("journalTab")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("number")}</TableHead>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("source")}</TableHead>
              <TableHead className="text-end">{t("amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow className="relative" key={entry.id}>
                <TableCell className="tabular-nums">
                  {entry.entryNumber}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(entry.entryDate, locale, { timeZone: "UTC" })}
                </TableCell>
                <TableCell>
                  <Link
                    className="font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    href={ledgerHref(route, propertyId, {
                      ...search,
                      entry: entry.id,
                    })}
                    prefetch={false}
                  >
                    {entry.description}
                  </Link>
                </TableCell>
                <TableCell>
                  <SourceCell entry={entry} locale={locale} />
                </TableCell>
                <TableCell className="text-end whitespace-nowrap tabular-nums">
                  {formatMoney(entry.totalMinor, entry.currency, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollCue>

      {newestHref || olderHref ? (
        <nav className="flex items-center justify-between gap-2">
          {newestHref ? (
            <Button asChild variant="outline">
              <Link href={newestHref} prefetch={false}>
                {t("newest")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Button asChild variant="outline">
              <Link href={olderHref} prefetch={false}>
                {t("older")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/** What an entry came from, as a link to the Folio when the viewer may open it. */
function SourceCell({
  entry,
  locale,
}: {
  entry: JournalRow;
  locale: SupportedLocale;
}) {
  const t = useTranslations("ledger");
  const label =
    entry.sourceType === "folio_line" ? t("sourceFolioLine") : entry.sourceType;
  return entry.folio ? (
    <Link
      className="relative z-10 text-muted-foreground hover:text-foreground hover:underline"
      href={`${localizeHref(locale, "finance")}?property=${entry.folio.propertyId}&folio=${entry.folio.folioId}`}
      prefetch={false}
    >
      {label}
    </Link>
  ) : (
    <span className="text-muted-foreground">{label}</span>
  );
}
