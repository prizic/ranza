"use client";

import { useTranslations } from "next-intl";
import type { AuditEntry, AuditNames } from "@ranza/core";
import { Fact, FactList, Separator } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useAuditWords, whenLabel } from "../words";
import { ContextFacts } from "./context-facts";

/**
 * One record, whole.
 *
 * The list clamps a reason to two lines; this is where it is read in full,
 * with every fact the acting module thought worth explaining later, named the
 * way a reader would name it. The raw ids stay on the elements for whoever
 * needs to search a database with them. No actions: this screen writes
 * nothing, and a record cannot be changed by anyone (ADR 0008).
 */
export function RecordPanel({
  entry,
  folioHref,
  locale,
  names,
  viewerId,
}: {
  entry: AuditEntry;
  /** Route prefix a Folio subject links to with `&folio=` — the one subject
      that already has a screen of its own. */
  folioHref: string;
  locale: SupportedLocale;
  names: AuditNames;
  viewerId: string;
}) {
  const t = useTranslations();
  const words = useAuditWords(names, viewerId);
  const subject = words.name(entry.subjectId);

  return (
    <section className="mt-6">
      <FactList className="pt-0">
        <Fact label={t("what")}>{words.action(entry)}</Fact>
        <Fact label={t("subject")}>
          {words.subjectType(entry.subjectType)}{" "}
          {entry.subjectType === "folio" ? (
            <a
              className="hover:underline"
              href={`${folioHref}&folio=${entry.subjectId}`}
              title={entry.subjectId}
            >
              {subject}
            </a>
          ) : (
            <span title={entry.subjectId}>{subject}</span>
          )}
        </Fact>
        <Fact label={t("auditWhere")}>{words.where(entry)}</Fact>
        <Fact label={t("who")}>
          <span className="break-all" title={entry.actorId}>
            {words.actor(entry.actorId)}
          </span>
        </Fact>
        <Fact label={t("when")}>
          <time
            className="tabular-nums"
            dateTime={entry.occurredAt.toISOString()}
          >
            {whenLabel(entry.occurredAt, locale, entry.timeZone)}
          </time>
        </Fact>
        <Fact label={t("why")}>
          {entry.reason ? (
            <span className="whitespace-pre-wrap">{entry.reason}</span>
          ) : (
            <span className="text-muted-foreground">{t("noReason")}</span>
          )}
        </Fact>
      </FactList>

      <Separator className="my-6" />

      <ContextFacts
        context={entry.context ?? {}}
        locale={locale}
        subjectType={entry.subjectType}
        words={words}
      />
    </section>
  );
}
