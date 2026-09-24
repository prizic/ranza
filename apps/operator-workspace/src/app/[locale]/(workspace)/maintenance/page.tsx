import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { MaintenanceBoard } from "../../../../features/maintenance/components/maintenance-board";
import {
  CANCEL_REASON,
  DETAILS,
  entitledProperties,
  EQUIPMENT_CATEGORY,
  EQUIPMENT_LOCATION,
  EQUIPMENT_NAME,
  equipmentRegister,
  MAINTENANCE_CAPABILITY,
  maintenanceBoard,
  maintenanceReportOptions,
  maintenanceSettings,
  requireViewer,
  RETURN_NOTE,
  SERVICE_INTERVAL,
  TITLE,
  VENDOR,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Maintenance (RANZ-33, blueprint 5.13 and 6.5): the problems reported at
 * this Property, the work on them, the rooms they hold out of order, and the
 * equipment serviced on a plan.
 *
 * Gated by the maintenance capability. A viewer whose Organization is not
 * entitled to it, or who reaches no Property that has it, sees the empty state;
 * the database decides the rest. `?report=<unit>` opens the report form with
 * that Unit chosen, which is how Rooms hands a problem over (MT-S1-24).
 */
export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; report?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  await requireViewer(locale);

  const t = await getTranslations();
  const query = await searchParams;
  const properties = await entitledProperties(MAINTENANCE_CAPABILITY);
  const property = frontDeskProperty(properties, query);

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const [board, options, settings, register] = await Promise.all([
    maintenanceBoard(property.propertyId),
    maintenanceReportOptions(property.propertyId),
    maintenanceSettings(property.propertyId),
    equipmentRegister(property.propertyId),
  ]);
  // Only a Unit the form can offer: a stale link, or one to another
  // Property, opens nothing rather than a form that cannot be sent.
  const reportUnitId = options.units.some(
    (unit) => unit.unitId === query.report,
  )
    ? (query.report ?? null)
    : null;

  return (
    <MaintenanceBoard
      board={board}
      limits={{
        title: TITLE.max,
        details: DETAILS.max,
        cancelReason: CANCEL_REASON.max,
        note: RETURN_NOTE.max,
        vendor: VENDOR.max,
        equipment: {
          name: EQUIPMENT_NAME.max,
          category: EQUIPMENT_CATEGORY.max,
          location: EQUIPMENT_LOCATION.max,
          interval: SERVICE_INTERVAL.max,
        },
      }}
      locale={locale}
      options={options}
      propertyId={property.propertyId}
      propertyName={property.propertyName}
      register={register}
      reportUnitId={reportUnitId}
      settings={settings}
      timeZone={property.timezone}
    />
  );
}
