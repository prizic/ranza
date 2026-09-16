import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { messages, type Messages } from "../../../../messages";
import { ownStays } from "../../../../server/viewer";

/**
 * The viewer's own Stay: where, which Unit, and for how long.
 *
 * The Property leads and the Unit sits opposite it, in the place the Workspace
 * puts the clock — on a phone, in a corridor, the room number is the fact worth
 * reading at arm's length. Everything else is stored and shown plainly; nothing
 * here is derived or invented.
 *
 * The list is whatever survived the policies and the capability gate. It is not
 * filtered again here, because a second application-side check would be the
 * weaker of the two and would invite trusting it.
 *
 * An empty list renders an empty state rather than an error. Having no current
 * Stay is a normal thing to be — and it is the same answer given to a departed
 * Resident, to a Staff Member who signed in here, and to a Property whose
 * Organization is not entitled to this capability. Telling those four apart
 * from the interface is exactly what the Portal must not do (ADR 0008).
 */

/**
 * `startsOn` is a calendar date, not an instant, so it is parsed and formatted
 * in UTC. Anything else would shift the date by a day for a viewer west of the
 * meridian and quietly show them the wrong arrival.
 */
function formatStayDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "long",
    timeZone: "UTC",
  });
}

export default async function StayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy: Messages = messages[locale];
  const stays = await ownStays();

  if (stays.length === 0) {
    return (
      <EmptyState
        description={copy.noStayDescription}
        title={copy.noStayTitle}
      />
    );
  }

  return (
    <>
      {stays.map((stay) => (
        <section className="stay" key={stay.stayId}>
          <header className="day">
            <div>
              <h1>{stay.propertyName}</h1>
              <p className="day-date">{copy.stayStatus[stay.status]}</p>
            </div>
            <p className="day-clock stay-unit">
              <strong>{stay.unitName}</strong>
              <span>
                {copy.unitType[stay.unitType]} · {copy.sleeps}{" "}
                {stay.unitCapacity}
              </span>
            </p>
          </header>

          <dl className="facts">
            <div>
              <dt>{copy.arrival}</dt>
              <dd>
                <time dateTime={stay.startsOn}>
                  {formatStayDate(stay.startsOn, locale)}
                </time>
              </dd>
            </div>
            <div>
              <dt>{copy.departure}</dt>
              <dd>
                {stay.endsOn ? (
                  <time dateTime={stay.endsOn}>
                    {formatStayDate(stay.endsOn, locale)}
                  </time>
                ) : (
                  copy.openEnded
                )}
              </dd>
            </div>
            <div>
              <dt>{copy.stay}</dt>
              <dd>{copy.stayType[stay.stayType]}</dd>
            </div>
          </dl>
        </section>
      ))}
    </>
  );
}
