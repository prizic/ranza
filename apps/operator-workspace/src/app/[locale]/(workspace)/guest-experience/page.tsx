import { notFound } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import type { UnitEntry } from "@ranza/accommodation";
import type { ServiceRequestUnit } from "@ranza/guest-services";
import { setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { GuestExperienceView } from "../../../../features/guest-experience/components/guest-experience-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  propertyServiceRequests,
  requireViewer,
  rooms,
  screenProperties,
  serviceRequestAccess,
  serviceRequestAssignees,
  whyDenied,
} from "../../../../server/viewer";

/**
 * Guest Experience & Service Request Lifecycle (Blueprint 5.5, 4.3).
 *
 * Gated by the guest services capability. Displays service requests queue,
 * status transitions, and dialog to log requests.
 */
export default async function GuestExperiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireViewer(locale);

  const properties = await screenProperties(gateOf("guest-experience"));
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "guest-experience"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("guest-experience"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const [requests, unitMap, access, staff] = await Promise.all([
    propertyServiceRequests(property.propertyId),
    rooms(property.propertyId),
    serviceRequestAccess(property.propertyId),
    serviceRequestAssignees(property.propertyId),
  ]);

  // A room let by the bed is reported about by its beds, each with whoever is
  // in it; any other room is itself.
  const units: ServiceRequestUnit[] = unitMap.units.flatMap((unit) =>
    unit.beds.length > 0
      ? unit.beds.map((bed) => ({
          unitId: bed.unitId,
          name: `${bed.name} · ${unit.name}`,
          occupant: occupantOf(bed),
        }))
      : [{ unitId: unit.unitId, name: unit.name, occupant: occupantOf(unit) }],
  );

  return (
    <GuestExperienceView
      locale={locale as SupportedLocale}
      mayCreate={access.mayCreate}
      mayManage={access.mayManage}
      propertyId={property.propertyId}
      requests={requests}
      staff={staff}
      timeZone={property.timezone}
      units={units}
      viewerId={viewer.userId}
    />
  );
}

function occupantOf(unit: UnitEntry): string | null {
  return unit.state?.kind === "in_house" ? unit.state.guestName : null;
}
