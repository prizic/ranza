"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  ClipboardList,
  Flame,
  Info,
  Plus,
  Wrench,
} from "lucide-react";
import type {
  MaintenanceBoard as Board,
  MaintenanceSettings as Settings,
  Priority,
  ReportOptions,
  RequestStatus,
} from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Checkbox,
  EmptyState,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stat,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ranza/ui";
import type { MaintenanceOutcome } from "../../../server/maintenance";
import { STATE_ICON } from "./look";
import { MaintenanceSettingsCard } from "./maintenance-settings";
import { OutcomeMessage } from "./outcome-message";
import { ReportDialog } from "./report-dialog";
import { RequestCard } from "./request-card";
import { RequestSheet } from "./request-sheet";

const COLUMNS: readonly RequestStatus[] = [
  "new",
  "in_progress",
  "waiting_for_parts",
  "done",
];

export interface MaintenanceLimits {
  title: number;
  details: number;
  cancelReason: number;
  note: number;
}

/**
 * The Maintenance screen (RANZ-33): the requests board and, for whoever may
 * change it, how maintenance works at this Property.
 *
 * Presentational: the board arrives through the server funnel, and every
 * change goes back through a server action whose writes the policies bound.
 * Filters are the reader's own and never leave the page (MT-S1-29).
 */
