"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ServiceRequestItem } from "@ranza/guest-services";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  EmptyState,
  Input,
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
import { CategoryBadge } from "./category-badge";
import { PriorityBadge } from "./priority-badge";
import { RequestActions } from "./request-actions";
import { RequestStatusBadge } from "./status-badge";

export interface RequestsTableProps {
  requests: readonly ServiceRequestItem[];
  locale: SupportedLocale;
  propertyId: string;
  timeZone?: string;
}

type FilterTab = "open" | "resolved" | "all";

export function RequestsTable({
  requests,
  locale,
  propertyId,
  timeZone = "UTC",
}: RequestsTableProps) {
  const t = useTranslations("guestExperience");
  const [tab, setTab] = useState<FilterTab>("open");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return requests.filter((req) => {
      // Tab filter
      if (
        tab === "open" &&
        !(req.status === "new" || req.status === "in_progress")
      ) {
        return false;
      }
      if (
        tab === "resolved" &&
        !(req.status === "resolved" || req.status === "cancelled")
      ) {
        return false;
      }

      // Search query
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesNumber = String(req.number).includes(q);
        const matchesTitle = req.title.toLowerCase().includes(q);
        const matchesUnit = req.unitName?.toLowerCase().includes(q) ?? false;
        const matchesGuest = req.guestName?.toLowerCase().includes(q) ?? false;
        if (!matchesNumber && !matchesTitle && !matchesUnit && !matchesGuest) {
          return false;
        }
      }

      return true;
    });
  }, [requests, tab, query]);

  const counts = useMemo(() => {
    let openCount = 0;
    let resolvedCount = 0;
    for (const r of requests) {
      if (r.status === "new" || r.status === "in_progress") {
        openCount++;
      } else {
        resolvedCount++;
      }
    }
    return {
      all: requests.length,
      open: openCount,
      resolved: resolvedCount,
    };
  }, [requests]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(val) => setTab(val as FilterTab)}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="open" className="gap-1.5">
              <span>{t("openRequests")}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {counts.open}
              </span>
            </TabsTrigger>
            <TabsTrigger value="resolved" className="gap-1.5">
              <span>{t("resolvedRequests")}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                {counts.resolved}
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

        <div className="relative max-w-xs w-full">
          <Search className="absolute start-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("title") + "..."}
            className="ps-9 h-9 text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8">
          <EmptyState title={t("emptyTitle")} description={t("emptyDesc")} />
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>{t("title")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("priority")}</TableHead>
                <TableHead>{t("room")}</TableHead>
                <TableHead>{t("guest")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("reportedAt")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((req) => {
                const reportedFormatted = formatDate(
                  new Date(req.reportedAt),
                  locale,
                  {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                    timeZone,
                  },
                );

                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                      #{req.number}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 max-w-sm">
                        <span className="font-medium text-foreground text-sm">
                          {req.title}
                        </span>
                        {req.details && (
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {req.details}
                          </span>
                        )}
                        {req.cancelReason && (
                          <span className="text-xs text-destructive italic">
                            {t("cancelReason")}: {req.cancelReason}
                          </span>
                        )}
                        {req.resolutionNotes && (
                          <span className="text-xs text-success italic">
                            {t("resolutionNotes")}: {req.resolutionNotes}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={req.category} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={req.priority} />
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {req.unitName ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.guestName ?? "-"}
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {reportedFormatted}
                    </TableCell>
                    <TableCell className="text-end">
                      <RequestActions
                        locale={locale}
                        propertyId={propertyId}
                        request={req}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
