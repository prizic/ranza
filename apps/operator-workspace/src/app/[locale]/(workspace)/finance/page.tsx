import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FoliosTable } from "../../../../features/finance/components/folios-table";
import { FolioPanel } from "../../../../features/finance/components/folio-panel";
import {
  entitledProperties,
  folio,
  FOLIO_CAPABILITY,
  folios,
  permittedProperties,
  POST_CHARGE_PERMISSION,
  POST_PAYMENT_PERMISSION,
  requireViewer,
  REVERSE_CHARGE_PERMISSION,
  REVERSE_PAYMENT_PERMISSION,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";
import { ListFilterNotice } from "../../../../features/today/components/list-filter-notice";
import { money } from "../../../../features/today/format";
import {
  inFolioFilter,
  parseFolioFilter,
  totals,
} from "../../../../features/today/views";

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
  searchParams: Promise<{
    folio?: string;
    property?: string;
    show?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const search = await searchParams;
  const properties = await entitledProperties(FOLIO_CAPABILITY);
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "finance"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("noFinanceDescription")}
        title={t("noFinanceTitle")}
      />
    );
  }

  // A `?folio=` the viewer cannot reach comes back null, exactly as one that
  // never existed does, and both fall through to the list. What a viewer
  // cannot see should not be distinguishable from what is not there.
  const selected = search.folio ? await folio(search.folio) : null;

  if (selected) {
    // Asked about the Folio's own Property, as the insert policy asks it.
    const [canCharge, canReverseCharge, canPayment, canReversePayment] =
      await Promise.all([
        permittedProperties(POST_CHARGE_PERMISSION),
        permittedProperties(REVERSE_CHARGE_PERMISSION),
        permittedProperties(POST_PAYMENT_PERMISSION),
        permittedProperties(REVERSE_PAYMENT_PERMISSION),
      ]);
    const mayPostCharge = canCharge.some(
      (reachable) => reachable.propertyId === selected.propertyId,
    );
    const mayReverseCharge = canReverseCharge.some(
      (reachable) => reachable.propertyId === selected.propertyId,
    );
    const mayPostPayment = canPayment.some(
      (reachable) => reachable.propertyId === selected.propertyId,
    );
    const mayReversePayment = canReversePayment.some(
      (reachable) => reachable.propertyId === selected.propertyId,
    );
    const folioProperty =
      properties.find(
        (candidate) => candidate.propertyId === selected.propertyId,
      ) ?? property;
    return (
      <>
        <p className="text-sm text-muted-foreground">{property.propertyName}</p>
        <FolioPanel
          folio={selected}
          locale={locale}
          mayPostCharge={mayPostCharge}
          mayPostPayment={mayPostPayment}
          mayReverse={mayReverseCharge}
          mayReverseCharge={mayReverseCharge}
          mayReversePayment={mayReversePayment}
          timeZone={folioProperty.timezone}
        />
      </>
    );
  }

  const financeHref = `${localizeHref(locale, "finance")}?property=${property.propertyId}`;
  const filter = parseFolioFilter(search.show);
  const shown = (await folios(property.propertyId)).filter((row) =>
    inFolioFilter(filter, row),
  );
  const first = shown[0];

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("foliosAt")} {property.propertyName}
      </p>
      {filter ? (
        <div className="mt-4">
          <ListFilterNotice
            allHref={financeHref}
            count={shown.length}
            detail={
              first
                ? money(
                    totals(
                      shown.map((row) => ({
                        amountMinor: row.balanceMinor,
                        currency: row.currency,
                      })),
                    ),
                    first.currency,
                    locale,
                  )
                : undefined
            }
            filter="filterOpenFolios"
          />
        </div>
      ) : null}
      <FoliosTable folioHref={financeHref} folios={shown} locale={locale} />
    </>
  );
}
