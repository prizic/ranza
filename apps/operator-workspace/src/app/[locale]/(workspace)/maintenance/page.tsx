import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { MaintenanceBoard } from "../../../../features/maintenance/components/maintenance-board";
import {
  CANCEL_REASON,
  DETAILS,
  EQUIPMENT_CATEGORY,
  EQUIPMENT_LOCATION,
  EQUIPMENT_NAME,
  equipmentRegister,
  maintenanceBoard,
  maintenanceReportOptions,
  maintenanceSettings,
  requireViewer,
  RETURN_NOTE,
  screenProperties,
  SERVICE_INTERVAL,
  TITLE,
  VENDOR,
  whyDenied,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";
import { screenLinks } from "../../../../server/screen-links";

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
  searchParams: Promise<{
    property?: string;
    report?: string;
    request?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireViewer(locale);

  const query = await searchParams;
  const properties = await screenProperties(gateOf("maintenance"));
  const property = await frontDeskProperty(
    properties,
    query,
    localizeHref(locale, "maintenance"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("maintenance"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const [board, options, settings, register, links] = await Promise.all([
    maintenanceBoard(property.propertyId),
    maintenanceReportOptions(property.propertyId),
    maintenanceSettings(property.propertyId),
    equipmentRegister(property.propertyId),
    screenLinks(locale, property.propertyId, ["rooms"]),
  ]);
  // Only a Unit the form can offer: a stale link, or one to another
  // Property, opens nothing rather than a form that cannot be sent.
  const reportUnitId = options.units.some(
    (unit) => unit.unitId === query.report,
  )
    ? (query.report ?? null)
    : null;

  // The number a line elsewhere names ("MT-12"), read against this Property's
  // own board: one it does not hold opens nothing, as a stale `?report=` does.
  const openRequestId =
    board.requests.find((request) => String(request.number) === query.request)
      ?.requestId ?? null;

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
      openRequestId={openRequestId}
      options={options}
      propertyId={property.propertyId}
      propertyName={property.propertyName}
      register={register}
      reportUnitId={reportUnitId}
      roomsHref={links.rooms}
      settings={settings}
      timeZone={property.timezone}
      viewerId={viewer.userId}
    />
  );
}
