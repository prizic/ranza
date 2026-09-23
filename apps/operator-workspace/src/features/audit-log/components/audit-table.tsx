"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, Undo2 } from "lucide-react";
import type { AuditPage } from "@ranza/core";
import {
  Button,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { isCorrection, readAs } from "../actions";
import { useAuditWords, whenLabel } from "../words";

/**
 * One page of the log, newest first.
 *
 * Presentational: it receives the page from the route, which got it through
 * the server funnel. Nothing here reaches the database, which ADR 0007
 * enforces for every path under `src/` that is not `src/server/`.
 *
 * Not the shared DataTable, on purpose. That table sorts, filters and pages
 * the rows it holds, and this page holds fifty of what may be thousands; a
 * client-side filter over it is exactly what made an older record look as if
 * it had never been written. Filters and pages here are URLs the server
 * answers (ADR 0031).
 *
 * Opening a row is a link rather than a click handler, so a record can be
 * bookmarked and sent to a colleague — and since it is read by id, the link
 * keeps working however many records are written after it.
 */
export function AuditTable({
  filtered,
  locale,
  newestHref,
  olderHref,
  page,
  recordHref,
  viewerId,
}: {
  /** Whether any filter narrowed this page — the empty state says which. */
  filtered: boolean;
  locale: SupportedLocale;
  /** The first page with the same filters, when this is not it. */
  newestHref: string | null;
  /** The next page, when there is one. */
  olderHref: string | null;
  page: AuditPage;
  /** The list URL that a row's link extends with `&record=`. */
  recordHref: string;
  viewerId: string;
}) {
  const t = useTranslations();
  const words = useAuditWords(page, viewerId);

  if (page.entries.length === 0 && !newestHref) {
    return (
      <div className="mt-6">
        {filtered ? (
          <EmptyState
            description={t("auditNoMatchesDescription")}
            title={t("auditNoMatchesTitle")}
          />
        ) : (
          <EmptyState
            description={t("noAuditDescription")}
            title={t("noAuditTitle")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      <p aria-live="polite" className="text-step--1 text-muted-foreground">
        {t("auditMatching", { n: page.total })}
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableCaption className="sr-only">{t("auditLog")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("when")}</TableHead>
              <TableHead>{t("what")}</TableHead>
              <TableHead>{t("auditWhere")}</TableHead>
              <TableHead>{t("who")}</TableHead>
              <TableHead>{t("why")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="align-top">
                  <time
                    className="whitespace-nowrap text-step--1 tabular-nums"
                    dateTime={entry.occurredAt.toISOString()}
                  >
                    {whenLabel(entry.occurredAt, locale, entry.timeZone)}
                  </time>
                </TableCell>
                <TableCell className="align-top">
                  <a
                    className="block hover:underline"
                    href={`${recordHref}&record=${entry.id}`}
                  >
                    {/* A correction is the row this screen exists for, so it
                        is said three ways — tone, icon and word — never by
                        colour alone (blueprint 18.5). */}
                    {isCorrection(readAs(entry.action, entry.subjectType)) ? (
                      <StatusBadge
                        icon={Undo2}
                        label={words.action(entry)}
                        tone="warning"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <CircleCheck
                          aria-hidden="true"
                          className="size-3.5 text-muted-foreground"
                        />
                        {words.action(entry)}
                      </span>
                    )}
                    <span
                      className="block text-step--1 text-muted-foreground"
                      title={entry.subjectId}
                    >
                      {words.subjectType(entry.subjectType)} ·{" "}
                      {words.name(entry.subjectId)}
                    </span>
                  </a>
                </TableCell>
                <TableCell className="align-top text-step--1">
                  {words.where(entry)}
                </TableCell>
                <TableCell className="align-top">
                  <span
                    className={
                      entry.actorId === viewerId
                        ? "font-medium"
                        : "text-step--1 break-all"
                    }
                    title={entry.actorId}
                  >
                    {words.actor(entry.actorId)}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  {entry.reason ? (
                    <span className="line-clamp-2 max-w-prose">
                      {entry.reason}
                    </span>
                  ) : (
                    // Most actions require no reason and the column must say
                    // so, or an empty cell reads as a reason somebody failed
                    // to give.
                    <span className="text-step--1 text-muted-foreground">
                      {t("noReason")}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-step--1 text-muted-foreground">
        {t("auditLocalTime")}
      </p>

      {newestHref || olderHref ? (
        <nav className="flex flex-wrap items-center justify-between gap-2">
          {newestHref ? (
            <Button asChild variant="outline">
              <a href={newestHref}>{t("auditNewest")}</a>
            </Button>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Button asChild variant="outline">
              <a href={olderHref}>{t("auditOlder")}</a>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
