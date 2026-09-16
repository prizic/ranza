import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { Badge, EmptyState } from "@ranza/ui";
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
      <p className="text-muted-foreground">
        {copy.arrivalsAt} {property.propertyName}
      </p>

      {today.length === 0 ? (
        <div className="pt-6">
          <EmptyState
            description={copy.noArrivalsDescription}
            title={copy.noArrivalsTitle}
          />
        </div>
      ) : (
        <ul className="m-0 mt-4 list-none p-0">
          {today.map((arrival) => (
            <li
              className="grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-4 border-b border-border py-5 sm:grid-cols-[1fr_auto_auto]"
              key={arrival.reservationId}
            >
              <div>
                <p className="text-step-1">{arrival.guestName}</p>
                <p className="mt-0.5 text-step--1 text-muted-foreground">
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

              {/* The Unit takes the place Today gives the clock: at a front
                  desk the room number is the fact read at arm's length. */}
              <p className="flex flex-col items-end text-end">
                <span className="text-step-1 leading-none tabular-nums">
                  {arrival.unitName}
                </span>
                <span className="text-step--1 text-muted-foreground">
                  {copy.unitType[arrival.unitType]}
                </span>
              </p>

              {arrival.canCheckIn ? (
                <CheckInForm
                  copy={copy}
                  locale={locale}
                  reservationId={arrival.reservationId}
                />
              ) : (
                // Text, not a colour: a status has to survive being printed,
                // exported and read aloud (blueprint 18.5).
                <Badge
                  className="col-span-full sm:col-span-1"
                  variant="secondary"
                >
                  {copy.reservationStatus[arrival.status]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
