"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  MaintenanceRequestCard,
  EquipmentRegister,
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
  Input,
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
import {
  EquipmentRegisterPanel,
  type EquipmentLimits,
} from "./equipment-register";
import { staffName } from "../../../lib/staff-name";
import { STATE_ICON } from "./look";
import { MaintenanceSettingsCard } from "./maintenance-settings";
import { OutcomeMessage } from "./outcome-message";
import { ReportDialog } from "./report-dialog";
import { RequestCard } from "./request-card";
import { RequestSheet } from "./request-sheet";
import { ServicePlan } from "./service-plan";

const COLUMNS: readonly RequestStatus[] = [
  "new",
  "in_progress",
  "waiting_for_parts",
  "done",
];

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  this_week: 1,
  can_wait: 2,
};

/** How soon the board looks again when somebody returns to it. */
const REFRESH_AFTER_MS = 10_000;

/**
 * Open work in a column reads most urgent first, then longest waiting; what is
 * finished or cancelled reads latest first, which is what somebody checking a
 * fix wants (MAINT-04).
 */
function inColumnOrder(
  state: RequestStatus,
  cards: readonly MaintenanceRequestCard[],
): MaintenanceRequestCard[] {
  const finished = state === "done" || state === "cancelled";
  return [...cards].sort((a, b) =>
    finished
      ? b.statusChangedAt.localeCompare(a.statusChangedAt)
      : PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.reportedAt.localeCompare(b.reportedAt),
  );
}

function matchesSearch(request: MaintenanceRequestCard, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const haystack = [
    `mt-${request.number}`,
    request.title,
    request.unit?.name,
    request.unit?.roomName,
    request.equipment?.name,
    request.assignee?.email,
  ];
  return haystack.some((part) => part?.toLocaleLowerCase().includes(needle));
}

export interface MaintenanceLimits {
  title: number;
  details: number;
  cancelReason: number;
  note: number;
  vendor: number;
  equipment: EquipmentLimits;
}

/**
 * The Maintenance screen (RANZ-33): the requests board, the equipment
 * register, its service plan and, for whoever may change it, how maintenance
 * works at this Property.
 *
 * Presentational: the board arrives through the server funnel, and every
 * change goes back through a server action whose writes the policies bound.
 * Priority, assignee, "out of order only" and "show cancelled" live in the
 * address, so a filtered board can be linked and survives a reload
 * (MT-S1-29, MAINT-06); the search is the reader's own and does not.
 */
