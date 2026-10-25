import { notFound } from "next/navigation";
import {
  formatDate,
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PortfolioView } from "../../../../features/portfolio";
import { zoneName } from "../../../../features/today/format";
import {
  parsePortfolioSort,
  parsePortfolioView,
} from "../../../../features/portfolio/derive";
import { frontDeskProperty } from "../../../../server/front-desk";
import { ScreenDenied } from "../screen-denied";
import {
  portfolio,
  PortfolioTooLargeError,
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { gateOf } from "../../../../lib/screens";

const SEGMENT = "portfolio";

/**
 * All Properties: the Owner's view across the Properties they reach, one card
 * each, side by side (docs/features/portfolio).
 *
 * It is read for one Organization, because the application has no active
 * Organization of its own (PF-S1-25): the one that owns the Property in
 * `?property=`, which the page writes into the URL as every Property page does
 * so the switcher and the rail name the same one. The Property is chosen from
 * those with analytics, and the read then asks every Property of that
 * Organization again, so a Property without it still appears, withheld.
 *
 * More Properties than the read will compare is shown as a refusal and not as
 * a shorter list (PF-S1-28). Any other failure is the route's error boundary.
 */
export default async function PortfolioPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; sort?: string; view?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await screenProperties(gateOf("analytics"));

  const search = await searchParams;
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale as SupportedLocale, SEGMENT),
  );
  const notAvailable = (
    <ScreenDenied
      denial={await whyDenied(
        gateOf("analytics"),
        (await searchParams).property,
      )}
      locale={locale}
    />
  );
  if (!property) return notAvailable;

  let data;
  try {
    data = await portfolio(property.organizationId);
  } catch (error) {
    if (error instanceof PortfolioTooLargeError) {
      return (
        <EmptyState
          description={t("portfolio.tooLargeDescription", {
            count: error.propertyCount,
            max: error.ceiling,
          })}
          title={t("portfolio.tooLargeTitle")}
        />
      );
    }
    throw error;
  }
  // Signed out between the check above and the read.
  if (!data) return notAvailable;

  // One Property in reach leaves nothing to compare, and what to do about it
  // depends on whether this viewer is the one who gives staff access.
  const peopleHref =
    data.properties.length === 1 &&
    (await screenProperties(gateOf("people"))).some(
      (entry) => entry.organizationId === property.organizationId,
    )
      ? `${localizeHref(locale as SupportedLocale, "people")}?property=${property.propertyId}`
      : null;

  return (
    <PortfolioView
      asOf={t("portfolio.asOf", {
        // The day as well as the hour, and the zone they are in: a tab left
        // open overnight must not show yesterday's figures at a plausible time.
        when: `${formatDate(new Date(data.asOf), locale as SupportedLocale, {
          hour: "2-digit",
          hourCycle: "h23",
          minute: "2-digit",
          timeZone: property.timezone,
        })} · ${zoneName(property.timezone, locale as SupportedLocale)}`,
      })}
      data={data}
      locale={locale as SupportedLocale}
      organizationName={property.organizationName}
      peopleHref={peopleHref}
      sort={parsePortfolioSort(search.sort)}
      view={parsePortfolioView(search.view)}
    />
  );
}
