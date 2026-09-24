import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HousekeepingBoard } from "../../../../features/housekeeping/components/housekeeping-board";
import { InspectionSettings } from "../../../../features/housekeeping/components/inspection-settings";
import {
  entitledProperties,
  HOUSEKEEPING_CAPABILITY,
  housekeepingBoard,
  housekeepingInspection,
  MARK_BATCH,
  requireViewer,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Housekeeping (RANZ-28, blueprint 5.4): every room at this Property and
 * whether it needs cleaning.
 *
 * Gated by the housekeeping capability. A viewer whose Organization is not
 * entitled to it, or who reaches no Property that has it, sees the empty state;
 * the database decides the rest.
 */
export default async function HousekeepingPage({
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
  const properties = await entitledProperties(HOUSEKEEPING_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const [board, inspection] = await Promise.all([
    housekeepingBoard(property.propertyId),
    housekeepingInspection(property.propertyId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <HousekeepingBoard
        board={board}
        locale={locale}
        markLimit={MARK_BATCH.max}
        propertyName={property.propertyName}
        timeZone={property.timezone}
      />
      {inspection ? (
        <InspectionSettings
          locale={locale}
          propertyId={property.propertyId}
          settings={inspection}
        />
      ) : null}
    </div>
  );
}
