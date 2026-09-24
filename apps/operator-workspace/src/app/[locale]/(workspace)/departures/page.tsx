import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { DeparturesTable } from "../../../../features/front-office/components/departures-table";
import {
  departures,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Departures: who is due to leave, and anyone who should already have gone.
 *
 * The overdue rows are why this is a screen rather than a column on the
 * arrivals one. A list showing only today hides the Guest who should have left
 * on Tuesday, which is the row a front desk most needs.
 */
export default async function DeparturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("departuresAt")} {property.propertyName}
      </p>
      <DeparturesTable
        departures={await departures(property.propertyId)}
        locale={locale}
      />
    </>
  );
}
