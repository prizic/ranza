import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { IntegrationsView } from "../../../../features/integrations/components/integrations-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  INTEGRATIONS_PAGE_SIZE,
  permittedProperties,
  propertyIntegrations,
  requireViewer,
  screenProperties,
  whyDenied,
  type FailureView,
} from "../../../../server/viewer";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    view?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const search = await searchParams;
  // One gate for the rail and for this page: the Integrations capability at the
  // Property, and a permission to see or to manage them (lib/screens.ts).
  const properties = await screenProperties(gateOf("integrations"));
  const managing = await permittedProperties("integrations.manage");
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "integrations"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("integrations"), search.property)}
        locale={locale}
      />
    );
  }

  const view: FailureView = one(search.view) === "closed" ? "closed" : "open";
  const requestedPage = pageNumber(one(search.page));
  let data = await propertyIntegrations(
    property.organizationId,
    property.propertyId,
    view,
    requestedPage,
  );
  const lastPage = Math.max(
    1,
    Math.ceil(data.failures.total / INTEGRATIONS_PAGE_SIZE),
  );
  // A bookmarked page that no longer exists (failures were closed since) is the
  // last one there is, not an empty list that claims there is nothing.
  if (requestedPage > lastPage) {
    data = await propertyIntegrations(
      property.organizationId,
      property.propertyId,
      view,
      lastPage,
    );
  }

  return (
    <IntegrationsView
      endpoints={data.endpoints}
      failures={data.failures}
      hrefs={{
        open: `${localizeHref(locale, "integrations")}?property=${property.propertyId}`,
        closed: `${localizeHref(locale, "integrations")}?property=${property.propertyId}&view=closed`,
      }}
      locale={locale}
      mayActOnFailures={managing.some(
        (permittedProperty) =>
          permittedProperty.propertyId === property.propertyId,
      )}
      openTotal={data.openTotal}
      page={Math.min(requestedPage, lastPage)}
      pageSize={INTEGRATIONS_PAGE_SIZE}
      propertyId={property.propertyId}
      view={view}
      viewerId={data.viewerId}
    />
  );
}
