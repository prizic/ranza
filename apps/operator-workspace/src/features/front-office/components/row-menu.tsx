"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  CalendarClock,
  CalendarRange,
  CalendarX,
  DoorOpen,
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
import {
  ChangeBookingDialog,
  type ChangeableBooking,
} from "./change-booking-dialog";
import {
  ChangeDepartureDialog,
  type ChangeableStay,
} from "./change-departure-dialog";
import { EndBookingDialog, type EndBookingKind } from "./end-booking-dialog";
import { MoveGuestDialog } from "./move-guest-dialog";

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
  /** Present when the viewer may change its nights or Unit (AB-S1-27). */
  change?: ChangeableBooking | undefined;
}

/**
 * Where else a row's Guest can be looked at, and the booking's own endings.
 *
 * Only destinations that exist and open on this Guest's own record: their
 * Folio when there is one, and the room map. Both name the row's Property, so
 * following one never switches the Property being worked in, and neither is
 * prefetched: a menu item is one request, read on the click. It used to
 * offer a reservation page, a profile and an inventory bed map, none of which
 * is built — the profile opened the staff roster — and a menu of links that
 * do not do what they say is worse than a shorter one.
 */
export function FrontDeskRowMenu({
  booking,
  folioId,
  guestName,
  locale,
  propertyId,
  stay,
  unitId,
}: {
  booking?: EndableBooking | undefined;
  /** An in-house Guest whose departure the viewer may change (AB-S2-05). */
  stay?: ChangeableStay | undefined;
  folioId: string | null;
  guestName: string;
  locale: SupportedLocale;
  propertyId: string;
  unitId?: string | null | undefined;
}) {
  const t = useTranslations();
  const [ending, setEnding] = useState<EndBookingKind | null>(null);
  const [changing, setChanging] = useState(false);
  const [changingDeparture, setChangingDeparture] = useState(false);
  const [moving, setMoving] = useState(false);
  const bookingActions =
    booking && (booking.mayCancel || booking.mayMarkNoShow || booking.change);

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
              href={`${localizeHref(locale, "rooms")}?property=${propertyId}${unitId ? `&unit=${unitId}` : ""}`}
              prefetch={false}
            >
              <BedDouble className="size-4" />
              <span>{t("showOnRoomMap")}</span>
            </Link>
          </DropdownMenuItem>
          {bookingActions || stay ? <DropdownMenuSeparator /> : null}
          {stay ? (
            <DropdownMenuItem onSelect={() => setChangingDeparture(true)}>
              <CalendarRange className="size-4" />
              <span>{t("changeDeparture")}</span>
            </DropdownMenuItem>
          ) : null}
          {stay ? (
            <DropdownMenuItem onSelect={() => setMoving(true)}>
              <DoorOpen className="size-4" />
              <span>{t("moveGuest")}</span>
            </DropdownMenuItem>
          ) : null}
          {booking?.change ? (
            <DropdownMenuItem onSelect={() => setChanging(true)}>
              <CalendarClock className="size-4" />
              <span>{t("changeBooking")}</span>
            </DropdownMenuItem>
          ) : null}
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
      {stay && changingDeparture ? (
        <ChangeDepartureDialog
          locale={locale}
          onOpenChange={setChangingDeparture}
          open
          stay={stay}
        />
      ) : null}
      {stay && moving ? (
        <MoveGuestDialog
          locale={locale}
          onOpenChange={setMoving}
          open
          stay={{
            stayId: stay.stayId,
            guestName: stay.guestName,
            unitLabel: stay.unitLabel,
          }}
        />
      ) : null}
      {booking?.change && changing ? (
        <ChangeBookingDialog
          booking={booking.change}
          locale={locale}
          onOpenChange={setChanging}
          open
        />
      ) : null}
    </>
  );
}
