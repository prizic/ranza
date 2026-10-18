"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
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
import type {
  FailedOperationPage,
  FailedOperationRecord,
  FailureView,
} from "../../../server/viewer";
import { eventKey, isDeliveryFailure, isWebhookEventType } from "../types";
import { OperationActions } from "./operation-actions";
import { RetryAllButton } from "./retry-all-button";

/**
 * Below the `sm` breakpoint a row is a block of its own and each cell names
 * itself, because five columns do not fit a phone and a horizontal scroll puts
 * the row's actions out of reach. From `sm` up it is an ordinary table row.
 */
const STACKED_ROW = "max-sm:grid max-sm:gap-3 max-sm:p-4";
const STACKED_CELL =
  "max-sm:block max-sm:p-0 max-sm:whitespace-normal max-sm:before:mb-0.5 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

interface FailedOperationsTableProps {
  failures: FailedOperationPage;
  hrefs: { open: string; closed: string };
  /** Whether the viewer holds integrations.manage at this Property. */
  mayAct: boolean;
  locale: string;
  page: number;
  pageSize: number;
  propertyId: string;
  view: FailureView;
  viewerId: string | null;
}

export function FailedOperationsTable({
  failures,
  hrefs,
  mayAct,
  locale,
  page,
  pageSize,
  propertyId,
  view,
  viewerId,
}: FailedOperationsTableProps) {
  const t = useTranslations("integrations");
  const closed = view === "closed";

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));

  if (failures.total === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="size-5 shrink-0 text-success"
            />
            <CardTitle className="text-step-0">
              {closed ? t("closedFailuresTitle") : t("failedOperationsTitle")}
            </CardTitle>
          </div>
          <CardDescription className="text-step--1">
            {closed ? t("noClosedFailures") : t("noFailedOperations")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = first + failures.records.length - 1;
  const pageHref = (n: number) =>
    `${hrefs[view]}${n === 1 ? "" : `&page=${n}`}`;
  const stopped = failures.records.some(
    (record) => record.status === "failed" && record.retryable,
  );

  return (
    <Card className={closed ? "" : "border-destructive/30"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle className="text-step-0 font-semibold">
              {closed ? t("closedFailuresTitle") : t("failedOperationsTitle")}
            </CardTitle>
            <CardDescription className="text-step--1">
              {closed
                ? t("closedFailuresDescription")
                : t("failedOperationsDescription")}
            </CardDescription>
          </div>
          {!closed && mayAct && stopped ? (
            <RetryAllButton locale={locale} propertyId={propertyId} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="max-sm:hidden">
              <TableRow>
                <TableHead className="ps-6 text-start">
                  {t("columns.endpoint")}
                </TableHead>
                <TableHead className="text-start">
                  {t("columns.whatHappened")}
                </TableHead>
                {closed ? (
                  <>
                    <TableHead className="text-start">
                      {t("columns.closed")}
                    </TableHead>
                    <TableHead className="pe-6 text-start">
                      {t("columns.reason")}
                    </TableHead>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.records.map((operation) => (
                <TableRow
                  className={STACKED_ROW}
                  data-status={operation.status}
                  data-testid="failed-operation"
                  key={operation.id}
                >
                  <TableCell
                    className={`ps-6 whitespace-normal ${STACKED_CELL}`}
                    data-label={t("columns.endpoint")}
                  >
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
                  <TableCell
                    className={`max-w-xs text-step--1 whitespace-normal sm:max-w-sm ${STACKED_CELL}`}
                    data-label={t("columns.whatHappened")}
                  >
                    <WhatHappened closed={closed} operation={operation} />
                  </TableCell>
                  {closed ? (
                    <>
                      <TableCell
                        className={`text-step--1 ${STACKED_CELL}`}
                        data-label={t("columns.closed")}
                      >
                        <div className="grid gap-0.5">
                          <span>
                            {operation.closedAt
                              ? formatDate(operation.closedAt)
                              : null}
                          </span>
                          <span className="text-muted-foreground">
                            {t(`operationStatuses.${operation.status}`)}
                            {" · "}
                            {closedBy(operation, viewerId, t)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={`pe-6 text-step--1 break-words whitespace-normal ${STACKED_CELL}`}
                        data-label={t("columns.reason")}
                        dir="auto"
                      >
                        {closingReason(operation, t)}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell
                        className={`text-step--1 ${STACKED_CELL}`}
                        data-label={t("columns.attempts")}
                      >
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
                      <TableCell
                        className={`text-step--1 ${STACKED_CELL}`}
                        data-label={t("columns.nextAttempt")}
                      >
                        <div className="grid justify-items-start gap-1">
                          <StatusBadge
                            icon={
                              operation.status === "retrying"
                                ? RefreshCw
                                : AlertTriangle
                            }
                            label={t(`operationStatuses.${operation.status}`)}
                            tone={
                              operation.status === "retrying"
                                ? "warning"
                                : "danger"
                            }
                          />
                          <span className="text-muted-foreground">
                            {operation.status === "retrying" &&
                            operation.nextAttemptAt
                              ? operation.due
                                ? t("dueNow")
                                : formatDate(operation.nextAttemptAt)
                              : t("noMoreAttempts")}
                          </span>
                        </div>
                      </TableCell>
                      {mayAct ? (
                        <TableCell
                          className={`pe-6 text-end whitespace-normal max-sm:text-start ${STACKED_CELL}`}
                        >
                          <OperationActions
                            locale={locale}
                            operationId={operation.id}
                            propertyId={propertyId}
                            retryable={operation.retryable}
                            status={operation.status}
                          />
                        </TableCell>
                      ) : null}
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {failures.total > pageSize ? (
          <nav
            aria-label={t("pagesLabel")}
            className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3"
          >
            <span className="text-step--1 text-muted-foreground tabular-nums">
              {t("showing", { from: first, to: last, total: failures.total })}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(page - 1)}>{t("newer")}</Link>
                </Button>
              ) : null}
              {last < failures.total ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(page + 1)}>{t("older")}</Link>
                </Button>
              ) : null}
            </div>
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}

type Say = ReturnType<typeof useTranslations<"integrations">>;

/**
 * What the failure was, in words, with the one thing to do about it while it is
 * open. What the receiver itself said is behind "Technical details": it is the
 * receiver's text, cut to one line, and is for whoever runs the receiver.
 *
 * A failure that was closed by the delivery arriving is told as what it was and
 * nothing more: the delivery's last answer is then a success, and printed next
 * to "answered with an error" it would contradict the line above it.
 */
function WhatHappened({
  closed,
  operation,
}: {
  closed: boolean;
  operation: FailedOperationRecord;
}) {
  const t = useTranslations("integrations");
  const known = isDeliveryFailure(operation.error);
  const arrived = operation.closedReason === "delivered";
  return (
    <div className="grid gap-1">
      <span className="break-words">
        {known ? t(`failures.${operation.error}`) : operation.error}
      </span>
      {known && !closed ? (
        <span className="text-muted-foreground">
          {t(`failureAdvice.${operation.error}`)}
        </span>
      ) : null}
      {operation.lastStatusCode !== null && !arrived ? (
        <span className="text-muted-foreground">
          {t("httpStatus", { code: operation.lastStatusCode })}
        </span>
      ) : null}
      {operation.lastResponseExcerpt && !arrived ? (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">{t("technicalDetails")}</summary>
          <span className="break-words" dir="auto">
            {t("receiverSaid", { excerpt: operation.lastResponseExcerpt })}
          </span>
        </details>
      ) : null}
    </div>
  );
}

function closedBy(
  operation: FailedOperationRecord,
  viewerId: string | null,
  t: Say,
): string {
  if (operation.closedBy === null) return t("closedByRanza");
  return operation.closedBy === viewerId
    ? t("closedByYou")
    : t("closedByColleague");
}

/** The words a person wrote, or Ranza's own two reasons said in the reader's language. */
function closingReason(operation: FailedOperationRecord, t: Say): string {
  if (operation.closedReason === "delivered") return t("closedReasonDelivered");
  if (operation.closedReason === "endpoint removed") {
    return t("closedReasonEndpointRemoved");
  }
  return operation.closedReason ?? "";
}
