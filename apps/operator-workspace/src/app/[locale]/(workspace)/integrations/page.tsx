import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IntegrationsView } from "../../../../features/integrations/components/integrations-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  INTEGRATIONS_CAPABILITY,
  INTEGRATIONS_PAGE_SIZE,
  permittedProperties,
  propertyIntegrations,
  requireViewer,
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

  const t = await getTranslations();
  const search = await searchParams;
  const [entitled, viewing, managing] = await Promise.all([
    entitledProperties(INTEGRATIONS_CAPABILITY),
    permittedProperties("integrations.view"),
    permittedProperties("integrations.manage"),
  ]);

  // A Property is offered where it has the capability and the viewer holds a
  // permission for it, and the two ways of having none are told apart: a
  // Subscription that lacks the module is for the Organization to fix, and a
  // missing permission is for whoever manages staff access.
  const permitted = new Set(
    [...viewing, ...managing].map((property) => property.propertyId),
  );
  const properties = entitled.filter((property) =>
    permitted.has(property.propertyId),
  );
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "integrations"),
  );

  if (!property) {
    return permitted.size === 0 ? (
      <EmptyState
        description={t("integrations.noPermissionDescription")}
        title={t("integrations.noPermissionTitle")}
      />
    ) : (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
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
