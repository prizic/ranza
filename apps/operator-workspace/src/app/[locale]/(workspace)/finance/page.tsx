import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { FoliosTable } from "../../../../features/finance/components/folios-table";
import { FolioPanel } from "../../../../features/finance/components/folio-panel";
import {
  entitledProperties,
  folio,
  folios,
  FOLIO_CAPABILITY,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Finance: what each Stay at a Property has accrued, and the charges on one.
 *
 * One route with two states rather than two routes, because the second is the
 * first with a row chosen — `?folio=` reads the same way `?property=` already
 * does, and both survive being bookmarked or sent to a colleague. Arrivals and
 * departures are two routes because they are two jobs; this is one job at two
 * depths.
 *
 * Neither list is filtered again here. The policies and the capability gate
 * decided both, and a second application-side check would be the weaker of the
 * two while inviting somebody to trust it instead of the database.
 */
export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ folio?: string; property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const search = await searchParams;
  const properties = await entitledProperties(FOLIO_CAPABILITY);
  const property = frontDeskProperty(properties, search);

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  // A `?folio=` the viewer cannot reach comes back null, exactly as one that
  // never existed does, and both fall through to the list. What a viewer
  // cannot see should not be distinguishable from what is not there.
  const selected = search.folio ? await folio(search.folio) : null;

  if (selected) {
    const back = `${localizeHref(locale, "finance")}?property=${property.propertyId}`;
    return (
      <>
        <p className="text-sm text-muted-foreground">
          <a className="hover:underline" href={back}>
            {t("allFolios")}
          </a>
          {" · "}
          {property.propertyName}
        </p>
        <FolioPanel folio={selected} locale={locale} />
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("foliosAt")} {property.propertyName}
      </p>
      <FoliosTable
        folioHref={`${localizeHref(locale, "finance")}?property=${property.propertyId}`}
        folios={await folios(property.propertyId)}
        locale={locale}
      />
    </>
  );
}
