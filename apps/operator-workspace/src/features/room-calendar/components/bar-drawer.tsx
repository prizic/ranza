"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  directionFor,
  formatDate,
  formatMoney,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Button,
  cn,
  DialogActions,
  DialogBody,
  DialogFacts,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  FormError,
  Sheet,
  SheetContent,
  StatusBadge,
  sheetFrameClassName,
  type StatusTone,
} from "@ranza/ui";
import type { RoomCalendar, RoomCalendarBar } from "../../../server/viewer";
import { ChangeDepartureDialog } from "../../front-office/components/change-departure-dialog";
import { CheckInAction } from "../../front-office/components/check-in-action";
import { CheckOutDialog } from "../../front-office/components/check-out-dialog";
import { MoveGuestDialog } from "../../front-office/components/move-guest-dialog";
import { fetchArrivals, fetchDepartures } from "../../front-office/queries";
import { frontOfficeKeys, type Scope } from "../../front-office/query-keys";
import { daysBetween, type PlacedEntry } from "../layout";
import { lateArrival } from "../late";
import type { MoveRequest } from "../move";
import { BAR_ICON, barLook, type BarLook } from "./bar-style";
import { useHoldText } from "./hold-text";
import { MoveDialogs } from "./move-dialogs";

const TONE: Record<BarLook, StatusTone> = {
  requested: "neutral",
  confirmed: "info",
  inHouse: "success",
  overdue: "warning",
  departed: "neutral",
};

