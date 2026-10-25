"use client";

import { useState } from "react";
import { Calendar, Loader2, Pause, Play } from "lucide-react";
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
import { toggleExportScheduleAction } from "../../../server/data-export";
import { pausedForWantOfRight } from "../helpers";
import {
  EXPORT_FILE_LIMIT_MEGABYTES,
  EXPORT_ROW_LIMIT,
  type ExportScheduleRecord,
} from "../types";

/**
 * The Organization's schedules, running and paused alike. A schedule takes one
 * change, pause or resume (EXP-S1-34); a paused one says why when the database
 * knows why, because "Paused" alone reads as a decision somebody took.
 */
export function ExportSchedulesTable({
  exportIds,
  locale,
  onNew,
  onShowRun,
  organization,
  propertyId,
  schedules,
  timezone,
}: {
  /** The exports History lists: a run older than that has no row to show. */
  exportIds: readonly string[];
  locale: SupportedLocale;
  onNew: () => void;
  onShowRun: (exportId: string) => void;
  organization: string;
  propertyId: string;
  schedules: readonly ExportScheduleRecord[];
  timezone: string;
}) {
  const t = useTranslations("dataExport");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const handleToggle = async (schedule: ExportScheduleRecord) => {
    setLoadingId(schedule.id);
    setRefusal(null);
    try {
      const result = await toggleExportScheduleAction(
        locale,
        propertyId,
        schedule.id,
        schedule.status === "active" ? "paused" : "active",
      );
      if (result.status !== "done") setRefusal(t("scheduleFailed"));
    } catch (error) {
      console.error("data_export.schedule_toggle_failed", {
        scheduleId: schedule.id,
        error,
      });
      setRefusal(t("scheduleFailed"));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t("schedulesTitle")}
        </CardTitle>
        <CardDescription>
          {t("schedulesDescription", { organization })}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {refusal ? (
          <p
            className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive sm:m-0 sm:mb-4"
            role="alert"
          >
            {refusal}
          </p>
        ) : null}
        {schedules.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={onNew} type="button">
                {t("tabs.newSchedule")}
              </Button>
            }
            description={t("noSchedulesDescription")}
            title={t("noSchedules")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-normal">
                  {t("scheduleHeaders.name")}
                </TableHead>
                <TableHead className="whitespace-normal">
                  {t("scheduleHeaders.datasets")}
                </TableHead>
                <TableHead className="whitespace-normal">
                  {t("scheduleHeaders.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => {
                const isLoading = loadingId === schedule.id;
                const active = schedule.status === "active";
                return (
                  <TableRow key={schedule.id}>
                    <TableCell className="align-top whitespace-normal">
                      <span className="block text-sm font-medium break-words">
                        {schedule.name}
                      </span>
                      <span className="block text-xs break-words text-muted-foreground">
                        {t("madeBy", { name: schedule.createdByName })}
                      </span>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <ul className="grid gap-1">
                        {schedule.resourceTypes.map((dataset) => (
                          <li className="text-sm" key={dataset}>
                            {t(`datasets.${dataset}`)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="uppercase">{schedule.format}</span>
                        <Badge variant="outline">
                          {t(`frequencies.${schedule.frequency}`)}
                        </Badge>
                      </p>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="grid justify-items-start gap-1.5">
                        <StatusBadge
                          icon={active ? Play : Pause}
                          label={t(`scheduleStatuses.${schedule.status}`)}
                          tone={active ? "success" : "neutral"}
                        />
                        {active ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            <Calendar aria-hidden="true" className="size-3.5" />
                            {t("scheduleHeaders.nextRun")}:{" "}
                            {formatDate(new Date(schedule.nextRunAt), locale, {
                              hour: "2-digit",
                              hourCycle: "h23",
                              minute: "2-digit",
                              timeZone: timezone,
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {pausedForWantOfRight(schedule)
                              ? t("pausedBecauseCreatorCannot", {
                                  name: schedule.createdByName,
                                })
                              : t("pausedByHand")}
                          </span>
                        )}
                        <LastRun
                          inHistory={
                            schedule.lastRunId !== null &&
                            exportIds.includes(schedule.lastRunId)
                          }
                          locale={locale}
                          onShow={() => {
                            if (schedule.lastRunId)
                              onShowRun(schedule.lastRunId);
                          }}
                          schedule={schedule}
                          timezone={timezone}
                        />
                        <Button
                          disabled={isLoading}
                          onClick={() => handleToggle(schedule)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {isLoading ? (
                            <Loader2
                              aria-hidden="true"
                              className="animate-spin"
                            />
                          ) : active ? (
                            <Pause aria-hidden="true" />
                          ) : (
                            <Play aria-hidden="true" />
                          )}
                          {active ? t("pause") : t("resume")}
                        </Button>
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

/**
 * When a schedule last ran and how that run ended. A schedule whose runs fail
 * must not look as healthy as one whose runs work: "Active" and a next run say
 * only that it will try again, and the person had to open History and match
 * runs by date to find out (DATA-11).
 */
function LastRun({
  inHistory,
  locale,
  onShow,
  schedule,
  timezone,
}: {
  inHistory: boolean;
  locale: SupportedLocale;
  onShow: () => void;
  schedule: ExportScheduleRecord;
  timezone: string;
}) {
  const t = useTranslations("dataExport");
  if (schedule.lastRunAt === null) {
    return (
      <span className="text-xs text-muted-foreground">{t("neverRun")}</span>
    );
  }
  const failed = schedule.lastRunStatus === "failed";
  // A schedule paused because its creator lost the right already says why.
  const reason =
    failed && !pausedForWantOfRight(schedule)
      ? t(`failures.${schedule.lastRunError ?? "internal_error"}`, {
          rows: new Intl.NumberFormat(locale).format(EXPORT_ROW_LIMIT),
          megabytes: EXPORT_FILE_LIMIT_MEGABYTES,
        })
      : null;
  return (
    <div className="grid justify-items-start gap-1">
      <span
        className={`flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums ${
          failed ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {t("lastRun", {
          when: formatDate(new Date(schedule.lastRunAt), locale, {
            hour: "2-digit",
            hourCycle: "h23",
            minute: "2-digit",
            timeZone: timezone,
          }),
        })}
        {schedule.lastRunStatus ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium">
              {t(`statuses.${schedule.lastRunStatus}`)}
            </span>
          </>
        ) : null}
      </span>
      {reason ? (
        <span className="text-xs text-destructive">{reason}</span>
      ) : null}
      {inHistory ? (
        <Button
          className="h-auto p-0 text-xs"
          onClick={onShow}
          type="button"
          variant="link"
        >
          {t("showInHistory")}
        </Button>
      ) : null}
    </div>
  );
}
