"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FolioSummary } from "@ranza/folios";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import type { FolioTab } from "../derive";
import { useFolioColumns } from "./columns";

/**
 * The Folios of one tab at one Property, the ones owing the most first.
 *
 * Presentational: it receives the list from the route, which got it through
 * the server funnel. Nothing here reaches the database, which ADR 0007
 * enforces for every path under `src/` that is not `src/server/`.
 *
 * Selecting a row is a link rather than a click handler, so a Folio can be
 * bookmarked, sent to a colleague, and opened in a second window beside the
 * list — the same reasoning that made arrivals and departures two routes.
 *
 * A tab with nothing in it says so and offers the whole list: "no folio owes
 * anything" is not "there are no folios" (RANZ rule 5).
 */
export function FoliosTable({
  allHref,
  folioHref,
  folios,
  locale,
  tab,
  total,
}: {
  /** The same Property's list with no tab chosen. */
  allHref: string;
  /** Route prefix the row links extend with `&folio=`. A string, not a
      builder: a server component cannot hand a function across this boundary,
      and React says so at runtime rather than at build time. */
  folioHref: string;
  folios: readonly FolioSummary[];
  locale: SupportedLocale;
  tab: FolioTab;
  /** How many Folios the tab holds in all, which may be more than `folios`. */
  total: number;
}) {
  const t = useTranslations();
  const f = useTranslations("finance");
  const labels = useTableLabels();
  const columns = useFolioColumns(locale, folioHref);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("folios")}
        columns={columns}
        data={folios}
        empty={
          tab === "all" ? (
            <EmptyState
              description={t("noFoliosDescription")}
              title={t("noFoliosTitle")}
            />
          ) : (
            <EmptyState
              action={
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  href={allHref}
                  prefetch={false}
                >
                  {f("showAll")}
                </Link>
              }
              description={f(`empty.${tab}Description`)}
              title={f(`empty.${tab}Title`)}
            />
          )
        }
        getRowId={(row) => row.folioId}
        labels={{
          ...labels,
          searchBy: () => t("searchGuestRoomReference"),
        }}
        rowsInDatabase={total}
        searchColumns={["guestName", "unitName", "reference"]}
      />
    </div>
  );
}
