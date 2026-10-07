"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FailedOperationRecord } from "../../../server/viewer";
import {
  Badge,
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
import { RetryButton } from "./retry-button";

interface FailedOperationsTableProps {
  failedOperations: FailedOperationRecord[];
  locale: string;
  propertyId: string;
}

export function FailedOperationsTable({
  failedOperations,
  locale,
  propertyId,
}: FailedOperationsTableProps) {
  const t = useTranslations("integrations");

  if (failedOperations.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0"
            />
            <CardTitle className="text-step-0">
              {t("failedOperationsTitle")}
            </CardTitle>
          </div>
          <CardDescription className="text-step--1">
            {t("noFailedOperations")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatDate = (date: Date) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(date));
    } catch {
      return new Date(date).toLocaleString();
    }
  };

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle
              aria-hidden="true"
              className="size-5 text-destructive shrink-0"
            />
            <div>
              <CardTitle className="text-step-0 text-destructive font-semibold">
                {t("failedOperationsTitle")}
              </CardTitle>
              <CardDescription className="text-step--1 text-muted-foreground mt-0.5">
                {t("failedOperationsDescription")}
              </CardDescription>
            </div>
          </div>
          <Badge variant="destructive">
            {failedOperations.length} {t("errorCount")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="text-start ps-6">
                  {t("integration")}
                </TableHead>
                <TableHead className="text-start">{t("operation")}</TableHead>
                <TableHead className="text-start">{t("error")}</TableHead>
                <TableHead className="text-center">{t("attempts")}</TableHead>
                <TableHead className="text-start">{t("lastAttempt")}</TableHead>
                <TableHead className="text-end pe-6">{t("retry")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedOperations.map((op) => (
                <TableRow
                  className="border-b border-border/40 hover:bg-background/80"
                  key={op.id}
                >
                  <TableCell className="font-medium text-start ps-6 whitespace-nowrap">
                    <span className="font-semibold text-foreground">
                      {op.integrationName}
                    </span>
                  </TableCell>
                  <TableCell className="text-start text-step--1 font-medium">
                    {op.operation}
                  </TableCell>
                  <TableCell className="text-start text-step--1 max-w-xs sm:max-w-md">
                    <div className="rounded border-s-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-step--2 text-destructive break-words">
                      {op.error}
                    </div>
                  </TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    <Badge variant="outline" className="font-mono text-step--2">
                      {op.attempts}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-start text-step--2 text-muted-foreground whitespace-nowrap">
                    {formatDate(op.lastAttemptAt)}
                  </TableCell>
                  <TableCell className="text-end pe-6 whitespace-nowrap">
                    <div className="flex justify-end">
                      <RetryButton
                        locale={locale}
                        operationId={op.id}
                        propertyId={propertyId}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
