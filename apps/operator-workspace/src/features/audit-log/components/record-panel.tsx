"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AuditRecord } from "@ranza/core";
import {
  Fact,
  FactList,
  Separator,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { isKnownAction, isKnownSubject } from "../actions";
import { whenLabel } from "./columns";

/**
 * One record, whole.
 *
 * The list clamps a reason to two lines and shows a subject by its first eight
 * characters. This is where the reason is read in full and the ids are copied
 * from, and where `context` — whatever the acting module thought worth
 * explaining later — is laid out as the facts it is. No actions: this screen
 * writes nothing, and a record cannot be changed by anyone (ADR 0008).
 */
export function RecordPanel({
  folioHref,
  locale,
  record,
  timeZone,
  viewerId,
}: {
  /** Route prefix a Folio subject links to with `&folio=` — the one subject
      that already has a screen of its own. */
  folioHref: string;
  locale: SupportedLocale;
  record: AuditRecord;
  timeZone: string;
  viewerId: string;
}) {
  const t = useTranslations();
  const entries = Object.entries(record.context ?? {});

  return (
    <section className="mt-6">
      <FactList className="pt-0">
        <Fact label={t("what")}>
          {isKnownAction(record.action)
            ? t(`auditAction.${record.action}`)
            : record.action}
        </Fact>
        <Fact label={t("subject")}>
          {isKnownSubject(record.subjectType)
            ? t(`auditSubject.${record.subjectType}`)
            : record.subjectType}{" "}
          {record.subjectType === "folio" ? (
            // Not prefetched: one row is one request, and all it would fetch is
            // the loading boundary — the row's own data is read on the click.
            <Link
              className="font-mono hover:underline"
              href={`${folioHref}&folio=${record.subjectId}`}
              prefetch={false}
            >
              {record.subjectId}
            </Link>
          ) : (
            <span className="font-mono">{record.subjectId}</span>
          )}
        </Fact>
        <Fact label={t("who")}>
          {record.actorId === viewerId ? (
            t("you")
          ) : (
            <span className="font-mono" title={t("actorUnnamed")}>
              {record.actorId}
            </span>
          )}
        </Fact>
        <Fact label={t("when")}>
          <time
            className="tabular-nums"
            dateTime={record.occurredAt.toISOString()}
          >
            {whenLabel(record.occurredAt, locale, timeZone)}
          </time>
        </Fact>
        <Fact label={t("why")}>
          {record.reason ? (
            <span className="whitespace-pre-wrap">{record.reason}</span>
          ) : (
            <span className="text-muted-foreground">{t("noReason")}</span>
          )}
        </Fact>
      </FactList>

      <Separator className="my-6" />

      <Table>
        <TableCaption>{t("context")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("contextKey")}</TableHead>
            <TableHead>{t("contextValue")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={2}>
                {t("noContext")}
              </TableCell>
            </TableRow>
          ) : (
            entries.map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-mono text-step--1">{key}</TableCell>
                <TableCell className="font-mono text-step--1 break-all">
                  {typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : String(value)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
