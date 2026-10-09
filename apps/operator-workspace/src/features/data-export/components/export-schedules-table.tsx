"use client";

import { useState } from "react";
import { Calendar, Loader2, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExportScheduleRecord } from "../types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { toggleExportScheduleAction } from "../../../server/data-export";

interface ExportSchedulesTableProps {
  schedules: ExportScheduleRecord[];
  locale: string;
  propertyId: string;
}

export function ExportSchedulesTable({
  schedules,
  locale,
  propertyId,
}: ExportSchedulesTableProps) {
  const t = useTranslations("dataExport");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const getDatasetLabel = (
    res: ExportScheduleRecord["resourceTypes"][number],
  ): string => {
    switch (res) {
      case "residents_guests":
        return t("datasets.residents_guests");
      case "reservations_stays":
        return t("datasets.reservations_stays");
      case "rooms_beds":
        return t("datasets.rooms_beds");
      case "folios_payments":
        return t("datasets.folios_payments");
      case "audit_log":
        return t("datasets.audit_log");
    }
  };

  const getFrequencyLabel = (
    freq: ExportScheduleRecord["frequency"],
  ): string => {
    switch (freq) {
      case "daily":
        return t("frequencies.daily");
      case "weekly":
        return t("frequencies.weekly");
      case "monthly":
        return t("frequencies.monthly");
    }
  };

  const handleToggle = async (schedule: ExportScheduleRecord) => {
    const nextStatus = schedule.status === "active" ? "paused" : "active";
    setLoadingId(schedule.id);
    setRefusal(null);
    try {
      const res = await toggleExportScheduleAction(
        locale,
        propertyId,
        schedule.id,
        nextStatus,
      );
      if (res.status !== "done") {
        setRefusal(
          res.status === "refused" ? t("scheduleRefused") : t("scheduleFailed"),
        );
      }
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
    <Card className="border-border">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg font-semibold text-foreground">
          {t("schedulesTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {t("schedulesDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        {refusal && (
          <div
            className="m-4 rounded-md border border-destructive/30 bg-destructive/15 p-3 text-sm text-destructive sm:m-0 sm:mb-4"
            role="alert"
          >
            {refusal}
          </div>
        )}
        {schedules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("noSchedules")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.name")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.datasets")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.format")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.frequency")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.status")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("scheduleHeaders.nextRun")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("scheduleHeaders.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const nextRunDate = new Date(
                    schedule.nextRunAt,
                  ).toLocaleString(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  });
                  const isLoading = loadingId === schedule.id;

                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium text-foreground">
                        {schedule.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {schedule.resourceTypes.map((res) => (
                            <Badge
                              key={res}
                              variant="secondary"
                              className="text-[11px] font-normal"
                            >
                              {getDatasetLabel(res)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs uppercase text-foreground">
                        {schedule.format}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getFrequencyLabel(schedule.frequency)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {schedule.status === "active" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300">
                            {t("scheduleStatuses.active")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            {t("scheduleStatuses.paused")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="size-3.5" />
                          {nextRunDate}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isLoading}
                          onClick={() => handleToggle(schedule)}
                          className="h-8 gap-1.5"
                        >
                          {isLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : schedule.status === "active" ? (
                            <>
                              <Pause className="size-3.5 text-amber-600" />
                              <span>{t("pause")}</span>
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5 text-emerald-600" />
                              <span>{t("resume")}</span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
