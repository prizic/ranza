import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HousekeepingBoard } from "../../../../features/housekeeping/components/housekeeping-board";
import { InspectionSettings } from "../../../../features/housekeeping/components/inspection-settings";
import {
  arrivals,
  departures,
  entitledProperties,
  HOUSEKEEPING_CAPABILITY,
  housekeepingBoard,
  housekeepingInspection,
  MARK_BATCH,
  requireViewer,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";
import { roomsInFilter } from "../../../../server/today-derive";
import type { ListFilterKey } from "../../../../features/today/components/list-filter-notice";
import {
  inRoomFilter,
  parseFloorFilter,
  parseRoomFilter,
  type RoomFilter,
} from "../../../../features/today/views";
import type { HousekeepingRoom } from "@ranza/housekeeping";

/**
 * Housekeeping (RANZ-28, blueprint 5.4): every room at this Property and
 * whether it needs cleaning.
 *
 * Gated by the housekeeping capability. A viewer whose Organization is not
 * entitled to it, who reaches no Property that has it, or who names one where
 * it is switched off, sees the empty state; the database decides the rest.
 */
export default async function HousekeepingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    floor?: string;
    property?: string;
    show?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(HOUSEKEEPING_CAPABILITY);
  const search = await searchParams;
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "housekeeping"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("housekeeping.unavailableDescription")}
        title={t("housekeeping.unavailableTitle")}
      />
    );
  }

  const [board, inspection] = await Promise.all([
    housekeepingBoard(property.propertyId),
    housekeepingInspection(property.propertyId),
  ]);

  // A figure on Today counts part of the board; the board opens narrowed to
  // exactly those rooms (TD-S5-01). Two of the figures are rooms somebody is
  // arriving into or leaving, which only the movements say.
  const filter = parseRoomFilter(search.show);
  const floor = parseFloorFilter(search.floor);
  const [arrivalRows, departureRows] =
    filter === "for_arrival" || filter === "clean_first"
      ? await Promise.all([
          arrivals(property.propertyId),
          departures(property.propertyId, "due"),
        ])
      : [[], []];
  const readyOf = (rooms: readonly HousekeepingRoom[]) =>
    t("dashboard.filterReadyCount", {
      count: rooms.filter((room) => inRoomFilter("ready", room)).length,
    });
  const byFilter = filter
    ? roomsInFilter(filter, board, arrivalRows, departureRows)
    : [];
  const byFloor = floor
    ? board.rooms.filter((room) => room.floor === floor.floor)
    : [];
  // The figures that are "ready of rooms" open the rooms, and the number
  // they lead with is the ready ones among them, which no row says on its own.
  const narrowed = filter
    ? {
        filter: filterKey(filter),
        rooms: byFilter,
        ...(filter === "in_service" ? { detail: readyOf(byFilter) } : {}),
      }
    : floor
      ? {
          filter:
            floor.floor === null
              ? ("filterNoFloor" as const)
              : ("filterFloor" as const),
          floor: String(floor.floor),
          rooms: byFloor,
          detail: readyOf(byFloor),
        }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <HousekeepingBoard
        allHref={`${localizeHref(locale, "housekeeping")}?property=${property.propertyId}`}
        board={board}
        narrowed={narrowed}
        locale={locale}
        markLimit={MARK_BATCH.max}
        propertyName={property.propertyName}
        timeZone={property.timezone}
      />
      {inspection ? (
        <InspectionSettings
          locale={locale}
          propertyId={property.propertyId}
          settings={inspection}
        />
      ) : null}
    </div>
  );
}

const FILTER_KEY = {
  in_service: "filterInService",
  ready: "filterReady",
  awaiting_inspection: "filterAwaitingInspection",
  dirty: "filterDirty",
  out_of_service: "filterOutOfService",
  for_arrival: "filterForArrival",
  clean_first: "filterCleanFirst",
} as const satisfies Record<RoomFilter, ListFilterKey>;

function filterKey(filter: RoomFilter): ListFilterKey {
  return FILTER_KEY[filter];
}
