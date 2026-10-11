"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { FailedOperationRecord } from "../../../server/viewer";
import { eventKey, isDeliveryFailure, isWebhookEventType } from "../types";
import { OperationActions } from "./operation-actions";

interface FailedOperationsTableProps {
  failedOperations: readonly FailedOperationRecord[];
  /** Whether the viewer holds integrations.manage at this Property. */
  mayAct: boolean;
  locale: string;
  propertyId: string;
}

export function FailedOperationsTable({
  failedOperations,
  mayAct,
  locale,
  propertyId,
}: FailedOperationsTableProps) {
  const t = useTranslations("integrations");

  if (failedOperations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5 shrink-0 text-success"
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

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-step-0 font-semibold">
          {t("failedOperationsTitle")}
        </CardTitle>
        <CardDescription className="text-step--1">
          {t("failedOperationsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-6 text-start">
                  {t("columns.endpoint")}
                </TableHead>
                <TableHead className="text-start">
                  {t("columns.whatHappened")}
                </TableHead>
                <TableHead className="text-start">
                  {t("columns.attempts")}
                </TableHead>
                <TableHead className="text-start">
                  {t("columns.nextAttempt")}
                </TableHead>
                {mayAct ? (
                  <TableHead className="pe-6 text-end">
                    {t("columns.actions")}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedOperations.map((operation) => {
                const retrying = operation.status === "retrying";
                return (
                  <TableRow
                    data-status={operation.status}
                    data-testid="failed-operation"
                    key={operation.id}
                  >
                    <TableCell className="ps-6">
                      <div className="grid gap-0.5">
                        <span className="font-medium">
                          {operation.endpointName}
                        </span>
                        <span className="text-step--1 text-muted-foreground">
                          {isWebhookEventType(operation.operation)
                            ? t(`events.${eventKey(operation.operation)}`)
                            : operation.operation === "webhook.test"
                              ? t("testEvent")
                              : operation.operation}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs text-step--1 sm:max-w-md">
                      <div className="grid gap-1">
                        <span className="break-words">
                          {isDeliveryFailure(operation.error)
                            ? t(`failures.${operation.error}`)
                            : operation.error}
                        </span>
                        {operation.lastStatusCode !== null ? (
                          <span className="text-muted-foreground">
                            {t("httpStatus", {
                              code: operation.lastStatusCode,
                            })}
                          </span>
                        ) : null}
                        {operation.lastResponseExcerpt ? (
                          <span
                            className="break-words text-muted-foreground"
                            dir="auto"
                          >
                            {t("receiverSaid", {
                              excerpt: operation.lastResponseExcerpt,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-step--1">
                      <div className="grid gap-0.5">
                        <span className="tabular-nums">
                          {operation.attempts}
                        </span>
                        <span className="text-muted-foreground">
                          {t("lastAttemptAt", {
                            when: formatDate(operation.lastAttemptAt),
                          })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-step--1 whitespace-nowrap">
                      <div className="grid justify-items-start gap-1">
                        <StatusBadge
                          icon={retrying ? RefreshCw : AlertTriangle}
                          label={t(`operationStatuses.${operation.status}`)}
                          tone={retrying ? "warning" : "danger"}
                        />
                        <span className="text-muted-foreground">
                          {retrying && operation.nextAttemptAt
                            ? operation.due
                              ? t("dueNow")
                              : formatDate(operation.nextAttemptAt)
                            : t("noMoreAttempts")}
                        </span>
                      </div>
                    </TableCell>
                    {mayAct ? (
                      <TableCell className="pe-6 text-end">
                        <OperationActions
                          locale={locale}
                          operationId={operation.id}
                          propertyId={propertyId}
                          status={operation.status}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
