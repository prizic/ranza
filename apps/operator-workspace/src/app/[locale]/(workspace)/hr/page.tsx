import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HrView, type HrTab } from "../../../../features/hr/components/hr-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  HR_CAPABILITY,
  hrViewData,
  requireViewer,
} from "../../../../server/viewer";

export default async function HrPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    period?: string;
    week?: string;
    tab?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(HR_CAPABILITY);
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "hr"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const { period, week, tab } = await searchParams;
  const data = await hrViewData(property.propertyId, { period, week });

  if (!data) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  return (
    <HrView
      data={data}
      initialTab={openingTab(tab, period, week)}
      locale={locale}
      propertyId={property.propertyId}
    />
  );
}

const TABS: readonly HrTab[] = ["employees", "rota", "leave", "payroll"];

/**
 * Where a link opens: the tab it names, else the one its other parameters
 * belong to — a period is payroll's and a week is the rota's — else the list of
 * people (HR-05).
 */
function openingTab(
  tab: string | undefined,
  period: string | undefined,
  week: string | undefined,
): HrTab {
  const named = TABS.find((candidate) => candidate === tab);
  if (named) return named;
  if (period) return "payroll";
  if (week) return "rota";
  return "employees";
}
