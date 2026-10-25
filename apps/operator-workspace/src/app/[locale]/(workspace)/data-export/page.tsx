import { notFound } from "next/navigation";
import { calendarDay, isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { DataExportView } from "../../../../features/data-export/components/data-export-view";
import {
  EXPORT_RESOURCE_TYPES,
  type ExportResourceType,
} from "../../../../features/data-export/types";
import {
  exportAbilities,
  listDataExports,
  listExportSchedules,
} from "../../../../server/data-export";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A request begun elsewhere and finished here: the audit log's "export this"
 * names the dataset and the days it was looking at. Anything that is not a
 * dataset or a day is ignored, because the URL is one somebody can edit.
 */
function draftFrom(search: { dataset?: string; from?: string; to?: string }): {
  resources: ExportResourceType[];
  format: "csv";
  range: { from: string | null; to: string | null } | null;
} | null {
  const dataset = EXPORT_RESOURCE_TYPES.find((type) => type === search.dataset);
  if (!dataset) return null;
  const from = search.from && DAY.test(search.from) ? search.from : null;
  const to = search.to && DAY.test(search.to) ? search.to : null;
  return {
    resources: [dataset],
    format: "csv",
    range: from || to ? { from, to } : null,
  };
}

export default async function DataExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    unavailable?: string;
    dataset?: string;
    from?: string;
    to?: string;
  }>;
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

  const [exports, schedules, abilities] = await Promise.all([
    listDataExports(property.propertyId),
    listExportSchedules(property.propertyId),
    exportAbilities(property.propertyId),
  ]);

  return (
    <DataExportView
      abilities={abilities}
      exports={exports}
      initialDraft={draftFrom(search)}
      locale={locale}
      organization={property.organizationName}
      propertyId={property.propertyId}
      propertyName={property.propertyName}
      schedules={schedules}
      timezone={property.timezone}
      today={calendarDay(property.timezone)}
      unavailable={search.unavailable === "1"}
    />
  );
}
