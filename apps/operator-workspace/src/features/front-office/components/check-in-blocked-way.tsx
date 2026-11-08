"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { CheckInBlocker } from "@ranza/reservations";
import type { FrontDeskReach } from "../reach";

/**
 * The way on from a check-in that is refused (audit 2026-11-07, A-02): the page
 * where the thing in the way is dealt with, offered only to a viewer who can
 * open it. A Guest still in the room is checked out on Departures; a block or a
 * hold is lifted on Rooms, at the room. An unconfirmed booking has no other page.
 */
export function CheckInBlockedWay({
  blocker,
  className,
  locale,
  propertyId,
  reach,
  unitId,
}: {
  blocker: CheckInBlocker;
  className: string;
  locale: SupportedLocale;
  propertyId: string;
  reach: FrontDeskReach;
  unitId: string;
}) {
  const t = useTranslations();
  const base = `?property=${encodeURIComponent(propertyId)}`;
  if (blocker === "unit_occupied" && reach.departures) {
    return (
      <Link
        className={className}
        href={`${localizeHref(locale, "departures")}${base}`}
        prefetch={false}
      >
        {t("checkOutInDepartures")}
      </Link>
    );
  }
  if (
    (blocker === "unit_blocked" || blocker === "unit_out_of_service") &&
    reach.rooms
  ) {
    return (
      <Link
        className={className}
        href={`${localizeHref(locale, "rooms")}${base}&unit=${encodeURIComponent(unitId)}`}
        prefetch={false}
      >
        {t("showOnRoomMap")}
      </Link>
    );
  }
  return null;
}
