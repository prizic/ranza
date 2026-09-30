"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import type { OutOfOrderImpact } from "@ranza/maintenance";
import { isolate, localizeHref, type SupportedLocale } from "@ranza/i18n";
import { formatDay } from "./look";

/**
 * Who taking a room out of order affects, said before anything is written
 * (MT-S2-09, MT-S2-10): each Guest in it, and each booking on its coming
 * nights. Nothing is cancelled or moved; the desk decides.
 *
 * Each booking opens in Change booking (AB-S1-17), in a new tab: the notice
 * sits inside a form that is not finished yet, and following a link in place
 * would throw that form away.
 */
export function ImpactNotice({
  impact,
  locale,
  propertyId,
}: {
  impact: OutOfOrderImpact;
  locale: SupportedLocale;
  /** The Property the room is in, which the booking links name. */
  propertyId: string;
}) {
  const t = useTranslations("maintenance");
  const guest = (name: string | null) => isolate(name ?? t("aGuest"));

  return (
    <div
      className="grid gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-step--1"
      role="alert"
    >
      <p className="flex items-center gap-2 font-semibold text-warning">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        {t("impactTitle")}
      </p>
      <ul className="grid gap-1 ps-6">
        {impact.inHouse.map((stay) => (
          <li key={`stay-${stay.unitName}-${stay.guestName ?? ""}`}>
            {stay.endsOn
              ? t("impactInHouse", {
                  guest: guest(stay.guestName),
                  unit: isolate(stay.unitName),
                  date: formatDay(stay.endsOn, locale),
                })
              : t("impactInHouseOpen", {
                  guest: guest(stay.guestName),
                  unit: isolate(stay.unitName),
                })}
          </li>
        ))}
        {impact.reservations.map((booking) => (
          <li
            key={`booking-${booking.unitName}-${booking.startsOn}-${booking.guestName ?? ""}`}
          >
            {t("impactBooking", {
              guest: guest(booking.guestName),
              unit: isolate(booking.unitName),
              from: formatDay(booking.startsOn, locale),
            })}{" "}
            {booking.mayAmend ? (
              <a
                className="font-medium underline underline-offset-2"
                href={`${localizeHref(locale, "reservations")}?${new URLSearchParams({ property: propertyId, change: booking.reservationId })}`}
                rel="noopener"
                target="_blank"
              >
                {t("impactChangeBooking")}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{t("impactHint")}</p>
    </div>
  );
}