function date(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The drawer's width on a screen wide enough for a side panel. The sheet's own
 * `sm:max-w-sm` outranks the frame's wider limit, so it is said again for the
 * two sides this drawer opens from; `minmax(0, 1fr)` lets a long name or
 * reference shrink inside the column rather than push it wider than the panel
 * (CALENDAR-01).
 */
const DRAWER_FRAME = cn(
  sheetFrameClassName,
  "grid-cols-[minmax(0,1fr)] data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[32.5rem] data-[side=right]:sm:max-w-[32.5rem]",
);

/** Where the command for this bar lives (RC-S1-64). */
function onward(
  bar: RoomCalendarBar,
  today: string,
): "arrivals" | "departures" | "reservations" {
  if (bar.kind === "stay" && bar.status === "in_house") return "departures";
  // Arrivals lists a booking only while it can still be checked in: begun,
  // and with a night still ahead.
  if (
    bar.kind === "reservation" &&
    bar.startsOn <= today &&
    (bar.endsOn === null || bar.endsOn > today)
  ) {
    return "arrivals";
  }
  return "reservations";
}

/**
 * One booking or Stay, opened from its bar.
 *
 * It follows the bar by key across refreshes, so a booking changed or removed
 * elsewhere while it is open says so rather than showing what it used to be
 * (RC-S1-65). It opens from the end the reader's text starts at — `Sheet`'s
 * sides are physical, so the side is chosen by direction (RC-S1-55).
 */
export function BarDrawer({
  barKey,
  calendar,
  changed,
  entry,
  locale,
  mayAmend,
  onChanged,
  onClose,
  open,
  scope,
  today,
}: {
  /** The bar that opened it, which gets focus back when it closes (RC-S1-58). */
  barKey: string | null;
  /** What the calendar knows, which Move… checks a move against (RC-S3-04). */
  calendar: RoomCalendar;
  changed: boolean;
  entry: PlacedEntry | null;
  locale: SupportedLocale;
  /** Whether a Guest in house may have their departure changed here (AB-S1-27). */
  mayAmend: boolean;
  /** Told after a change is saved, so the calendar is read again. */
  onChanged: () => void;
  onClose: () => void;
  open: boolean;
  scope: Scope;
  today: string;
}) {
  const t = useTranslations("roomCalendar");
  const side = directionFor(locale) === "rtl" ? "left" : "right";

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className={DRAWER_FRAME}
        onCloseAutoFocus={(event) => {
          // Opened from a bar rather than a trigger, so Radix has nothing to
          // return focus to. The bar is found again by its key, because a
          // refresh while the drawer was open may have redrawn it.
          const bar =
            barKey === null
              ? null
              : document.querySelector<HTMLElement>(
                  `[data-bar-key="${CSS.escape(barKey)}"]`,
                );
          if (bar) {
            event.preventDefault();
            bar.focus();
          }
        }}
        side={side}
      >
        {entry === null ? (
          <DialogMasthead
            eyebrow={t("goneTitle")}
            heading={t("goneNote")}
            large
          />
        ) : (
          <DrawerBody
            calendar={calendar}
            changed={changed}
            entry={entry}
            locale={locale}
            mayAmend={mayAmend}
            onChanged={onChanged}
            onClose={onClose}
            scope={scope}
            today={today}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  calendar,
  changed,
  entry,
  locale,
  mayAmend,
  onChanged,
  onClose,
  scope,
  today,
}: {
  calendar: RoomCalendar;
  changed: boolean;
  entry: PlacedEntry;
  locale: SupportedLocale;
  mayAmend: boolean;
  onChanged: () => void;
  onClose: () => void;
  scope: Scope;
  today: string;
}) {
  const { propertyId } = scope;
  const t = useTranslations("roomCalendar");
  const common = useTranslations();
  const holdText = useHoldText(locale);
  const { bar, unit, room } = entry;
  const [changingDeparture, setChangingDeparture] = useState(false);
  const [moving, setMoving] = useState(false);
  // Move… for a booking not yet arrived: the keyboard's way to what a drag
  // does, opening the same dialog with pickers on the nights and the Unit
  // (RC-S3-12).
  const [movingBooking, setMovingBooking] = useState<MoveRequest | null>(null);
  // The buttons that open a dialog, so focus goes back to the one pressed when
  // the dialog closes: the drawer stays open under it, and with no trigger to
  // return to the browser would leave focus on the page's body.
  const departureButton = useRef<HTMLButtonElement>(null);
  const moveGuestButton = useRef<HTMLButtonElement>(null);
  const moveBookingButton = useRef<HTMLButtonElement>(null);
  const giveFocusBack = (button: { current: HTMLButtonElement | null }) =>
    requestAnimationFrame(() => button.current?.focus());
  const departureChangeable =
    mayAmend &&
    bar.kind === "stay" &&
    bar.status === "in_house" &&
    bar.reservationId !== null;
  const look = barLook(bar);
  const place = room ? `${room.name} · ${unit.name}` : unit.name;
  const target = onward(bar, today);
  const late = lateArrival(bar, today);

  // Check in and Check out where the bar is one the desk acts on today, from
  // the rows and the components Arrivals and Departures use: whether the viewer
  // may, whether the room lets them and what the bill is are those rows' to
  // say, and a bar they do not list offers neither (RC-S5-03).
  const arriving = target === "arrivals" && bar.kind === "reservation";
  const leaving =
    bar.kind === "stay" &&
    bar.status === "in_house" &&
    bar.current &&
    bar.endsOn !== null &&
    bar.endsOn <= today;
  const arrivals = useQuery({
    queryKey: frontOfficeKeys.arrivals(scope),
    queryFn: () => fetchArrivals(propertyId),
    enabled: arriving,
  });
  const departures = useQuery({
    queryKey: frontOfficeKeys.departures(scope, "due"),
    queryFn: () => fetchDepartures(propertyId, "due"),
    enabled: leaving,
  });
  const arrival = arriving
    ? arrivals.data?.find((row) => row.reservationId === bar.reservationId)
    : undefined;
  const checkIn =
    arrival && arrival.mayCheckIn && arrival.canCheckIn ? arrival : undefined;
  const departure =
    leaving && bar.kind === "stay"
      ? departures.data?.find((row) => row.stayId === bar.stayId)
      : undefined;
  const checkOut = departure?.mayCheckOut ? departure : undefined;
  // The bar becomes another one once the Guest is in or out, so the drawer
  // closes on it and every list beside the calendar is read again.
  const client = useQueryClient();
  const acted = () => {
    void client.invalidateQueries({ queryKey: frontOfficeKeys.all(scope) });
    onClose();
  };
  const reservationsHref = `${localizeHref(locale, "reservations")}?property=${propertyId}`;
  // The booking itself, where the page can open it: Reservations does, by id.
  const bookingHref =
    bar.reservationId === null
      ? null
      : `${reservationsHref}&open=${bar.reservationId}`;
  // A Guest moved into this room arrived before this bar begins: the Stay's
  // own first night is the arrival, and its nights are counted from it.
  const arrivedOn = bar.kind === "stay" ? bar.arrivedOn : bar.startsOn;
  const moved = bar.kind === "stay" && bar.arrivedOn !== bar.startsOn;
  const inHouse = bar.kind === "stay" && bar.status === "in_house";
  // An overdue Guest is still in the room: their nights run through tonight,
  // which is as far as the bar is drawn, not to the date they were due.
  const nights =
    bar.overdue && bar.heldUntil
      ? daysBetween(arrivedOn, bar.heldUntil)
      : bar.endsOn === null
        ? null
        : daysBetween(arrivedOn, bar.endsOn);
  const daysLate =
    bar.overdue && bar.endsOn ? daysBetween(bar.endsOn, today) : 0;
  const hold =
    unit.status === "out_of_service"
      ? (calendar.holds?.[unit.unitId] ??
        (room ? calendar.holds?.[room.unitId] : undefined))
      : undefined;
  const readiness =
    bar.kind === "reservation" && bar.holds && bar.startsOn <= today
      ? calendar.readiness?.[(room ?? unit).unitId]
      : undefined;

  const facts: (readonly [string, ReactNode])[] = [
    [
      bar.kind === "stay"
        ? t("arrived")
        : late
          ? t("wasDueToArrive")
          : t("arrives"),
      date(arrivedOn, locale),
    ],
  ];
  if (moved) facts.push([t("inRoomSince"), date(bar.startsOn, locale)]);
  facts.push([
    bar.overdue
      ? t("wasDue")
      : bar.kind === "stay" && bar.status === "departed"
        ? t("left")
        : t("leaves"),
    bar.endsOn ? date(bar.endsOn, locale) : t("noEndDate"),
  ]);
  if (bar.overdue)
    facts.push([t("overdue"), t("daysLate", { days: daysLate })]);
  if (
    bar.kind === "stay" &&
    bar.bookedStartsOn &&
    (bar.bookedStartsOn !== bar.arrivedOn || bar.bookedEndsOn !== bar.endsOn)
  ) {
    facts.push([
      t("booked"),
      `${date(bar.bookedStartsOn, locale)} – ${
        bar.bookedEndsOn ? date(bar.bookedEndsOn, locale) : t("noEndDate")
      }`,
    ]);
  }
  if (nights !== null) {
    facts.push([
      t(bar.overdue ? "nightsSoFar" : "nightsLabel"),
      t("nights", { count: nights }),
    ]);
  }
  if (bar.reference) {
    facts.push([
      t("reservationCode"),
      bookingHref ? (
        <Link
          aria-label={`${t("openBooking")}: ${bar.reference}`}
          className="underline underline-offset-4"
          href={bookingHref}
          key="reference"
          prefetch={false}
          title={t("openBooking")}
        >
          <bdi className="font-mono">{bar.reference}</bdi>
        </Link>
      ) : (
        <bdi className="font-mono" key="reference">
          {bar.reference}
        </bdi>
      ),
    ]);
  }
  if (readiness) {
    facts.push([t("roomStatus"), t(`roomReadiness.${readiness}`)]);
  }
  if (bar.stayType === "resident") facts.push([t("stayType"), t("resident")]);
  if (bar.kind === "stay" && bar.balance) {
    facts.push([
      t(inHouse ? "balanceAsOfCharge" : "balance"),
      <span key="balance">
        {formatMoney(bar.balance.balanceMinor, bar.balance.currency, locale)}
        {inHouse ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {t("laterNightsPost")}
          </span>
        ) : null}
        {bar.balance.closed ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {t("folioClosed")}
          </span>
        ) : null}
      </span>,
    ]);
  }

  const secondaryButton = "h-13 rounded-full px-6 text-base font-medium";
  const primaryButton =
    "h-13 rounded-full bg-foreground px-6 text-base font-semibold text-background hover:bg-foreground/90";
  const acts = checkIn !== undefined || checkOut !== undefined;

  return (
    <>
      <DialogMasthead
        art="/illustrations/dialogs/change-booking.svg"
        eyebrow={common("reservationDetails")}
        facts={place}
        heading={bar.guestName ?? t("noGuestRecorded")}
      />
      <DialogBody>
        <DialogSection>
          <div>
            <StatusBadge
              icon={BAR_ICON[late ? "overdue" : look]}
              label={
                late
                  ? late.nightsGone
                    ? common("didNotArriveDays", { count: late.days })
                    : t("notArrivedLate", { days: late.days })
                  : t(look)
              }
              tone={late ? "warning" : TONE[look]}
            />
          </div>
          {changed ? <DialogNotice>{t("changedNote")}</DialogNotice> : null}
          {bar.overlaps ? <FormError>{t("overlapNote")}</FormError> : null}
          {bar.clashesWith === "booking" ? (
            <FormError>{t("clashNote")}</FormError>
          ) : null}
          {bar.clashesWith === "stay" ? (
            <FormError>{t("clashStayNote")}</FormError>
          ) : null}
          {bar.bookedWhileBlocked ? (
            <DialogNotice>
              {t("blockedNote", {
                reason: [
                  unit.statusReason ??
                    t(unit.status === "blocked" ? "blocked" : "outOfService"),
                  hold ? holdText(hold).full : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })}
            </DialogNotice>
          ) : null}
          {late ? (
            <DialogNotice>
              {late.nightsGone
                ? t("didNotArriveNote")
                : t("lateNote", { date: date(bar.startsOn, locale) })}
            </DialogNotice>
          ) : null}
          {bar.overdue && bar.endsOn ? (
            <DialogNotice>
              {t("overdueNote", {
                date: date(bar.endsOn, locale),
                days: daysLate,
              })}
            </DialogNotice>
          ) : null}
        </DialogSection>

        <DialogSection>
          <DialogFacts rows={facts} />
        </DialogSection>
      </DialogBody>

      <DialogActions>
        {departureChangeable && bar.kind === "stay" ? (
          <>
            <Button
              className={secondaryButton}
              onClick={() => setChangingDeparture(true)}
              ref={departureButton}
              type="button"
              variant="outline"
            >
              {common("changeDeparture")}
            </Button>
            <Button
              className={secondaryButton}
              onClick={() => setMoving(true)}
              ref={moveGuestButton}
              type="button"
              variant="outline"
            >
              {common("moveGuest")}
            </Button>
            {moving ? (
              <MoveGuestDialog
                locale={locale}
                onDone={onChanged}
                onOpenChange={(open) => {
                  setMoving(open);
                  if (!open) giveFocusBack(moveGuestButton);
                }}
                open
                stay={{
                  stayId: bar.stayId,
                  guestName: bar.guestName ?? t("noGuestRecorded"),
                  unitLabel: place,
                }}
              />
            ) : null}
            {changingDeparture ? (
              <ChangeDepartureDialog
                locale={locale}
                onDone={onChanged}
                onOpenChange={(open) => {
                  setChangingDeparture(open);
                  if (!open) giveFocusBack(departureButton);
                }}
                open
                stay={{
                  stayId: bar.stayId,
                  reference: null,
                  guestName: bar.guestName ?? t("noGuestRecorded"),
                  unitLabel: place,
                  startsOn: bar.arrivedOn,
                  endsOn: bar.endsOn,
                }}
              />
            ) : null}
          </>
        ) : null}

        {mayAmend && bar.kind === "reservation" ? (
          <Button
            className={secondaryButton}
            onClick={() =>
              setMovingBooking({
                kind: "booking",
                entry: { ...entry, bar },
                target: {
                  unitId: unit.unitId,
                  startsOn: bar.startsOn,
                  endsOn: bar.endsOn,
                },
              })
            }
            ref={moveBookingButton}
            type="button"
            variant="outline"
          >
            {t("moveAction")}
          </Button>
        ) : null}
        {movingBooking ? (
          <MoveDialogs
            calendar={calendar}
            locale={locale}
            onClose={() => {
              setMovingBooking(null);
              onChanged();
              giveFocusBack(moveBookingButton);
            }}
            request={movingBooking}
          />
        ) : null}

        {/* The command, when there is one here, is the main action and the
            page it lives on is the way onward beside it. */}
        <Button
          asChild
          className={acts ? secondaryButton : primaryButton}
          variant={acts ? "outline" : "default"}
        >
          {/* Not prefetched: one bar is one link, read on the click. */}
          <Link
            href={
              target === "reservations" && bookingHref
                ? bookingHref
                : `${localizeHref(locale, target)}?property=${propertyId}`
            }
            prefetch={false}
          >
            {t(`open.${target}`)}
          </Link>
        </Button>
        {checkIn ? (
          <CheckInAction
            className={primaryButton}
            guestName={bar.guestName ?? undefined}
            locale={locale}
            onDone={acted}
            reservationId={checkIn.reservationId}
            room={
              checkIn.unitNotReadyBecause
                ? { label: place, because: checkIn.unitNotReadyBecause }
                : undefined
            }
          />
        ) : null}
        {checkOut ? (
          <CheckOutDialog
            departure={checkOut}
            locale={locale}
            onDone={acted}
            propertyId={propertyId}
            triggerClassName={primaryButton}
          />
        ) : null}
      </DialogActions>
    </>
  );
}