export function MaintenanceBoard({
  board,
  options,
  settings,
  locale,
  propertyId,
  propertyName,
  timeZone,
  limits,
  reportUnitId,
}: {
  board: Board;
  options: ReportOptions;
  settings: Settings | null;
  locale: SupportedLocale;
  propertyId: string;
  propertyName: string;
  timeZone: string;
  limits: MaintenanceLimits;
  /** A Unit to report about, when the reader arrived from Rooms. */
  reportUnitId: string | null;
}) {
  const t = useTranslations("maintenance");
  const states = useTranslations("maintenance.states");
  const priorities = useTranslations("maintenance.priorities");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reporting, setReporting] = useState(
    reportUnitId !== null && board.mayReport,
  );
  const [reported, setReported] = useState<MaintenanceOutcome>({
    status: "idle",
  });
  // A dialog that was only closed keeps its draft; one that sent its report
  // starts again empty, or the next press would file the same problem twice.
  const [reportKey, setReportKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [outOfOrderOnly, setOutOfOrderOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const onReported = useCallback((outcome: MaintenanceOutcome) => {
    setReported(outcome);
    setReportKey((key) => key + 1);
  }, []);

  // `?report=` is how Rooms hands a room over. Once the dialog closes it has
  // done its job, and a reload must not open the form again.
  const onReportingChange = useCallback(
    (open: boolean) => {
      setReporting(open);
      if (open || !searchParams.has("report")) return;
      const rest = new URLSearchParams(searchParams);
      rest.delete("report");
      router.replace(`${pathname}?${rest.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const visible = useMemo(
    () =>
      board.requests.filter(
        (request) =>
          (priority === "all" || request.priority === priority) &&
          (assignee === "all" ||
            (assignee === "none"
              ? request.assignee === null
              : request.assignee?.userId === assignee)) &&
          (!outOfOrderOnly || request.hold !== null),
      ),
    [board.requests, priority, assignee, outOfOrderOnly],
  );
  const columns = showCancelled ? [...COLUMNS, "cancelled" as const] : COLUMNS;
  const selected =
    board.requests.find((request) => request.requestId === selectedId) ?? null;

  const open =
    board.counts.new +
    board.counts.in_progress +
    board.counts.waiting_for_parts;
  const urgent = board.requests.filter(
    (request) =>
      request.priority === "urgent" &&
      request.status !== "done" &&
      request.status !== "cancelled",
  ).length;

  const newRequest = board.mayReport ? (
    <Button onClick={() => setReporting(true)}>
      <Plus aria-hidden="true" className="size-4" />
      {t("newRequest")}
    </Button>
  ) : null;

  const requests = (
    <div className="grid gap-4">
      {board.mayManage || board.requests.length === 0 ? null : (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-step--1 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("readOnly")}
        </p>
      )}

      {board.requests.length === 0 ? (
        <EmptyState
          action={newRequest}
          description={t("noRequestsDescription")}
          title={t("noRequestsTitle", { property: propertyName })}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="filter-priority">{t("filterPriority")}</Label>
              <Select
                onValueChange={(value) =>
                  setPriority(value as Priority | "all")
                }
                value={priority}
              >
                <SelectTrigger className="w-40" id="filter-priority">
                  <SelectValue>
                    {priority === "all"
                      ? t("allPriorities")
                      : priorities(priority)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allPriorities")}</SelectItem>
                  <SelectItem value="urgent">{priorities("urgent")}</SelectItem>
                  <SelectItem value="this_week">
                    {priorities("this_week")}
                  </SelectItem>
                  <SelectItem value="can_wait">
                    {priorities("can_wait")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-assignee">{t("filterAssignee")}</Label>
              <Select onValueChange={setAssignee} value={assignee}>
                <SelectTrigger className="w-56" id="filter-assignee">
                  <SelectValue>
                    {assignee === "all"
                      ? t("everyone")
                      : assignee === "none"
                        ? t("unassigned")
                        : (options.assignees.find(
                            (person) => person.userId === assignee,
                          )?.email ?? t("formerStaff"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("everyone")}</SelectItem>
                  <SelectItem value="none">{t("unassigned")}</SelectItem>
                  {options.assignees.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.email ?? t("formerStaff")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Toggle
              checked={outOfOrderOnly}
              id="filter-out-of-order"
              label={t("outOfOrderOnly")}
              onChange={setOutOfOrderOnly}
            />
            <Toggle
              checked={showCancelled}
              id="filter-cancelled"
              label={t("showCancelled")}
              onChange={setShowCancelled}
            />
          </div>

          <div
            className={
              showCancelled
                ? "grid gap-4 md:grid-cols-2 xl:grid-cols-5"
                : "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            }
          >
            {columns.map((state) => {
              const cards = visible.filter(
                (request) => request.status === state,
              );
              const Icon = STATE_ICON[state];
              return (
                <section
                  aria-labelledby={`column-${state}`}
                  className="grid content-start gap-2 rounded-xl bg-muted/40 p-2"
                  key={state}
                >
                  <h2
                    className="flex items-center justify-between px-1 pt-1 text-step--1 font-semibold"
                    id={`column-${state}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon aria-hidden="true" className="size-4" />
                      {states(state)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {cards.length}
                    </span>
                  </h2>
                  {cards.length === 0 ? (
                    <p className="px-1 py-6 text-center text-step--1 text-muted-foreground">
                      {t("emptyColumn")}
                    </p>
                  ) : (
                    cards.map((request) => (
                      <RequestCard
                        key={request.requestId}
                        locale={locale}
                        onOpen={() => setSelectedId(request.requestId)}
                        request={request}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader aside={board.requests.length === 0 ? null : newRequest}>
        <h1 className="text-step-2 font-semibold tracking-tight">
          {t("heading", { property: propertyName })}
        </h1>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={ClipboardList} label={t("statOpen")} value={open} />
        <Stat icon={Flame} label={t("statUrgent")} value={urgent} />
        <Stat
          icon={Wrench}
          label={t("statOutOfOrder")}
          value={board.counts.outOfOrder}
        />
        <Stat
          icon={CircleCheck}
          label={t("statDone")}
          value={board.counts.done}
        />
      </div>

      <OutcomeMessage outcome={reported} />

      {settings ? (
        <Tabs defaultValue="requests">
          <TabsList>
            <TabsTrigger value="requests">{t("requestsTab")}</TabsTrigger>
            <TabsTrigger value="settings">{t("settingsTab")}</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="requests">
            {requests}
          </TabsContent>
          <TabsContent className="pt-4" value="settings">
            <MaintenanceSettingsCard
              locale={locale}
              propertyId={propertyId}
              settings={settings}
            />
          </TabsContent>
        </Tabs>
      ) : (
        requests
      )}

      {board.mayReport ? (
        <ReportDialog
          initialUnitId={reportKey === 0 ? reportUnitId : null}
          key={reportKey}
          limits={limits}
          locale={locale}
          mayManage={board.mayManage}
          mayTakeOutOfOrder={board.mayTakeOutOfOrder}
          onDone={onReported}
          onOpenChange={onReportingChange}
          open={reporting}
          options={options}
          propertyId={propertyId}
          today={board.today}
        />
      ) : null}

      {selected ? (
        <RequestSheet
          assignees={options.assignees}
          key={selected.requestId}
          limits={limits}
          locale={locale}
          mayManage={board.mayManage}
          mayTakeOutOfOrder={board.mayTakeOutOfOrder}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedId(null);
          }}
          request={selected}
          timeZone={timeZone}
          today={board.today}
        />
      ) : null}
    </div>
  );
}

function Toggle({
  checked,
  id,
  label,
  onChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
