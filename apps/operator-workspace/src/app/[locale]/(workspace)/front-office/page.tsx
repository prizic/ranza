import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { messages } from "../../../../messages";
import {
  arrivals,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
} from "../../../../server/viewer";
import { CheckInForm } from "./check-in-form";

/**
 * Front Office: who is arriving today, and the one action worth taking on them.
 *
 * Arrivals only. Blueprint 5.3 also covers departures, room moves, extensions
 * and a Reservation timeline, and none of them are built — a screen that listed
 * them greyed out would be advertising, not an interface.
 *
 * The list is not filtered again here. The policies and the capability gate
 * decided it, and a second application-side check would be the weaker of the
 * two while inviting somebody to trust it instead of the database.
 */

/**
 * `startsOn` is a calendar date, not an instant, so it is parsed and formatted
 * in UTC. Anything else shifts the date by a day for a reader west of the
 * meridian and shows them the wrong arrival.
 */
function formatArrivalDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "long",
    timeZone: "UTC",
  });
}

export default async function FrontOfficePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const [fallback] = properties;

  if (!fallback) {
    return (
      <EmptyState
        description={copy.noFrontDeskDescription}
        title={copy.noFrontDeskTitle}
      />
    );
  }

  // A Property the viewer may not reach is simply absent from this list, so an
  // unknown or forged ?property= falls back to the first one they can reach.
  const { property: requested } = await searchParams;
  const property =
    properties.find((candidate) => candidate.propertyId === requested) ??
    fallback;

  const today = await arrivals(property.propertyId);

  return (
    <>
      <header className="day">
        <div>
          <h1>{copy.frontOffice}</h1>
          <p className="day-date">
            {copy.arrivalsAt} {property.propertyName}
          </p>
        </div>
      </header>

      {today.length === 0 ? (
        <EmptyState
          description={copy.noArrivalsDescription}
          title={copy.noArrivalsTitle}
        />
      ) : (
        <ul className="arrivals">
          {today.map((arrival) => (
            <li className="arrival" key={arrival.reservationId}>
              <div className="arrival-who">
                <p className="arrival-name">{arrival.guestName}</p>
                <p className="arrival-detail">
                  {copy.stayType[arrival.stayType]} ·{" "}
                  <time dateTime={arrival.startsOn}>
                    {formatArrivalDate(arrival.startsOn, locale)}
                  </time>
                  {arrival.endsOn ? (
                    <>
                      {" – "}
                      <time dateTime={arrival.endsOn}>
                        {formatArrivalDate(arrival.endsOn, locale)}
                      </time>
                    </>
                  ) : (
                    <> · {copy.openEnded}</>
                  )}
                </p>
              </div>

              <p className="arrival-unit">
                <strong>{arrival.unitName}</strong>
                <span>{copy.unitType[arrival.unitType]}</span>
              </p>

              {arrival.canCheckIn ? (
                <CheckInForm
                  copy={copy}
                  locale={locale}
                  reservationId={arrival.reservationId}
                />
              ) : (
                <p className="arrival-status">
                  {copy.reservationStatus[arrival.status]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
