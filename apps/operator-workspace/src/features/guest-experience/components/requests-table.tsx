"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type {
  ServiceRequestCategory,
  ServiceRequestItem,
  ServiceRequestPriority,
  ServiceRequestStaff,
} from "@ranza/guest-services";
import { formatDate, isolate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@ranza/ui";
import { ageSince } from "../../../lib/age";
import type { ServiceRequestOutcome } from "../../../server/guest-services";
import { CategoryBadge } from "./category-badge";
import { PriorityBadge } from "./priority-badge";
import { RequestActions } from "./request-actions";
import { RequestAssignee } from "./request-assignee";
import { RequestOutcome } from "./request-outcome";
import { RequestStatusBadge } from "./status-badge";

export interface RequestsTableProps {
  requests: readonly ServiceRequestItem[];
  locale: SupportedLocale;
  propertyId: string;
  timeZone?: string;
  staff: readonly ServiceRequestStaff[];
  viewerId: string;
  mayManage: boolean;
  urgentOnly: boolean;
}

type FilterTab = "open" | "closed" | "all";

// Listed here and not imported from the module: its index also holds the
// database client, which a browser bundle must not reach.
const CATEGORIES: readonly ServiceRequestCategory[] = [
  "housekeeping",
  "maintenance",
  "amenities",
  "front_desk",
  "other",
];

const PRIORITY_ORDER: Record<ServiceRequestPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const isOpen = (request: ServiceRequestItem) =>
  request.status === "new" || request.status === "in_progress";

/**
 * Open requests read most urgent first and, within a priority, longest waiting
 * first; closed ones read latest first. The database's own order (status
 * alphabetically) put a request being worked above a brand-new one (GX-04).
 */
function inOrder(a: ServiceRequestItem, b: ServiceRequestItem): number {
  if (isOpen(a) && isOpen(b)) {
    return (
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.reportedAt.localeCompare(b.reportedAt)
    );
  }
  if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
  return b.reportedAt.localeCompare(a.reportedAt);
}

export function RequestsTable({
  requests,
  locale,
  propertyId,
  timeZone = "UTC",
  staff,
  viewerId,
  mayManage,
  urgentOnly,
}: RequestsTableProps) {
  const t = useTranslations("guestExperience");
  const categories = useTranslations("guestExperience.categories");
  const [tab, setTab] = useState<FilterTab>("open");
  const [refusal, setRefusal] =
    useState<ServiceRequestOutcome["status"]>("idle");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [category, setCategory] = useState<ServiceRequestCategory | "all">(
    "all",
  );

  const narrowed =
    query.trim() !== "" ||
    assignee !== "all" ||
    category !== "all" ||
    urgentOnly;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return requests
      .filter((req) => {
        if (tab === "open" && !isOpen(req)) return false;
        if (tab === "closed" && isOpen(req)) return false;
        if (urgentOnly && !(req.priority === "urgent" && isOpen(req))) {
          return false;
        }
        if (category !== "all" && req.category !== category) return false;
        if (assignee === "none" && req.assignedToUserId !== null) return false;
        if (assignee === "me" && req.assignedToUserId !== viewerId) {
          return false;
        }
        if (needle === "") return true;
        return [
          String(req.number),
          req.title,
          req.unitName,
          req.guestName,
        ].some((part) => part?.toLocaleLowerCase().includes(needle));
      })
      .sort(inOrder);
  }, [requests, tab, query, urgentOnly, category, assignee, viewerId]);

  const counts = useMemo(() => {
    const open = requests.filter(isOpen).length;
    return {
      all: requests.length,
      open,
      closed: requests.length - open,
    };
  }, [requests]);

  const showAll = () => {
    setTab("all");
    setQuery("");
    setAssignee("all");
    setCategory("all");
  };

  const reportedOn = (req: ServiceRequestItem) =>
    formatDate(new Date(req.reportedAt), locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
  const reportedAge = (req: ServiceRequestItem) =>
    isOpen(req) ? ageSince(req.reportedAt, locale) : null;

  const empty =
    requests.length === 0 ? (
      <EmptyState title={t("emptyTitle")} description={t("emptyDesc")} />
    ) : tab === "open" && !narrowed && counts.closed > 0 ? (
      <EmptyState
        action={
          <Button onClick={() => setTab("closed")} size="sm" variant="outline">
            {t("showClosed")}
          </Button>
        }
        description={t("nothingOpenDesc", { count: counts.closed })}
        title={t("nothingOpenTitle")}
      />
    ) : (
      <EmptyState
        action={
          <Button onClick={showAll} size="sm" variant="outline">
            {t("showAll")}
          </Button>
        }
        description={t("noMatchDesc")}
        title={t("noMatchTitle")}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs
          value={tab}
          onValueChange={(val) => {
            setTab(val as FilterTab);
            setRefusal("idle");
          }}
          className="w-auto max-w-full"
        >
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="open" className="gap-1.5">
              <span>{t("openRequests")}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {counts.open}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-1.5">
              <span>{t("resolvedRequests")}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {counts.closed}
              </span>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5">
              <span>{t("allRequests")}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {counts.all}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="gx-filter-assignee">{t("filterAssignee")}</Label>
            <Select onValueChange={setAssignee} value={assignee}>
              <SelectTrigger className="h-9 w-44" id="gx-filter-assignee">
                <SelectValue>
                  {assignee === "all"
                    ? t("everyone")
                    : assignee === "me"
                      ? t("mine")
                      : t("unassigned")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("everyone")}</SelectItem>
                <SelectItem value="me">{t("mine")}</SelectItem>
                <SelectItem value="none">{t("unassigned")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gx-filter-category">{t("filterCategory")}</Label>
            <Select
              onValueChange={(value) =>
                setCategory(value as ServiceRequestCategory | "all")
              }
              value={category}
            >
              <SelectTrigger className="h-9 w-44" id="gx-filter-category">
                <SelectValue>
                  {category === "all"
                    ? t("allCategories")
                    : categories(category)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                {CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {categories(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label={t("searchPlaceholder")}
              className="h-9 ps-9 text-sm"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              type="search"
              value={query}
            />
          </div>
        </div>
      </div>

      {/* The reason a command was refused is kept here, not on the row: the
          refresh that follows can take the row out of the list, and its reason
          with it (GX-03, GX-08). */}
      <div aria-live="polite">
        <RequestOutcome status={refusal} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8">{empty}</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border bg-card lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>{t("title")}</TableHead>
                  <TableHead>{t("priority")}</TableHead>
                  <TableHead>
                    {t("room")} · {t("guest")}
                  </TableHead>
                  <TableHead>{t("assignee")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("reportedAt")}</TableHead>
                  <TableHead className="text-end">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                      #{req.number}
                    </TableCell>
                    <TableCell>
                      <div className="grid justify-items-start gap-1.5">
                        <RequestTitle request={req} />
                        <CategoryBadge category={req.category} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={req.priority} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{req.unitName ?? "-"}</span>
                      {req.guestName ? (
                        <span className="block text-muted-foreground">
                          {req.guestName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <RequestAssignee
                        locale={locale}
                        onOutcome={setRefusal}
                        mayManage={mayManage}
                        propertyId={propertyId}
                        request={req}
                        staff={staff}
                        viewerId={viewerId}
                      />
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {reportedOn(req)}
                      <span className="block" suppressHydrationWarning>
                        {reportedAge(req)}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      {mayManage ? (
                        <RequestActions
                          locale={locale}
                          onOutcome={setRefusal}
                          propertyId={propertyId}
                          request={req}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid gap-3 lg:hidden">
            {filtered.map((req) => (
              <li key={req.id}>
                <Card className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid gap-1">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        #{req.number}
                      </span>
                      <RequestTitle request={req} />
                    </div>
                    <PriorityBadge priority={req.priority} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RequestStatusBadge status={req.status} />
                    <CategoryBadge category={req.category} />
                  </div>
                  <p className="text-sm">
                    {[req.unitName, req.guestName]
                      .filter((part) => part !== null)
                      .map(isolate)
                      .join(" · ") || "-"}
                  </p>
                  <p
                    className="text-xs text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {reportedOn(req)}
                    {reportedAge(req) ? ` · ${reportedAge(req)}` : ""}
                  </p>
                  <RequestAssignee
                    locale={locale}
                    onOutcome={setRefusal}
                    mayManage={mayManage}
                    propertyId={propertyId}
                    request={req}
                    staff={staff}
                    viewerId={viewerId}
                  />
                  {mayManage ? (
                    <RequestActions
                      locale={locale}
                      onOutcome={setRefusal}
                      propertyId={propertyId}
                      request={req}
                    />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RequestTitle({ request }: { request: ServiceRequestItem }) {
  const t = useTranslations("guestExperience");
  return (
    <div className="flex max-w-sm flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">
        {request.title}
      </span>
      {request.details && (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {request.details}
        </span>
      )}
      {request.cancelReason && (
        <span className="text-xs italic text-destructive">
          {t("cancelReason")}: {request.cancelReason}
        </span>
      )}
      {request.resolutionNotes && (
        <span className="text-xs italic text-success">
          {t("resolutionNotes")}: {request.resolutionNotes}
        </span>
      )}
    </div>
  );
}
