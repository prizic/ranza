"use client";

import { useMemo } from "react";
import type { Arrival, Departure } from "@ranza/reservations";
import {
  DataTable,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { tableLabels } from "../../../lib/table-labels";
import type { Messages } from "../../../messages";
import { arrivalColumns, departureColumns } from "./columns";

/**
 * The day's movement: who is arriving, who is leaving.
 *
 * Tabs rather than two stacked tables, because a front desk works one of these
 * at a time and the second would push the first off the screen. The counts are
 * in the triggers so the unattended one still says how much is waiting.
 *
 * Presentational: it receives both lists from the route, which got them through
 * the server funnel. Nothing here reaches the database, which ADR 0007 enforces
 * for every path under `src/` that is not `src/server/`.
 */
export function FrontOfficeTables({
  arrivals,
  copy,
  departures,
  locale,
}: {
  arrivals: readonly Arrival[];
  copy: Messages;
  departures: readonly Departure[];
  locale: SupportedLocale;
}) {
  const labels = useMemo(() => tableLabels(copy), [copy]);
  const arrivalCols = useMemo(
    () => arrivalColumns(copy, locale),
    [copy, locale],
  );
  const departureCols = useMemo(
    () => departureColumns(copy, locale),
    [copy, locale],
  );

  return (
    <Tabs className="mt-4" defaultValue="arrivals">
      <TabsList>
        <TabsTrigger value="arrivals">
          {copy.arrivals}
          <span className="ms-1.5 tabular-nums text-muted-foreground">
            {arrivals.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="departures">
          {copy.departures}
          <span className="ms-1.5 tabular-nums text-muted-foreground">
            {departures.length}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="arrivals">
        <DataTable
          caption={copy.arrivals}
          columns={arrivalCols}
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
      </TabsContent>

      <TabsContent value="departures">
        <DataTable
          caption={copy.departures}
          columns={departureCols}
          data={departures}
          empty={
            <EmptyState
              description={copy.noDeparturesDescription}
              title={copy.noDeparturesTitle}
            />
          }
          labels={labels}
          searchColumns={["guestName", "unitName"]}
        />
      </TabsContent>
    </Tabs>
  );
}
