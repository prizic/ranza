"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  CalendarClock,
  CalendarRange,
  CalendarX,
  DoorClosed,
  DoorOpen,
  FileText,
  MoreHorizontal,
  Receipt,
  SprayCan,
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
import { REACHES_EVERYTHING, type FrontDeskReach } from "../reach";

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
  /** The expected arrival, for the no-show dialog to say how early it is. */
  expected?: { time: string; passed: boolean | null } | undefined;
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
 * offer a profile and an inventory bed map, neither of which is built — the
 * profile opened the staff roster — and a menu of links that do not do what
 * they say is worse than a shorter one. The reservation it opens is the
 * Reservations list's own sheet, for the Guest's booking, balance and notes.
 *
 * A link is offered only to a viewer who can open where it leads: Finance has
 * no Rooms page, and a menu item that is then refused is worse than none
 * (ARRIVALS-15).
 */
export function FrontDeskRowMenu({
  booking,
  checkOutDue = false,
  folioId,
  guestName,
  housekeeping = false,
  locale,
  propertyId,
  reach = REACHES_EVERYTHING,
  reservationId,
  stay,
  unitId,
}: {
  /**
   * An in-house Guest who is due out today or overdue: the menu then leads to
   * Departures, where the bill is reviewed and the check-out is made.
   */
  checkOutDue?: boolean;
  booking?: EndableBooking | undefined;
  /** An in-house Guest whose departure the viewer may change (AB-S2-05). */
  stay?: ChangeableStay | undefined;
  folioId: string | null;
  guestName: string;
  /** The room is waiting to be cleaned or inspected: offers the way to its board. */
  housekeeping?: boolean;
  locale: SupportedLocale;
  propertyId: string;
  /** Which of the pages this menu links to the viewer can open. */
  reach?: FrontDeskReach;
  /** The booking behind the row, when there is one, for "Open reservation". */
  reservationId?: string | null | undefined;
  unitId?: string | null | undefined;
}) {
  const t = useTranslations();
  const [ending, setEnding] = useState<EndBookingKind | null>(null);
  const [changing, setChanging] = useState(false);
  const [changingDeparture, setChangingDeparture] = useState(false);
  const [moving, setMoving] = useState(false);
  const bookingActions =
    booking && (booking.mayCancel || booking.mayMarkNoShow || booking.change);
  const offersReservation = Boolean(reservationId) && reach.reservations;
  const offersFolio = Boolean(folioId) && reach.folio;
  const offersHousekeeping = housekeeping && reach.housekeeping;
  const hasLinks =
    offersReservation ||
    offersFolio ||
    checkOutDue ||
    reach.rooms ||
    offersHousekeeping;

  // The dialogs are opened from a menu item that is gone by the time they
  // close, so focus has nowhere to return to and falls to the page. It returns
  // to the button that opened the menu instead, once the dialog's own focus
  // handling has run (RESERVATIONS-05).
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogOpen = ending !== null || changing || changingDeparture || moving;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (dialogOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const timer = setTimeout(() => trigger.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [dialogOpen]);

  // Nothing to offer is no menu: an empty one is a button that opens nothing.
  if (!hasLinks && !bookingActions && !stay) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("moreActionsFor", { guest: isolate(guestName) })}
            className="pointer-coarse:size-11"
            ref={trigger}
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {offersReservation ? (
            <DropdownMenuItem asChild>
              <Link
                href={`${localizeHref(locale, "reservations")}?property=${propertyId}&open=${reservationId}`}
                prefetch={false}
              >
                <FileText className="size-4" />
                <span>{t("openReservation")}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {offersFolio ? (
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
          {checkOutDue ? (
            <DropdownMenuItem asChild>
              <Link
                href={`${localizeHref(locale, "departures")}?property=${propertyId}`}
                prefetch={false}
              >
                <DoorClosed className="size-4" />
                <span>{t("checkOutInDepartures")}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {reach.rooms ? (
            <DropdownMenuItem asChild>
              <Link
                href={`${localizeHref(locale, "rooms")}?property=${propertyId}${unitId ? `&unit=${unitId}` : ""}`}
                prefetch={false}
              >
                <BedDouble className="size-4" />
                <span>{t("showOnRoomMap")}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {offersHousekeeping ? (
            <DropdownMenuItem asChild>
              <Link
                href={`${localizeHref(locale, "housekeeping")}?property=${propertyId}`}
                prefetch={false}
              >
                <SprayCan className="size-4" />
                <span>{t("openInHousekeeping")}</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          {hasLinks && (bookingActions || stay) ? (
            <DropdownMenuSeparator />
          ) : null}
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
          expected={booking.expected}
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
          onMarkNoShow={
            booking.mayMarkNoShow
              ? () => {
                  setChanging(false);
                  setEnding("no_show");
                }
              : undefined
          }
          onOpenChange={setChanging}
          open
        />
      ) : null}
    </>
  );
}
