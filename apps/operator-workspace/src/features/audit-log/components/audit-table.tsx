"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleCheck, Undo2 } from "lucide-react";
import type { AuditEntry, AuditPage } from "@ranza/core";
import {
  Button,
  EmptyState,
  ScrollCue,
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
import { expectsReason, isCorrection, readAs } from "../actions";
import { historyHref, subjectHref, type SubjectReach } from "../links";
import { useAuditSummary } from "../summary";
import { useAuditWords, whenLabel, zoneName, type AuditWords } from "../words";

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
 * keeps working however many records are written after it. The link is
 * stretched over its whole row, because a row that lights up under the pointer
 * is read as a target and only its title was one (DATA-03); the row's other
 * links sit above it and stay their own.
 *
 * Below `sm` a row is a block of its own: what happened, when, who did it and,
 * when there is one, why. Five columns do not fit a phone, and the reason is
 * the cell a manager opens the log on a phone to read (DATA-06).
 */
const STACKED_ROW = "max-sm:grid max-sm:gap-1 max-sm:p-3";
const STACKED_CELL = "max-sm:block max-sm:p-0 max-sm:whitespace-normal";
const LABELLED_CELL =
  "max-sm:before:me-1 max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

export function AuditTable({
  filtered,
  locale,
  newestHref,
  olderHref,
  opened,
  page,
  propertyId,
  reach,
  recordHref,
  today,
  viewerId,
}: {
  /** Whether any filter narrowed this page — the empty state says which. */
  filtered: boolean;
  locale: SupportedLocale;
  /** The first page with the same filters, when this is not it. */
  newestHref: string | null;
  /** The next page, when there is one. */
  olderHref: string | null;
  /** The Property the log is opened from: its clock reads the records about the whole Organization. */
  opened: { name: string; timezone: string };
  page: AuditPage;
  /** The Property the log is opened from, which every link keeps. */
  propertyId: string;
  /** Which of the screens a subject opens in the viewer may open. */
  reach: SubjectReach;
  /** The list URL that a row's link extends with `&record=`. */
  recordHref: string;
  /** The opened Property's day, `YYYY-MM-DD`: a time this year needs no year. */
  today: string;
  viewerId: string;
}) {
  const t = useTranslations();
  const words = useAuditWords(page, viewerId);
  const summaryOf = useAuditSummary(words, locale);
  // One clock for the whole list is said once, in the column's heading; a list
  // that spans Properties in two zones says each time's own instead (AUDIT-10).
  const zones = [...new Set(page.entries.map((entry) => entry.timeZone))];
  const [onlyZone] = zones;
  const clock = oneClock(page.entries, onlyZone, opened, locale, words);
  const year = today.slice(0, 4);

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

      <ScrollCue className="overflow-hidden rounded-lg border">
        <Table>
          <TableCaption className="sr-only">{t("auditLog")}</TableCaption>
          <TableHeader className="max-sm:hidden">
            <TableRow>
              <TableHead>
                {clock
                  ? t("auditWhenIn", { clock })
                  : zones.length > 1
                    ? t("auditWhenEach")
                    : t("when")}
              </TableHead>
              <TableHead>{t("what")}</TableHead>
              <TableHead>{t("auditWhere")}</TableHead>
              <TableHead>{t("who")}</TableHead>
              <TableHead>{t("why")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.map((entry) => (
              <TableRow className={`relative ${STACKED_ROW}`} key={entry.id}>
                <TableCell className={`align-top ${STACKED_CELL}`}>
                  <time
                    className="whitespace-nowrap text-step--1 tabular-nums"
                    dateTime={entry.occurredAt.toISOString()}
                  >
                    {whenLabel(entry.occurredAt, locale, entry.timeZone, year)}
                  </time>
                </TableCell>
                <TableCell
                  className={`align-top whitespace-normal ${STACKED_CELL}`}
                >
                  {/* Not prefetched: one row is one request, and all it would
                      fetch is the loading boundary — the row's own data is
                      read on the click. */}
                  <Link
                    className="block after:absolute after:inset-0 hover:underline"
                    href={`${recordHref}&record=${entry.id}`}
                    prefetch={false}
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
                  </Link>
                  {/* What the change was, for a setting or a price: the fact
                      that decides whether the record is worth opening. */}
                  {summaryOf(entry) ? (
                    <span className="block text-step--1">
                      {summaryOf(entry)}
                    </span>
                  ) : null}
                  <SubjectLine
                    entry={entry}
                    locale={locale}
                    propertyId={propertyId}
                    reach={reach}
                    words={words}
                  />
                </TableCell>
                <TableCell
                  className={`align-top whitespace-normal text-step--1 ${STACKED_CELL} ${LABELLED_CELL}`}
                  data-label={t("auditWhere")}
                >
                  {words.where(entry)}
                </TableCell>
                {/* A log that says what happened and not who did it is half a
                    log, so who stays on a phone (AUDIT-06). */}
                <TableCell
                  className={`align-top ${STACKED_CELL} ${LABELLED_CELL}`}
                  data-label={t("who")}
                >
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
                <ReasonCell entry={entry} words={words} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollCue>

      <p className="text-step--1 text-muted-foreground">
        {t("auditLocalTime")}
      </p>

      {newestHref || olderHref ? (
        <nav className="flex flex-wrap items-center justify-between gap-2">
          {newestHref ? (
            <Button asChild variant="outline">
              <Link href={newestHref}>{t("auditNewest")}</Link>
            </Button>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Button asChild variant="outline">
              <Link href={olderHref}>{t("auditOlder")}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * The subject of a record, as a link where there is somewhere to open it: the
 * screen that shows it, or for a booking or a stay, which no screen shows
 * alone, every record the log holds about it and what belongs with it
 * (AUDIT-02).
 */
function SubjectLine({
  entry,
  locale,
  propertyId,
  reach,
  words,
}: {
  entry: AuditEntry;
  locale: SupportedLocale;
  propertyId: string;
  reach: SubjectReach;
  words: AuditWords;
}) {
  const label = `${words.subjectType(entry.subjectType)} · ${words.name(entry.subjectId)}`;
  const opens =
    subjectHref(
      locale,
      propertyId,
      entry.subjectType,
      entry.subjectId,
      reach,
    ) ??
    (entry.subjectType === "reservation" || entry.subjectType === "stay"
      ? historyHref(locale, propertyId, entry.subjectId)
      : null);
  return opens ? (
    <Link
      className="relative z-10 block w-fit text-step--1 text-muted-foreground hover:text-foreground hover:underline"
      href={opens}
      prefetch={false}
      title={entry.subjectId}
    >
      {label}
    </Link>
  ) : (
    <span
      className="block text-step--1 text-muted-foreground"
      title={entry.subjectId}
    >
      {label}
    </span>
  );
}

/**
 * Why a record was made. Most actions need none and the cell keeps quiet about
 * it, so the few rows that carry a reason are the ones that stand out; an
 * action that cannot be recorded without one and has none says so in words
 * (DATA-04). On a phone a cell with nothing to say takes no room.
 */
function ReasonCell({
  entry,
  words,
}: {
  entry: AuditEntry;
  words: AuditWords;
}) {
  const t = useTranslations();
  const reason = words.reason(entry);
  const expected = expectsReason(readAs(entry.action, entry.subjectType));

  if (reason) {
    return (
      <TableCell
        className={`align-top whitespace-normal ${STACKED_CELL} ${LABELLED_CELL}`}
        data-label={t("why")}
      >
        {/* A width of its own: `max-w-prose` is 65 characters, which made the
            column wider than a laptop and cut the reason mid-word at the edge
            of the table (AUDIT-05). */}
        <span className="line-clamp-2 max-w-72 min-w-40 break-words max-sm:inline max-sm:max-w-none">
          {reason}
        </span>
      </TableCell>
    );
  }
  return (
    <TableCell
      className={`align-top whitespace-normal ${expected ? `${STACKED_CELL} ${LABELLED_CELL}` : "max-sm:hidden"}`}
      data-label={t("why")}
    >
      {expected ? (
        <span className="text-step--1 text-warning">
          {t("auditReasonMissing")}
        </span>
      ) : (
        <span className="text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">{t("noReason")}</span>
        </span>
      )}
    </TableCell>
  );
}

/**
 * The one name for the clock every time in a list is on, when they share one:
 * the Property whose clock it is, or the zone in words when several Properties
 * share it. Null when the list spans clocks, which says each place's own.
 */
function oneClock(
  entries: readonly AuditEntry[],
  zone: string | undefined,
  opened: { name: string; timezone: string },
  locale: SupportedLocale,
  words: AuditWords,
): string | null {
  if (entries.some((entry) => entry.timeZone !== zone) || !zone) return null;
  const places = [
    ...new Set(entries.flatMap((entry) => entry.propertyName ?? [])),
  ];
  const [only] = places;
  if (places.length === 1 && only !== undefined) return words.clockOf(only);
  if (places.length === 0 && opened.timezone === zone) {
    return words.clockOf(opened.name);
  }
  return zoneName(locale, zone);
}
