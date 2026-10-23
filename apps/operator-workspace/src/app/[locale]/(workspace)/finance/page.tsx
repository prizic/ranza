import { notFound } from "next/navigation";
import { formatMoney, isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FoliosTable } from "../../../../features/finance/components/folios-table";
import { FolioPanel } from "../../../../features/finance/components/folio-panel";
import {
  AUDIT_READ_PERMISSION,
  entitledProperties,
  folio,
  FOLIO_CAPABILITY,
  folioPage,
  FRONT_DESK_CAPABILITY,
  permittedProperties,
  POST_CHARGE_PERMISSION,
  POST_PAYMENT_PERMISSION,
  requireViewer,
  REVERSE_CHARGE_PERMISSION,
  REVERSE_PAYMENT_PERMISSION,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";
import { FolioTabs } from "../../../../features/finance/components/folio-tabs";
import { FOLIO_TABS, parseFolioTab } from "../../../../features/finance/derive";
import { owedMinor, totals } from "../../../../features/today/views";

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
    // The folio's own history, where the Audit log narrows to it: offered to a
    // viewer who may read the log at its Property and to nobody else.
    const mayReadHistory = (
      await permittedProperties(AUDIT_READ_PERMISSION)
    ).some((reachable) => reachable.propertyId === selected.propertyId);
    const mayOpenReservation = (
      await entitledProperties(FRONT_DESK_CAPABILITY)
    ).some((reachable) => reachable.propertyId === selected.propertyId);
    return (
      <>
        <p className="text-sm text-muted-foreground">{property.propertyName}</p>
        <FolioPanel
          auditHref={
            mayReadHistory
              ? `${localizeHref(locale, "audit-log")}?${new URLSearchParams({ property: selected.propertyId, subject: selected.folioId })}`
              : null
          }
          folio={selected}
          locale={locale}
          mayOpenReservation={mayOpenReservation}
          mayPostCharge={mayPostCharge}
          mayPostPayment={mayPostPayment}
          mayReverse={mayReverseCharge}
          mayReverseCharge={mayReverseCharge}
          mayReversePayment={mayReversePayment}
          propertyId={selected.propertyId}
          timeZone={folioProperty.timezone}
        />
      </>
    );
  }

  const financeHref = `${localizeHref(locale, "finance")}?property=${property.propertyId}`;
  const tab = parseFolioTab(search.show);
  const { folios: shown, total } = await folioPage(property.propertyId, tab);
  const owing = tab === "owing" ? shown : [];
  const owedTotal = totals(
    owing.map((row) => ({
      amountMinor: owedMinor(row),
      currency: row.currency,
    })),
  );
  const tabHrefs = Object.fromEntries(
    FOLIO_TABS.map((candidate) => [
      candidate,
      candidate === "all" ? financeHref : `${financeHref}&show=${candidate}`,
    ]),
  ) as Record<(typeof FOLIO_TABS)[number], string>;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("foliosAt")} {property.propertyName}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <FolioTabs current={tab} hrefs={tabHrefs} />
        {tab === "owing" && owedTotal[0] ? (
          <p
            className="text-sm text-muted-foreground tabular-nums"
            data-testid="owing-summary"
          >
            {t("finance.owingSummary", {
              count: total,
              amount: formatMoney(
                owedTotal[0].amountMinor,
                owedTotal[0].currency,
                locale,
              ),
            })}
          </p>
        ) : null}
      </div>
      <FoliosTable
        allHref={financeHref}
        folioHref={financeHref}
        folios={shown}
        locale={locale}
        tab={tab}
        total={total}
      />
    </>
  );
}
