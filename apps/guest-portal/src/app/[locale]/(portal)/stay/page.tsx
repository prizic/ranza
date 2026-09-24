import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, Fact, FactList, PageHeader } from "@ranza/ui";
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
 * from the interface is exactly what the Portal must not do (ADR 0009).
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
  setRequestLocale(locale);

  const t = await getTranslations();
  const stays = await ownStays();

  if (stays.length === 0) {
    return (
      <EmptyState
        description={t("noStayDescription")}
        title={t("noStayTitle")}
      />
    );
  }

  return (
    <>
      {stays.map((stay) => (
        <section key={stay.stayId}>
          <PageHeader
            aside={
              // The Unit takes the place the Workspace gives the clock: on a
              // phone, in a corridor, the room number is the one fact worth
              // reading at arm's length.
              <p className="flex flex-col items-end text-end">
                <span className="text-step-2 leading-none">
                  {stay.unitName}
                </span>
                <span className="text-step--1 text-muted-foreground">
                  {t(`unitType.${stay.unitType}`)} ·{" "}
                  {t("sleeps", { count: stay.unitCapacity })}
                </span>
              </p>
            }
          >
            {/* A Property name is not a weekday: several words, sometimes long,
                read on a 390px screen. Same role as Today's heading, smaller
                voice. */}
            <h2 className="text-[clamp(1.75rem,6vw,2.75rem)] leading-[1.05] font-light">
              {stay.propertyName}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {t(`stayStatus.${stay.status}`)}
            </p>
          </PageHeader>

          <FactList>
            <Fact label={t("arrival")}>
              <time dateTime={stay.startsOn}>
                {formatStayDate(stay.startsOn, locale)}
              </time>
            </Fact>
            <Fact label={t("departure")}>
              {stay.endsOn ? (
                <time dateTime={stay.endsOn}>
                  {formatStayDate(stay.endsOn, locale)}
                </time>
              ) : (
                t("openEnded")
              )}
            </Fact>
            <Fact label={t("stay")}>{t(`stayType.${stay.stayType}`)}</Fact>
          </FactList>
        </section>
      ))}
    </>
  );
}
