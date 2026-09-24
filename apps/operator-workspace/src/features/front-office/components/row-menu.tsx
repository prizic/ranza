"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  CalendarX,
  MoreHorizontal,
  Receipt,
  UserX,
} from "lucide-react";
import { isolate, localizeHref, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ranza/ui";
import { EndBookingDialog, type EndBookingKind } from "./end-booking-dialog";

/**
 * A booking the row may end, and whether each way of ending it is offered.
 *
 * Offered, not allowed: the policy and the transition trigger decide whether
 * pressing it does anything. What is decided here is whether a control the
 * viewer cannot use, or one that would certainly be refused, is shown at all.
 */
export interface EndableBooking {
  reservationId: string;
  reference: string;
  unitLabel: string;
  mayCancel: boolean;
  mayMarkNoShow: boolean;
}

/**
 * Where else a row's Guest can be looked at, and the booking's own endings.
 *
 * Only destinations that exist and open on this Guest's own record: their
 * Folio when there is one, and the room map. Both name the row's Property, so
 * following one never switches the Property being worked in, and neither is
 * prefetched: a menu item is one request, read on the click. It used to offer a reservation
 * page, a profile and an inventory bed map, none of which is built — the
 * profile opened the staff roster — and a menu of links that do not do what
 * they say is worse than a shorter one.
 */
export function FrontDeskRowMenu({
  booking,
  folioId,
  guestName,
  locale,
  propertyId,
}: {
  booking?: EndableBooking | undefined;
  folioId: string | null;
  guestName: string;
  locale: SupportedLocale;
  propertyId: string;
}) {
  const t = useTranslations();
  const [ending, setEnding] = useState<EndBookingKind | null>(null);
  const endings = booking && (booking.mayCancel || booking.mayMarkNoShow);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("moreActionsFor", { guest: isolate(guestName) })}
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {folioId ? (
            <DropdownMenuItem asChild>
              <Link
                href={`${localizeHref(locale, "finance")}?property=${propertyId}&folio=${folioId}`}
                prefetch={false}
              >
                <Receipt className="size-4" />
                <span>{t("openFolio")}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link
              href={`${localizeHref(locale, "rooms")}?property=${propertyId}`}
              prefetch={false}
            >
              <BedDouble className="size-4" />
              <span>{t("showOnRoomMap")}</span>
            </Link>
          </DropdownMenuItem>
          {endings ? <DropdownMenuSeparator /> : null}
          {booking?.mayMarkNoShow ? (
            <DropdownMenuItem onSelect={() => setEnding("no_show")}>
              <UserX className="size-4" />
              <span>{t("markNoShow")}</span>
            </DropdownMenuItem>
          ) : null}
          {booking?.mayCancel ? (
            <DropdownMenuItem
              onSelect={() => setEnding("cancel")}
              variant="destructive"
            >
              <CalendarX className="size-4" />
              <span>{t("cancelBooking")}</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {booking && ending ? (
        <EndBookingDialog
          guestName={guestName}
          kind={ending}
          locale={locale}
          onOpenChange={(open) => {
            if (!open) setEnding(null);
          }}
          open
          reference={booking.reference}
          reservationId={booking.reservationId}
          unitLabel={booking.unitLabel}
        />
      ) : null}
    </>
  );
}
