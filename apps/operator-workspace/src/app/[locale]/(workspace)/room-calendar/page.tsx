import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { LiveRoomCalendar } from "../../../../features/room-calendar/components/live-room-calendar";
import { frontOfficeKeys } from "../../../../features/front-office/query-keys";
import {
  parseView,
  readRemembered,
  ROOM_CALENDAR_COOKIE,
} from "../../../../features/room-calendar/view";
import { Hydrated, requestQueryClient } from "../../../providers/hydrate";
import {
  requireViewer,
  ROOM_CALENDAR_DEFAULT_LENGTH,
  ROOM_CALENDAR_LENGTHS,
  roomCalendar,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * The room calendar (RANZ-25): rooms and beds against days, bookings and
 * Stays as bars.
 *
 * It writes nothing of its own. Most commands a bar points at have one home —
 * Arrivals, Departures, Reservations — so the drawer links there rather than
 * repeating them (RC-DEF-04). Moving is the exception: a drag only proposes,
 * and the dialogs of ADR 0039 save it through their commands, which check the
 * caller and refuse a conflict (RC-S3-01).
 *
 * Live, like Arrivals (ADR 0019 names the room rack): prefetched here so it
 * paints with bars, then polled. The window in the URL is the one prefetched;
 * moving it afterwards is the client's, through the refresh route.
 */
export default async function RoomCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const viewer = await requireViewer(locale);
  const search = await searchParams;
  const properties = await screenProperties(gateOf("room-calendar"));
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "room-calendar"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("room-calendar"),
          [search.property].flat()[0],
        )}
        locale={locale}
      />
    );
  }

  const view = parseView(
    search,
    readRemembered((await cookies()).get(ROOM_CALENDAR_COOKIE)?.value),
    ROOM_CALENDAR_LENGTHS,
    ROOM_CALENDAR_DEFAULT_LENGTH,
  );
  // From the server, where they were decided: every cache key starts with
  // these three (ADR 0019).
  const scope = {
    organizationId: property.organizationId,
    propertyId: property.propertyId,
    userId: viewer.userId,
  };
  const calendarWindow = { from: view.from, days: view.days };

  // Per request, never module scope: one tenant's calendar must not be
  // dehydrated into another's HTML.
  const client = requestQueryClient();
  await client.prefetchQuery({
    queryKey: frontOfficeKeys.roomCalendar(scope, calendarWindow),
    queryFn: () => roomCalendar(property.propertyId, calendarWindow),
  });

  return (
    <Hydrated client={client}>
      <LiveRoomCalendar
        defaultLength={ROOM_CALENDAR_DEFAULT_LENGTH}
        initialView={view}
        lengths={[...ROOM_CALENDAR_LENGTHS]}
        locale={locale}
        scope={scope}
      />
    </Hydrated>
  );
}
