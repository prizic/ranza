import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { HrView, type HrTab } from "../../../../features/hr/components/hr-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import { screenLinks } from "../../../../server/screen-links";
import {
  hrViewData,
  requireViewer,
  screenProperties,
  whyDenied,
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

  const properties = await screenProperties(gateOf("hr"));
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "hr"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("hr"), (await searchParams).property)}
        locale={locale}
      />
    );
  }

  const { period, week, tab } = await searchParams;
  const [data, links] = await Promise.all([
    hrViewData(property.propertyId, { period, week }),
    // People needs staff permissions that HR does not, so a link to it is
    // offered only to a viewer who may open it (audit 2026-11-07, D-06).
    screenLinks(locale, property.propertyId, ["people"]),
  ]);

  if (!data) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("hr"), (await searchParams).property)}
        locale={locale}
      />
    );
  }

  return (
    <HrView
      data={data}
      initialTab={openingTab(tab, period, week)}
      locale={locale}
      peopleHref={links.people ?? null}
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
