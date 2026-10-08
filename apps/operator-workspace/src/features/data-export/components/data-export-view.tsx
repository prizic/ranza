"use client";

import { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { DataExportRecord, ExportScheduleRecord } from "../types";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ranza/ui";
import { ExportSchedulesTable } from "./export-schedules-table";
import { NewExportForm } from "./new-export-form";
import { NewScheduleForm } from "./new-schedule-form";
import { RecentExportsTable } from "./recent-exports-table";

interface DataExportViewProps {
  exports: DataExportRecord[];
  schedules: ExportScheduleRecord[];
  locale: string;
  propertyId: string;
}

export function DataExportView({
  exports,
  schedules,
  locale,
  propertyId,
}: DataExportViewProps) {
  const t = useTranslations("dataExport");
  const [activeTab, setActiveTab] = useState<string>("exports");

  const totalExports = exports.length;
  const readyExports = exports.filter((e) => e.status === "ready").length;
  const activeSchedules = schedules.filter((s) => s.status === "active").length;
  const lastExport = exports[0]?.requestedAt
    ? new Date(exports[0].requestedAt).toLocaleString(locale, {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("recentExportsTitle")}</span>
              <FileSpreadsheet
                aria-hidden="true"
                className="size-4 text-emerald-600 dark:text-emerald-400"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {totalExports}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("statuses.ready")}</span>
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-emerald-600 dark:text-emerald-400"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {readyExports}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("schedulesTitle")}</span>
              <Calendar
                aria-hidden="true"
                className="size-4 text-blue-600 dark:text-blue-400"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {activeSchedules}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("tableHeaders.requestedAt")}</span>
              <Clock
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-sm font-semibold text-foreground truncate mt-1">
              {lastExport}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-muted/60 p-1">
            <TabsTrigger value="exports" className="text-sm gap-1.5">
              <Download className="size-4" />
              <span>{t("tabs.exports")}</span>
            </TabsTrigger>
            <TabsTrigger value="schedules" className="text-sm gap-1.5">
              <Calendar className="size-4" />
              <span>{t("tabs.schedules")}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={activeTab === "new" ? "default" : "outline"}
              onClick={() => setActiveTab("new")}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              <span>{t("tabs.newExport")}</span>
            </Button>
            <Button
              size="sm"
              variant={activeTab === "new-schedule" ? "default" : "outline"}
              onClick={() => setActiveTab("new-schedule")}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              <span>{t("scheduleTitle")}</span>
            </Button>
          </div>
        </div>

        <TabsContent value="exports" className="mt-0">
          <RecentExportsTable exports={exports} locale={locale} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-0">
          <ExportSchedulesTable
            schedules={schedules}
            locale={locale}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <NewExportForm
            locale={locale}
            propertyId={propertyId}
            onSuccess={() => setActiveTab("exports")}
          />
        </TabsContent>

        <TabsContent value="new-schedule" className="mt-0">
          <NewScheduleForm
            locale={locale}
            propertyId={propertyId}
            onSuccess={() => setActiveTab("schedules")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
