import { notFound } from "next/navigation";
import {
  formatTime,
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PortfolioView } from "../../../../features/portfolio";
import { PORTFOLIO_GATE } from "../../../../lib/portfolio-offer";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  portfolio,
  PortfolioTooLargeError,
  requireViewer,
} from "../../../../server/viewer";

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
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(PORTFOLIO_GATE);

  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale as SupportedLocale, SEGMENT),
  );
  const notAvailable = (
    <EmptyState
      description={t("notEntitledDescription")}
      title={t("notEntitledTitle")}
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

  return (
    <PortfolioView
      asOf={t("portfolio.asOf", {
        time: formatTime(
          new Date(data.asOf),
          locale as SupportedLocale,
          property.timezone,
        ),
      })}
      data={data}
      locale={locale as SupportedLocale}
      organizationName={property.organizationName}
    />
  );
}
