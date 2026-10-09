"use client";

import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DataExportRecord } from "../types";
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

interface RecentExportsTableProps {
  exports: DataExportRecord[];
  locale: string;
}

export function RecentExportsTable({
  exports,
  locale,
}: RecentExportsTableProps) {
  const t = useTranslations("dataExport");

  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getDatasetLabel = (
    res: DataExportRecord["resourceTypes"][number],
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

  const getStatusBadge = (status: DataExportRecord["status"]) => {
    switch (status) {
      case "ready":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300">
            {t("statuses.ready")}
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            {t("statuses.processing")}
          </Badge>
        );
      case "failed":
        return <Badge variant="destructive">{t("statuses.failed")}</Badge>;
      case "expired":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            {t("statuses.expired")}
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge
            variant="outline"
            className="text-amber-800 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-300"
          >
            {t("statuses.pending")}
          </Badge>
        );
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg font-semibold text-foreground">
          {t("recentExportsTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {t("recentExportsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        {exports.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("noExports")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">
                    {t("tableHeaders.requestedAt")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("tableHeaders.requester")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("tableHeaders.datasets")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("tableHeaders.format")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("tableHeaders.status")}
                  </TableHead>
                  <TableHead className="text-start">
                    {t("tableHeaders.size")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("tableHeaders.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((item) => {
                  const dateStr = new Date(item.requestedAt).toLocaleString(
                    locale,
                    {
                      dateStyle: "short",
                      timeStyle: "short",
                    },
                  );

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {dateStr}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {item.requesterName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.resourceTypes.map((res) => (
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
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-mono text-xs uppercase text-foreground">
                          {item.format === "json" ? (
                            <FileJson className="size-3.5 text-amber-600" />
                          ) : (
                            <FileSpreadsheet className="size-3.5 text-emerald-600" />
                          )}
                          {item.format}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatBytes(item.fileSizeBytes)}
                      </TableCell>
                      <TableCell className="text-end">
                        {item.status === "ready" ? (
                          <div className="flex flex-col items-end gap-1">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-emerald-700 hover:text-emerald-800 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                            >
                              <a
                                href={`/api/data-export/${item.id}/download`}
                                download={
                                  item.fileName ||
                                  `export-${item.id.slice(0, 8)}.${item.format}`
                                }
                              >
                                <Download className="size-3.5" />
                                <span>{t("download")}</span>
                              </a>
                            </Button>
                            {item.expiresAt && (
                              <span className="text-[11px] text-muted-foreground">
                                {t("expiresOn", {
                                  date: new Date(
                                    item.expiresAt,
                                  ).toLocaleDateString(locale, {
                                    dateStyle: "medium",
                                  }),
                                })}
                              </span>
                            )}
                          </div>
                        ) : item.status === "failed" ? (
                          <span className="text-xs text-destructive">
                            {t(`failures.${item.error ?? "internal_error"}`)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t(`statuses.${item.status}`)}
                          </span>
                        )}
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
