import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { Badge, Card, EmptyState } from "@ranza/ui";
import { messages, type Messages } from "../../../../messages";
import { ownStays } from "../../../../server/viewer";

/**
 * The viewer's own Stay: where, which Unit, and for how long.
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
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, { timeZone: "UTC" });
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
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
    <div className="portal-stack">
      <h1 className="portal-title">{copy.stay}</h1>

      {stays.map((stay) => (
        <Card className="portal-stay" key={stay.stayId}>
          <header className="portal-stay-head">
            <h2>{stay.propertyName}</h2>
            <Badge tone={stay.status === "in_house" ? "success" : "info"}>
              {copy.stayStatus[stay.status]}
            </Badge>
          </header>

          <dl className="portal-facts">
            <Fact label={copy.unit}>
              {stay.unitName}
              <span className="portal-note">
                {copy.unitType[stay.unitType]} · {copy.sleeps}{" "}
                {stay.unitCapacity}
              </span>
            </Fact>
            <Fact label={copy.arrival}>
              <time dateTime={stay.startsOn}>
                {formatStayDate(stay.startsOn, locale)}
              </time>
            </Fact>
            <Fact label={copy.departure}>
              {stay.endsOn ? (
                <time dateTime={stay.endsOn}>
                  {formatStayDate(stay.endsOn, locale)}
                </time>
              ) : (
                copy.openEnded
              )}
            </Fact>
            <Fact label={copy.stay}>{copy.stayType[stay.stayType]}</Fact>
          </dl>
        </Card>
      ))}
    </div>
  );
}
