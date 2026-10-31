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
  bookableUnits,
  bookingDay,
  permittedProperties,
  requireViewer,
  ROOM_CALENDAR_DEFAULT_LENGTH,
  ROOM_CALENDAR_LENGTHS,
  roomCalendar,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import { defaultStayTypeFor } from "../../../../lib/booking-defaults";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * The room calendar (RANZ-25): rooms and beds against days, bookings and
 * Stays as bars.
 *
 * It writes nothing of its own. A drag only proposes: a bar moved opens the
 * dialogs of ADR 0039, or a one-press confirm for a pulled end (RC-S5-04), and
 * nights dragged across open New reservation (RC-S5-02); each saves through
 * its command, which checks the caller and refuses a conflict (RC-S3-01). The
 * drawer offers Check in and Check out by the same components Arrivals and
 * Departures use (RC-S5-03).
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

  // Offering New reservation is the screen's half and refusing a booking stays
  // the policies', as on Reservations (RG-S3-05).
  const mayBook = (await permittedProperties("front_desk.book")).some(
    (permitted) => permitted.propertyId === property.propertyId,
  );
  const units = mayBook ? await bookableUnits(property.propertyId) : [];
  const today = units.length > 0 ? await bookingDay(property.propertyId) : null;

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
        booking={
          today
            ? {
                units,
                today,
                defaultStayType: defaultStayTypeFor(property.operatingModel),
              }
            : null
        }
        defaultLength={ROOM_CALENDAR_DEFAULT_LENGTH}
        initialView={view}
        lengths={[...ROOM_CALENDAR_LENGTHS]}
        locale={locale}
        scope={scope}
      />
    </Hydrated>
  );
}
