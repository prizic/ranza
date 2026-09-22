"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, Undo2 } from "lucide-react";
import type { AuditRecord } from "@ranza/core";
import { DataTableColumnHeader, StatusBadge } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels } from "../../../lib/table-labels";
import {
  isCorrection,
  isKnownAction,
  isKnownSubject,
  shortId,
} from "../actions";

/**
 * `meta.title` is not decoration: the column menu and the search placeholder
 * both read it, so a column without one is a column the reader cannot name.
 */

/**
 * An instant, shown as the Property's wall clock.
 *
 * A record is stamped in UTC and read from anywhere; the time that means
 * something is the one on the clock above the front desk where it happened.
 * The machine-readable instant stays on the element for whoever needs the
 * exact moment.
 */
export function whenLabel(
  at: Date,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return formatDate(at, locale, {
    hour: "2-digit",
    // 24-hour in every language, as everywhere else in the product.
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  });
}

export function useAuditColumns(
  locale: SupportedLocale,
  timeZone: string,
  viewerId: string,
  recordHref: string,
): ColumnDef<AuditRecord, unknown>[] {
  const t = useTranslations();
  const sort = useSortLabels();
  const actionLabel = (action: string) =>
    isKnownAction(action) ? t(`auditAction.${action}`) : action;
  const subjectLabel = (subject: string) =>
    isKnownSubject(subject) ? t(`auditSubject.${subject}`) : subject;

  return [
    {
      accessorKey: "occurredAt",
      meta: { title: t("when") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("when")}
        />
      ),
      cell: ({ row }) => (
        <time
          className="whitespace-nowrap text-step--1 tabular-nums"
          dateTime={row.original.occurredAt.toISOString()}
        >
          {whenLabel(row.original.occurredAt, locale, timeZone)}
        </time>
      ),
    },
    {
      accessorKey: "action",
      meta: { title: t("what") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("what")}
        />
      ),
      cell: ({ row }) => (
        <a
          className="block hover:underline"
          href={`${recordHref}&record=${row.original.id}`}
        >
          {/* A correction is the row this screen exists for, so it is said
              three ways — tone, icon and word — never by colour alone
              (blueprint 18.5). */}
          {isCorrection(row.original.action) ? (
            <StatusBadge
              icon={Undo2}
              label={actionLabel(row.original.action)}
              tone="warning"
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CircleCheck
                aria-hidden="true"
                className="size-3.5 text-muted-foreground"
              />
              {actionLabel(row.original.action)}
            </span>
          )}
          <span className="block text-step--1 text-muted-foreground">
            {subjectLabel(row.original.subjectType)}{" "}
            <span className="font-mono" title={row.original.subjectId}>
              {shortId(row.original.subjectId)}
            </span>
          </span>
        </a>
      ),
    },
    {
      accessorKey: "actorId",
      meta: { title: t("who") },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} labels={sort} title={t("who")} />
      ),
      cell: ({ row }) =>
        row.original.actorId === viewerId ? (
          <span className="font-medium">{t("you")}</span>
        ) : (
          // A stable id, and nothing more, because that is all the policies let
          // this screen know about a colleague today: users_read_self shows a
          // Staff Member their own row only. Naming the person is PRE-01 in
          // docs/features/audit-log/edge-cases.csv, and it is a migration.
          <span
            className="font-mono text-step--1"
            title={`${t("actorUnnamed")} · ${row.original.actorId}`}
          >
            {shortId(row.original.actorId)}
          </span>
        ),
    },
    {
      accessorKey: "reason",
      meta: { title: t("why") },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} labels={sort} title={t("why")} />
      ),
      cell: ({ row }) =>
        row.original.reason ? (
          <span className="line-clamp-2 max-w-prose">
            {row.original.reason}
          </span>
        ) : (
          // Most actions require no reason and the column must say so, or an
          // empty cell reads as a reason somebody failed to give.
          <span className="text-step--1 text-muted-foreground">
            {t("noReason")}
          </span>
        ),
    },
  ];
}