export function MaintenanceBoard({
  board,
  options,
  register,
  settings,
  locale,
  propertyId,
  propertyName,
  timeZone,
  limits,
  reportUnitId,
  viewerId,
}: {
  board: Board;
  options: ReportOptions;
  register: EquipmentRegister;
  settings: Settings | null;
  locale: SupportedLocale;
  propertyId: string;
  propertyName: string;
  timeZone: string;
  limits: MaintenanceLimits;
  /** A Unit to report about, when the reader arrived from Rooms. */
  reportUnitId: string | null;
  viewerId: string;
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
  const [query, setQuery] = useState("");
  const priorityParam = searchParams.get("priority");
  const priority: Priority | "all" =
    priorityParam === "urgent" ||
    priorityParam === "this_week" ||
    priorityParam === "can_wait"
      ? priorityParam
      : "all";
  const assignee = searchParams.get("assignee") ?? "all";
  const outOfOrderOnly = searchParams.get("outOfOrder") === "1";
  const showCancelled = searchParams.get("cancelled") === "1";

  // Written to the address in place: a filter is not worth a round trip to the
  // server, which Next would make for `router.replace`.
  const setFilter = useCallback(
    (name: string, value: string | null) => {
      const next = new URLSearchParams(window.location.search);
      if (value === null) next.delete(name);
      else next.set(name, value);
      const search = next.toString();
      window.history.replaceState(
        null,
        "",
        search === "" ? pathname : `${pathname}?${search}`,
      );
    },
    [pathname],
  );
  const hasFilter =
    priority !== "all" ||
    assignee !== "all" ||
    outOfOrderOnly ||
    query.trim() !== "";
  const clearFilters = () => {
    for (const name of ["priority", "assignee", "outOfOrder"]) {
      setFilter(name, null);
    }
    setQuery("");
  };

  // Nobody is notified of a report (MAINT-02), so a board left open looks
  // again when its reader comes back to the tab.
  useEffect(() => {
    let lastLooked = Date.now();
    const onReturn = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastLooked < REFRESH_AFTER_MS
      ) {
        return;
      }
      lastLooked = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [router]);

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

  const assigneeId = assignee === "me" ? viewerId : assignee;
  const visible = useMemo(
    () =>
      board.requests.filter(
        (request) =>
          (priority === "all" || request.priority === priority) &&
          (assigneeId === "all" ||
            (assigneeId === "none"
              ? request.assignee === null
              : request.assignee?.userId === assigneeId)) &&
          (!outOfOrderOnly || request.hold !== null) &&
          matchesSearch(request, query),
      ),
    [board.requests, priority, assigneeId, outOfOrderOnly, query],
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
                  setFilter("priority", value === "all" ? null : value)
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
              <Select
                onValueChange={(value) =>
                  setFilter("assignee", value === "all" ? null : value)
                }
                value={assignee}
              >
                <SelectTrigger className="w-56" id="filter-assignee">
                  <SelectValue>
                    {assignee === "all"
                      ? t("everyone")
                      : assignee === "me"
                        ? t("mine")
                        : assignee === "none"
                          ? t("unassigned")
                          : staffName(
                              options.assignees.find(
                                (person) => person.userId === assignee,
                              )?.email ?? null,
                              t("formerStaff"),
                            )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("everyone")}</SelectItem>
                  <SelectItem value="me">{t("mine")}</SelectItem>
                  <SelectItem value="none">{t("unassigned")}</SelectItem>
                  {options.assignees.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {staffName(person.email, t("formerStaff"))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Toggle
              checked={outOfOrderOnly}
              id="filter-out-of-order"
              label={t("outOfOrderOnly")}
              onChange={(checked) =>
                setFilter("outOfOrder", checked ? "1" : null)
              }
            />
            <Toggle
              checked={showCancelled}
              id="filter-cancelled"
              label={t("showCancelled")}
              onChange={(checked) =>
                setFilter("cancelled", checked ? "1" : null)
              }
            />
            <div className="grid gap-1.5">
              <Label htmlFor="filter-search">{t("searchRequests")}</Label>
              <Input
                autoComplete="off"
                className="w-56"
                id="filter-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                type="search"
                value={query}
              />
            </div>
          </div>

          {visible.length === 0 && hasFilter ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3"
              role="status"
            >
              <p className="text-step--1">
                <span className="font-medium">{t("noMatchTitle")}.</span>{" "}
                <span className="text-muted-foreground">
                  {t("noMatchDescription")}
                </span>
              </p>
              <Button onClick={clearFilters} size="sm" variant="outline">
                {t("showAllRequests")}
              </Button>
            </div>
          ) : null}

          <div
            className={
              showCancelled
                ? "grid gap-4 md:grid-cols-2 xl:grid-cols-5"
                : "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            }
          >
            {columns.map((state) => {
              const cards = inColumnOrder(
                state,
                visible.filter((request) => request.status === state),
              );
              const Icon = STATE_ICON[state];
              return (
                <section
                  aria-labelledby={`column-${state}`}
                  className="grid content-start gap-2 rounded-xl bg-muted/40 p-2"
                  key={state}
                >
                  {/* h3: under the board's own h2 heading above. */}
                  <h3
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
                  </h3>
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
        {/* h2: the page bar (AppPageBar) already sets this route's one h1. */}
        <h2 className="max-w-prose text-step-0 text-muted-foreground">
          {t("heading")}
        </h2>
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

      <Tabs defaultValue="requests">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="requests">{t("requestsTab")}</TabsTrigger>
          <TabsTrigger value="equipment">{t("equipmentTab")}</TabsTrigger>
          <TabsTrigger value="plan">{t("planTab")}</TabsTrigger>
          {settings ? (
            <TabsTrigger value="settings">{t("settingsTab")}</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent className="pt-4" value="requests">
          {requests}
        </TabsContent>
        <TabsContent className="pt-4" value="equipment">
          <EquipmentRegisterPanel
            limits={limits.equipment}
            locale={locale}
            propertyId={propertyId}
            propertyName={propertyName}
            register={register}
            units={options.units}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="plan">
          <ServicePlan locale={locale} register={register} />
        </TabsContent>
        {settings ? (
          <TabsContent className="pt-4" value="settings">
            <MaintenanceSettingsCard
              locale={locale}
              propertyId={propertyId}
              settings={settings}
            />
          </TabsContent>
        ) : null}
      </Tabs>

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
          openRequests={board.requests}
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
          mayCharge={board.mayCharge}
          mayManage={board.mayManage}
          mayTakeOutOfOrder={board.mayTakeOutOfOrder}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedId(null);
          }}
          propertyId={propertyId}
          request={selected}
          timeZone={timeZone}
          today={board.today}
          viewerId={viewerId}
          whenDone={
            settings
              ? {
                  returnOnDone: settings.effective.returnOnDone,
                  returnAs: settings.effective.returnAs,
                }
              : null
          }
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
