"use client";

import { useMemo } from "react";
import type { Arrival } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { tableLabels } from "../../../lib/table-labels";
import type { Messages } from "../../../messages";
import { arrivalColumns } from "./columns";

/**
 * Today's arrivals.
 *
 * Presentational: it receives the list from the route, which got it through the
 * server funnel. Nothing here reaches the database, which ADR 0007 enforces for
 * every path under `src/` that is not `src/server/`.
 */
export function ArrivalsTable({
  arrivals,
  copy,
  locale,
}: {
  arrivals: readonly Arrival[];
  copy: Messages;
  locale: SupportedLocale;
}) {
  const labels = useMemo(() => tableLabels(copy), [copy]);
  const columns = useMemo(() => arrivalColumns(copy, locale), [copy, locale]);

  return (
    <div className="mt-4">
      <DataTable
        caption={copy.arrivals}
        columns={columns}
        data={arrivals}
        empty={
          <EmptyState
            description={copy.noArrivalsDescription}
            title={copy.noArrivalsTitle}
          />
        }
        labels={labels}
        searchColumns={["guestName", "unitName"]}
      />
    </div>
  );
}
