import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { HousekeepingBoard } from "../../../../features/housekeeping/components/housekeeping-board";
import {
  currentViewer,
  entitledProperties,
  HOUSEKEEPING_CAPABILITY,
  housekeepingBoard,
  MARK_BATCH,
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

  const t = await getTranslations();
  const viewer = await currentViewer();
  const properties = await entitledProperties(HOUSEKEEPING_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property || !viewer) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const board = await housekeepingBoard(property.propertyId);

  return (
    <HousekeepingBoard
      board={board}
      locale={locale}
      markLimit={MARK_BATCH.max}
      propertyName={property.propertyName}
      timeZone={property.timezone}
    />
  );
}
