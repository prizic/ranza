import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DataExportView } from "../../../../features/data-export/components/data-export-view";
import {
  listDataExports,
  listExportSchedules,
} from "../../../../server/data-export";
import { frontDeskProperty } from "../../../../server/front-desk";
import { permittedProperties, requireViewer } from "../../../../server/viewer";

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

  const t = await getTranslations();
  const search = await searchParams;
  const properties = await permittedProperties("data_export.read");
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "data-export"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const [exports, schedules] = await Promise.all([
    listDataExports(),
    listExportSchedules(),
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
