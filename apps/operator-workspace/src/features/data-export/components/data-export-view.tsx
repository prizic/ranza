"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ranza/ui";
import {
  EXPORT_RETENTION_DAYS,
  type DataExportRecord,
  type ExportAbilities,
  type ExportFormat,
  type ExportRange,
  type ExportResourceType,
  type ExportScheduleRecord,
} from "../types";
import { ExportSchedulesTable } from "./export-schedules-table";
import { NewExportForm, type ExportDraft } from "./new-export-form";
import { NewScheduleForm } from "./new-schedule-form";
import { RecentExportsTable } from "./recent-exports-table";

type Panel = "exports" | "schedules" | "new" | "new-schedule";

const NOTHING_CHOSEN: ExportDraft = {
  resources: [],
  format: "csv",
  range: null,
};

/**
 * Data export: what was asked for and how it ended, what repeats, and the two
 * forms that ask for more.
 *
 * One set of tabs for all four panels, so the page always says where you are
 * (DX-16), and a form has a Cancel that goes back to the list it came from.
 */
export function DataExportView({
  abilities,
  exports,
  initialDraft,
  locale,
  organization,
  propertyId,
  propertyName,
  schedules,
  timezone,
  today,
  unavailable,
}: {
  abilities: ExportAbilities;
  exports: DataExportRecord[];
  /** A request being made from a link, such as the audit log's. */
  initialDraft: ExportDraft | null;
  locale: SupportedLocale;
  organization: string;
  propertyId: string;
  /** The Property the screen is opened from: its clock reads a range of days. */
  propertyName: string;
  schedules: ExportScheduleRecord[];
  timezone: string;
  /** The Property's own day, `YYYY-MM-DD`. */
  today: string;
  /** The person followed a download link to a file that is no longer there. */
  unavailable: boolean;
}) {
  const t = useTranslations("dataExport");
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(initialDraft ? "new" : "exports");
  const [draft, setDraft] = useState<ExportDraft>(
    initialDraft ?? NOTHING_CHOSEN,
  );
  // Remounts the form when a request is made again, so it starts from that
  // request and not from whatever it held.
  const [draftVersion, setDraftVersion] = useState(0);
  const [notice, setNotice] = useState<
    "requestSuccess" | "scheduleSuccess" | null
  >(null);
  // The export a schedule's last run made, when a schedule row sent the
  // reader to it (DATA-11).
  const [shownRun, setShownRun] = useState<string | null>(null);

  // An export is produced by the worker, not by the request, so a screen that
  // is showing one still waiting is asked to read again until it is not.
  const unfinished = exports.some(
    (item) => item.status === "pending" || item.status === "processing",
  );
  useEffect(() => {
    if (!unfinished) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [unfinished, router]);

  function requestAgain(item: DataExportRecord) {
    setDraft({
      resources: item.resourceTypes as ExportResourceType[],
      format: item.format as ExportFormat,
      range: item.range as ExportRange | null,
    });
    setDraftVersion((version) => version + 1);
    setNotice(null);
    setPanel("new");
  }

  function startNew() {
    setDraft(NOTHING_CHOSEN);
    setDraftVersion((version) => version + 1);
    setPanel("new");
  }

  return (
    <div className="grid gap-4">
      {unavailable ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
          role="alert"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {t("unavailable", { days: EXPORT_RETENTION_DAYS })}
        </p>
      ) : null}
      {notice &&
      panel === (notice === "requestSuccess" ? "exports" : "schedules") ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-soft p-3 text-sm text-success"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t(notice)}
        </p>
      ) : null}

      <Tabs
        className="gap-4"
        onValueChange={(next) => {
          if (next === "new") startNew();
          else setPanel(next as Panel);
          setNotice(null);
          setShownRun(null);
        }}
        value={panel}
      >
        <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 sm:w-fit">
          <TabsTrigger className="h-9! flex-none" value="exports">
            {t("tabs.exports")}
          </TabsTrigger>
          <TabsTrigger className="h-9! flex-none" value="schedules">
            {t("tabs.schedules")}
          </TabsTrigger>
          <TabsTrigger className="h-9! flex-none" value="new">
            {t("tabs.newExport")}
          </TabsTrigger>
          <TabsTrigger className="h-9! flex-none" value="new-schedule">
            {t("tabs.newSchedule")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exports">
          <RecentExportsTable
            exports={exports}
            locale={locale}
            onRequestAgain={requestAgain}
            onRequestNew={startNew}
            organization={organization}
            propertyId={propertyId}
            shownRun={shownRun}
            timezone={timezone}
            today={today}
          />
        </TabsContent>

        <TabsContent value="schedules">
          <ExportSchedulesTable
            exportIds={exports.map((item) => item.id)}
            locale={locale}
            onNew={() => setPanel("new-schedule")}
            onShowRun={(exportId) => {
              setShownRun(exportId);
              setPanel("exports");
            }}
            organization={organization}
            propertyId={propertyId}
            schedules={schedules}
            timezone={timezone}
          />
        </TabsContent>

        <TabsContent value="new">
          <NewExportForm
            abilities={abilities}
            draft={draft}
            key={draftVersion}
            onCancel={() => setPanel("exports")}
            onRequested={() => {
              setNotice("requestSuccess");
              setPanel("exports");
              router.refresh();
            }}
            organization={organization}
            propertyId={propertyId}
            propertyName={propertyName}
            timezone={timezone}
            today={today}
          />
        </TabsContent>

        <TabsContent value="new-schedule">
          <NewScheduleForm
            abilities={abilities}
            onCancel={() => setPanel("schedules")}
            onCreated={() => {
              setNotice("scheduleSuccess");
              setPanel("schedules");
              router.refresh();
            }}
            propertyId={propertyId}
            timezone={timezone}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
