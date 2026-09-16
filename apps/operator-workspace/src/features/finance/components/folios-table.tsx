"use client";

import { useTranslations } from "next-intl";
import type { FolioSummary } from "@ranza/folios";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useFolioColumns } from "./columns";

/**
 * Every Folio at one Property, open ones first.
 *
 * Presentational: it receives the list from the route, which got it through
 * the server funnel. Nothing here reaches the database, which ADR 0007
 * enforces for every path under `src/` that is not `src/server/`.
 *
 * Selecting a row is a link rather than a click handler, so a Folio can be
 * bookmarked, sent to a colleague, and opened in a second window beside the
 * list — the same reasoning that made arrivals and departures two routes.
 */
export function FoliosTable({
  folioHref,
  folios,
  locale,
}: {
  /** Route prefix the row links extend with `&folio=`. A string, not a
      builder: a server component cannot hand a function across this boundary,
      and React says so at runtime rather than at build time. */
  folioHref: string;
  folios: readonly FolioSummary[];
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useFolioColumns(locale, folioHref);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("folios")}
        columns={columns}
        data={folios}
        empty={
          <EmptyState
            description={t("noFoliosDescription")}
            title={t("noFoliosTitle")}
          />
        }
        labels={labels}
        searchColumns={["guestName"]}
      />
    </div>
  );
}
