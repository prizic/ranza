import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { DataExportView } from "../../../../features/data-export/components/data-export-view";
import {
  listDataExports,
  listExportSchedules,
} from "../../../../server/data-export";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";

export default async function DataExportPage({
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

  const search = await searchParams;
  const properties = await screenProperties(gateOf("data-export"));
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "data-export"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("data-export"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const [exports, schedules] = await Promise.all([
    listDataExports(property.propertyId),
    listExportSchedules(property.propertyId),
  ]);

  return (
    <DataExportView
      exports={exports}
      schedules={schedules}
      locale={locale}
      propertyId={property.propertyId}
    />
  );
}
