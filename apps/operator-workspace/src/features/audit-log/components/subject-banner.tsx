"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AuditNames } from "@ranza/core";
import { Button } from "@ranza/ui";
import { shortId } from "../actions";

/**
 * Said above a log that has been narrowed to the history of one thing, so the
 * list cannot be mistaken for the whole log: what it is the history of, that a
 * booking's reaches its stays and folios, and the way back out (AUDIT-03).
 */
export function SubjectBanner({
  allHref,
  names,
  span,
  subjectId,
}: {
  /** The same log, without the narrowing. */
  allHref: string;
  names: AuditNames;
  /** How many subjects the history spans; more than one for a booking. */
  span: number | null;
  subjectId: string;
}) {
  const t = useTranslations();
  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
      role="status"
    >
      <p>
        {t("auditSubjectOnly", {
          subject: names.labels[subjectId] ?? shortId(subjectId),
        })}
        {span !== null && span > 1 ? ` ${t("auditSubjectAlso")}` : "."}
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href={allHref} prefetch={false}>
          {t("auditShowAll")}
        </Link>
      </Button>
    </div>
  );
}
