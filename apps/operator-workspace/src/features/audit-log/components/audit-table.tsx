"use client";

import { useTranslations } from "next-intl";
import type { AuditRecord } from "@ranza/core";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { KNOWN_ACTIONS } from "../actions";
import { useAuditColumns } from "./columns";

/**
 * The Organization's recent records, newest first.
 *
 * Presentational: it receives the history from the route, which got it through
 * the server funnel. Nothing here reaches the database, which ADR 0007
 * enforces for every path under `src/` that is not `src/server/`.
 *
 * `rowsInDatabase` is the whole point of the total the read returns: a list
 * that stops at the cap must say so, because a silently truncated history
 * looks exactly like a complete one (ADR 0013).
 *
 * Opening a row is a link rather than a click handler, so a record can be
 * bookmarked and sent to a colleague — the same reasoning as the Folio list.
 */
export function AuditTable({
  locale,
  recordHref,
  records,
  timeZone,
  total,
  viewerId,
}: {
  locale: SupportedLocale;
  /** Route prefix the row links extend with `&record=`. A string, not a
      builder, for the reason `FoliosTable` gives. */
  recordHref: string;
  records: readonly AuditRecord[];
  /** The Property the log was opened from, whose wall clock the times use. */
  timeZone: string;
  total: number;
  viewerId: string;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useAuditColumns(locale, timeZone, viewerId, recordHref);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("auditLog")}
        columns={columns}
        data={records}
        empty={
          <EmptyState
            description={t("noAuditDescription")}
            title={t("noAuditTitle")}
          />
        }
        facets={[
          {
            columnId: "action",
            title: t("what"),
            options: KNOWN_ACTIONS.map((action) => ({
              label: t(`auditAction.${action}`),
              value: action,
            })),
          },
        ]}
        labels={labels}
        rowsInDatabase={total}
        searchColumns={["reason", "subjectId", "actorId"]}
      />
    </div>
  );
}
