"use client";

import {
  CheckCircle2,
  Clock,
  Download,
  Hourglass,
  Loader,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import {
  formatElapsed,
  formatSize,
  holdsPersonalData,
  PENDING_SLOW_AFTER_MS,
  PROCESSING_SLOW_AFTER_MS,
} from "../helpers";
import {
  EXPORT_FILE_LIMIT_MEGABYTES,
  EXPORT_RETENTION_DAYS,
  EXPORT_ROW_LIMIT,
  type DataExportRecord,
  type ExportRange,
} from "../types";
import { useNow } from "../use-now";

/** A day in a range, as the day it is: `YYYY-MM-DD` read at UTC so no zone moves it. */
function dayLabel(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    timeZone: "UTC",
  });
}

/** The year an instant falls in on a Property's clock, as `YYYY`. */
function yearOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(
    at,
  );
}

/**
 * The exports an Organization has asked for, newest first.
 *
 * Three columns at every width, so there is nothing to scroll sideways to
 * reach the one thing a ready row is for (DX-20): when and by whom, what and
 * how much, and how it ended with what can be done next.
 */
export function RecentExportsTable({
  exports,
  locale,
  onRequestAgain,
  onRequestNew,
  organization,
  propertyId,
  timezone,
  today,
}: {
  exports: readonly DataExportRecord[];
  locale: SupportedLocale;
  onRequestAgain: (item: DataExportRecord) => void;
  onRequestNew: () => void;
  organization: string;
  propertyId: string;
  timezone: string;
  /** The Property's own day, `YYYY-MM-DD`: a time this year needs no year. */
  today: string;
}) {
  const t = useTranslations("dataExport");
  const now = useNow(5_000);

  const rangeText = (range: ExportRange): string => {
    if (range.from && range.to) {
      return t("rangeBetween", {
        from: dayLabel(range.from, locale),
        to: dayLabel(range.to, locale),
      });
    }
    return range.from
      ? t("rangeSince", { from: dayLabel(range.from, locale) })
      : t("rangeUntil", { to: dayLabel(range.to ?? "", locale) });
  };

  function status(item: DataExportRecord) {
    switch (item.status) {
      case "ready":
        return (
          <StatusBadge
            icon={CheckCircle2}
            label={t("statuses.ready")}
            tone="success"
          />
        );
      case "processing":
        return (
          <StatusBadge
            icon={Loader}
            label={t("statuses.processing")}
            tone="info"
          />
        );
      case "failed":
        return (
          <StatusBadge
            icon={XCircle}
            label={t("statuses.failed")}
            tone="danger"
          />
        );
      case "expired":
        return (
          <StatusBadge
            icon={Hourglass}
            label={t("statuses.expired")}
            tone="neutral"
          />
        );
      case "pending":
        return (
          <StatusBadge
            icon={Clock}
            label={t("statuses.pending")}
            tone="neutral"
          />
        );
    }
  }

  function detail(item: DataExportRecord) {
    if (item.status === "pending" || item.status === "processing") {
      if (now === null) return null;
      const waited = now - new Date(item.requestedAt).getTime();
      const slow =
        waited >
        (item.status === "pending"
          ? PENDING_SLOW_AFTER_MS
          : PROCESSING_SLOW_AFTER_MS);
      return (
        <>
          <span className="text-xs text-muted-foreground">
            {t(item.status === "pending" ? "waitingFor" : "preparingFor", {
              duration: formatElapsed(waited, locale),
            })}
          </span>
          {slow ? (
            <span className="text-xs text-warning">{t("slowNote")}</span>
          ) : null}
        </>
      );
    }
    if (item.status === "failed") {
      return (
        <span className="text-xs text-destructive">
          {t(`failures.${item.error ?? "internal_error"}`, {
            rows: new Intl.NumberFormat(locale).format(EXPORT_ROW_LIMIT),
            megabytes: EXPORT_FILE_LIMIT_MEGABYTES,
          })}
        </span>
      );
    }
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t("exportsTitle")}
        </CardTitle>
        <CardDescription>
          {t("exportsDescription", {
            organization,
            days: EXPORT_RETENTION_DAYS,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {exports.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={onRequestNew} type="button">
                {t("noExportsAction")}
              </Button>
            }
            description={t("noExportsDescription", {
              days: EXPORT_RETENTION_DAYS,
            })}
            title={t("noExports", { organization })}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal">
                  {t("tableHeaders.requestedAt")}
                </TableHead>
                <TableHead className="whitespace-normal">
                  {t("tableHeaders.datasets")}
                </TableHead>
                <TableHead className="whitespace-normal">
                  {t("tableHeaders.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((item) => {
                const requested = new Date(item.requestedAt);
                const canAskAgain =
                  item.status === "failed" || item.status === "expired";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="align-top whitespace-normal">
                      <time
                        className="block text-sm tabular-nums sm:whitespace-nowrap"
                        dateTime={requested.toISOString()}
                      >
                        {formatDate(requested, locale, {
                          year:
                            yearOf(requested, timezone) === today.slice(0, 4)
                              ? undefined
                              : "numeric",
                          hour: "2-digit",
                          hourCycle: "h23",
                          minute: "2-digit",
                          timeZone: timezone,
                        })}
                      </time>
                      <span className="block text-xs break-words text-muted-foreground">
                        {item.requesterName}
                      </span>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <ul className="grid gap-1">
                        {item.resourceTypes.map((dataset) => {
                          const count = item.recordCounts[dataset];
                          return (
                            <li className="text-sm" key={dataset}>
                              {t(`datasets.${dataset}`)}
                              {count === undefined ? null : (
                                <span className="block text-xs text-muted-foreground">
                                  {t("recordCount", { count })}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {item.range ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rangeText(item.range)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        <span className="uppercase">{item.format}</span>
                        {item.fileSizeBytes
                          ? ` · ${formatSize(item.fileSizeBytes, locale)}`
                          : null}
                      </p>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="grid justify-items-start gap-1.5">
                        {status(item)}
                        {detail(item)}
                        {item.status === "ready" ? (
                          <>
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`/api/data-export/${item.id}/download?locale=${locale}&property=${propertyId}`}
                              >
                                <Download aria-hidden="true" />
                                {t("download")}
                              </a>
                            </Button>
                            {item.expiresAt ? (
                              <span className="text-xs text-muted-foreground">
                                {t("expiresOn", {
                                  date: formatDate(
                                    new Date(item.expiresAt),
                                    locale,
                                    { timeZone: timezone },
                                  ),
                                })}
                              </span>
                            ) : null}
                            {holdsPersonalData(item.resourceTypes) ? (
                              <Badge variant="outline">
                                {t("personalBadge")}
                              </Badge>
                            ) : null}
                          </>
                        ) : null}
                        {canAskAgain ? (
                          <Button
                            onClick={() => onRequestAgain(item)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <RotateCcw aria-hidden="true" />
                            {t("requestAgain")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
