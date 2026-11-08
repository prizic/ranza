"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  formatDate,
  formatTime,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import type { BookableUnit } from "@ranza/reservations";
import { Button, EmptyState, Skeleton } from "@ranza/ui";
import type { StayType } from "../../../lib/booking-defaults";
import type { RoomCalendar } from "../../../server/viewer";
import { NewReservationDialog } from "../../front-office/components/new-reservation-dialog";
import { frontOfficeKeys, type Scope } from "../../front-office/query-keys";
import { BedNarrowing } from "../../rooms/components/bed-narrowing";
import {
  freeIn,
  inNarrowing,
  knownBlock,
  noticeFor,
} from "../../rooms/narrowing";
import { ListFilterNotice } from "../../today/components/list-filter-notice";
import { blockParam } from "../../today/views";
import {
  barKey,
  barsByKey,
  calendarRows,
  narrowedFree,
  shiftDay,
} from "../layout";
import {
  isCalendarDay,
  isTermScale,
  rememberedCookie,
  viewSearch,
  type RoomCalendarView,
} from "../view";
import {
  bookingConflicts,
  confirmsInPlace,
  type BookingTarget,
  type MoveRequest,
} from "../move";
import { BarDrawer } from "./bar-drawer";
import { CalendarGrid } from "./calendar-grid";
import { CalendarToolbar } from "./calendar-toolbar";
import { MoveDialogs } from "./move-dialogs";
import { QuickConfirm, type PlainDrop } from "./quick-confirm";
import type { BarDrop } from "./use-bar-drag";
import { useCoarsePointer } from "./use-coarse-pointer";

async function fetchCalendar(
  propertyId: string,
  from: string | null,
  days: number,
): Promise<RoomCalendar | null> {
  const params = new URLSearchParams({
    property: propertyId,
    days: String(days),
  });
  if (from) params.set("from", from);
  const response = await fetch(`/api/front-office/room-calendar?${params}`, {
    // The poll interval is the cache that matters; a browser-held copy would
    // make it a suggestion.
    cache: "no-store",
  });
  if (!response.ok) {
    throw Object.assign(new Error("the room calendar could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { calendar: RoomCalendar | null };
  return body.calendar;
}

/** A calendar date, formatted in UTC so it never moves by a day. */
function calendarDate(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The room calendar, kept live.
 *
 * The view is one value mirrored into the URL and a cookie on every change, so
 * a link opens the same calendar and the next visit opens with the same length
 * and toggles (RC-S1-60, RC-S1-61). Moving the window keeps the old grid on
 * screen until the new one arrives (RC-S1-52), and a failed refresh keeps the
 * last one with the time it was read (RC-S1-53).
 */
export function LiveRoomCalendar({
  booking,
  canOpenFolio,
  defaultLength,
  initialView,
  lengths,
  locale,
  scope,
}: {
  /**
   * What New reservation needs, for a viewer holding `front_desk.book` at a
   * Property with a Unit to sell; null otherwise, and nothing is offered.
   */
  booking: {
    units: readonly BookableUnit[];
    today: string;
    defaultStayType: StayType;
    /** The currency a payment plan is in, or null where none is offered. */
    paymentPlan: { currency: string } | null;
  } | null;
  /** Whether the viewer may open Finance, where a check-out's Folio is. */
  canOpenFolio: boolean;
  defaultLength: number;
  initialView: RoomCalendarView;
  lengths: number[];
  locale: SupportedLocale;
  scope: Scope;
}) {
  const t = useTranslations("roomCalendar");
  const otherRooms = useTranslations("roomsPage")("otherRooms");
  const coarsePointer = useCoarsePointer();
  const [view, setView] = useState(initialView);
  // The date the reader jumped to. The window opens three days before it, so
  // without a mark it is one column among many.
  const [markedDay, setMarkedDay] = useState<string | null>(null);
  // Kept after the drawer closes, so focus can go back to the bar it came from.
  const [selected, setSelected] = useState<{
    key: string;
    status: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // What a drop asked for. Nothing is written until the dialog it opens saves.
  const [moving, setMoving] = useState<MoveRequest | null>(null);
  // A pulled end waiting on its one-press confirm beside the pointer (RC-S5-04).
  const [held, setHeld] = useState<{
    drop: PlainDrop;
    at: BarDrop["at"];
  } | null>(null);
  const openFull = useCallback((drop: MoveRequest) => {
    setHeld(null);
    setMoving(drop);
  }, []);
  // Nights dragged across to book, which New reservation opens on (RC-S5-02).
  const [newBooking, setNewBooking] = useState<{
    unitId: string | null;
    from: string;
    to: string;
  } | null>(null);

  const query = useQuery({
    queryKey: frontOfficeKeys.roomCalendar(scope, {
      from: view.from,
      days: view.days,
    }),
    queryFn: () => fetchCalendar(scope.propertyId, view.from, view.days),
    // Thirty seconds, like Arrivals; a hidden tab pauses it by default.
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  // The last calendar read for the window asked, with that window and the
  // time it was read. A poll or a window change that fails leaves it on
  // screen with that time, rather than blanking it (RC-S1-52, RC-S1-53).
  // Placeholder data is the previous window's, so it is never recorded as
  // this one's.
  const lastGood = useRef<{
    calendar: RoomCalendar;
    window: { from: string | null; days: number };
    readAt: number;
  } | null>(null);
  if (query.data && !query.isPlaceholderData) {
    lastGood.current = {
      calendar: query.data,
      window: { from: view.from, days: view.days },
      readAt: query.dataUpdatedAt,
    };
  }
  const shown = lastGood.current;
  const calendar = query.data ?? shown?.calendar ?? null;
  // When a window last failed to open. The note about it stands only until
  // the calendar on screen is read again after that, so it never outlives the
  // outage that caused it (RC-S1-52).
  const [windowFailedAt, setWindowFailedAt] = useState<number | null>(null);
  const windowFailed =
    windowFailedAt !== null && shown !== null && shown.readAt <= windowFailedAt;

  function apply(next: RoomCalendarView) {
    setView(next);
    window.history.replaceState(
      null,
      "",
      `?${viewSearch(next, scope.propertyId, defaultLength)}`,
    );
    document.cookie = rememberedCookie(next);
  }

  function update(change: Partial<RoomCalendarView>, marked?: string) {
    // Every start the screen makes goes through the same check the URL's
    // does, so paging past the years the read takes stops rather than writing
    // a window the grid will not show.
    if (change.from && !isCalendarDay(change.from)) return;
    setWindowFailedAt(null);
    setMarkedDay(marked ?? null);
    apply({ ...view, ...change });
  }

  // A window that could not be read is put back, the URL with it, so the
  // address and the toolbar never name a window the grid is not showing — and
  // the screen says so rather than quietly staying put.
  const cannotOpen =
    query.isError &&
    !query.data &&
    shown !== null &&
    (shown.window.from !== view.from || shown.window.days !== view.days);
  useEffect(() => {
    if (!cannotOpen || shown === null) return;
    setWindowFailedAt(Date.now());
    apply({ ...view, ...shown.window });
  });

  const rows = useMemo(
    () => (calendar ? calendarRows(calendar, view) : []),
    [calendar, view],
  );
  const bars = useMemo(
    () => (calendar ? barsByKey(calendar) : new Map()),
    [calendar],
  );
  const freeTonight = useMemo(
    () => (calendar?.freeTonight ? new Set(calendar.freeTonight) : null),
    [calendar],
  );
  const bookable = useMemo(
    () => (booking ? new Set(booking.units.map((unit) => unit.unitId)) : null),
    [booking],
  );

  if (!calendar) {
    return query.isError ? (
      <EmptyState
        action={
          <Button onClick={() => void query.refetch()} variant="outline">
            {t("retry")}
          </Button>
        }
        description={t("failedDescription")}
        title={t("failedTitle")}
      />
    ) : (
      <Skeleton aria-label={t("loading")} className="h-96 w-full rounded-xl" />
    );
  }

  const lastDay = shiftDay(calendar.from, calendar.days - 1);
  const nothingBooked = bars.size === 0;
  const narrowing = {
    block: knownBlock(view.block, calendar.units),
    admits: view.admits,
  };
  // The free row counts the rooms on screen; the read's counts above the grid
  // stay the whole house's (RC-S1-31).
  const shownCalendar =
    narrowing.block !== null || narrowing.admits !== null
      ? { ...calendar, ...narrowedFree(calendar, narrowing) }
      : calendar;
  // Where the Rooms read could not say which places are free, a gender choice
  // has no number to give back, so it is not said rather than said wrongly.
  const notice =
    freeTonight === null && narrowing.admits !== null
      ? null
      : noticeFor(
          narrowing,
          {
            rooms: calendar.units.filter((room) => inNarrowing(room, narrowing))
              .length,
            free:
              freeTonight === null
                ? 0
                : freeIn(calendar.units, freeTonight, narrowing),
          },
          otherRooms,
        );
  const filtered =
    narrowing.block !== null ||
    narrowing.admits !== null ||
    view.floor !== null ||
    view.unitType !== null ||
    view.unitState !== null ||
    view.search !== "" ||
    view.overlapsOnly ||
    !view.showRequested ||
    !view.showDeparted;
  const opened = selected ? (bars.get(selected.key) ?? null) : null;

  function dropped(request: MoveRequest, drop: BarDrop) {
    if (calendar && confirmsInPlace(calendar, request, drop.mode)) {
      setHeld({ drop: request, at: drop.at });
    } else {
      setMoving(request);
    }
  }

  // A Unit something already holds on those nights is left for the desk to
  // choose again; the nights stand either way.
  function book(target: BookingTarget & { endsOn: string }) {
    if (!calendar) return;
    setNewBooking({
      unitId:
        bookingConflicts(calendar, null, target).length === 0
          ? target.unitId
          : null,
      from: target.startsOn,
      to: target.endsOn,
    });
  }

  // One line beside New reservation, so the grid still starts where it did
  // (CALENDAR-12): a viewer who may move and book is told both in one
  // sentence, which leaves no room to describe the page as well.
  const term = isTermScale(calendar.days);
  const dragsToBook = booking !== null && !coarsePointer && !term;
  // A day is a few pixels wide on a term, so nothing there is dragged: the
  // bar opens, and its drawer moves it and ends it with dates (RC-S7-03).
  const usage = term
    ? t("termHint")
    : calendar.mayAmend && dragsToBook
      ? t("moveAndBookHint")
      : [
          t("subtitle"),
          calendar.mayAmend
            ? t(coarsePointer ? "moveHintTouch" : "moveHint")
            : null,
          dragsToBook ? t("bookHint") : null,
        ]
          .filter(Boolean)
          .join(" ");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The page bar already names the page and the Property; what is
            left to say is how to use it, and a phone has no room to say it. */}
        <p className="hidden min-w-0 flex-1 text-sm text-muted-foreground md:block">
          {usage}
        </p>
        {/* The way to book without a mouse, and on a phone, where a drag
            across the row scrolls it. */}
        {booking ? (
          <div className="ms-auto">
            <NewReservationDialog
              defaultStayType={booking.defaultStayType}
              locale={locale}
              onClose={() => void query.refetch()}
              paymentPlan={booking.paymentPlan}
              propertyId={scope.propertyId}
              today={booking.today}
              units={booking.units}
            />
          </div>
        ) : null}
      </div>

      <CalendarToolbar
        calendar={calendar}
        lengths={lengths}
        locale={locale}
        narrowingChips={
          <BedNarrowing
            free={freeTonight}
            narrowing={narrowing}
            onChange={(next) =>
              update({
                block:
                  next.block === null ? null : blockParam(next.block.block),
                admits: next.admits,
              })
            }
            rooms={calendar.units}
          />
        }
        onChange={update}
        view={view}
      />

      {notice === null ? null : (
        <ListFilterNotice
          allHref={`/${locale}/room-calendar`}
          onShowAll={() => update({ block: null, admits: null })}
          {...notice}
        />
      )}

      {(windowFailed || query.isError) && shown ? (
        <p
          className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning"
          role="status"
        >
          {t(windowFailed ? "windowFailed" : "refreshFailed", {
            time: formatTime(
              shown.readAt,
              locale,
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
          })}
        </p>
      ) : null}

      {calendar.units.length === 0 ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link
                href={`${localizeHref(locale, "rooms")}?property=${scope.propertyId}`}
              >
                {t("goToRooms")}
              </Link>
            </Button>
          }
          description={t("noRoomsDescription")}
          title={t("noRoomsTitle")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          action={
            <Button
              onClick={() =>
                update({
                  block: null,
                  admits: null,
                  floor: null,
                  unitType: null,
                  unitState: null,
                  search: "",
                  overlapsOnly: false,
                  showRequested: true,
                  showDeparted: true,
                })
              }
              variant="outline"
            >
              {t("clearFilters")}
            </Button>
          }
          description={t("noMatchDescription")}
          title={t("noMatchTitle")}
        />
      ) : (
        <>
          <CalendarGrid
            bookable={bookable}
            calendar={shownCalendar}
            held={held?.drop ?? null}
            locale={locale}
            markedDay={markedDay}
            mayAmend={calendar.mayAmend}
            onBook={book}
            onDrop={dropped}
            onOpen={(bar) => {
              setSelected({ key: barKey(bar), status: bar.status });
              setDrawerOpen(true);
            }}
            onToggleBeds={(roomId) =>
              update({
                collapsed: view.collapsed.includes(roomId)
                  ? view.collapsed.filter((id) => id !== roomId)
                  : [...view.collapsed, roomId],
              })
            }
            rows={rows}
            updating={query.isPlaceholderData}
          />
          {/* Under the grid, so paging to an empty window does not move it. */}
          {nothingBooked ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("nothingBooked", {
                from: calendarDate(calendar.from, locale),
                to: calendarDate(lastDay, locale),
              })}
            </p>
          ) : null}
          {filtered ? (
            <p className="text-xs text-muted-foreground">{t("filteredNote")}</p>
          ) : null}
        </>
      )}

      {held ? (
        <QuickConfirm
          at={held.at}
          drop={held.drop}
          locale={locale}
          onClose={() => setHeld(null)}
          onFull={openFull}
          onSaved={() => {
            setHeld(null);
            void query.refetch();
          }}
        />
      ) : null}

      {booking && newBooking ? (
        <NewReservationDialog
          defaultStayType={booking.defaultStayType}
          key={`${newBooking.unitId}:${newBooking.from}:${newBooking.to}`}
          locale={locale}
          onClose={() => {
            setNewBooking(null);
            void query.refetch();
          }}
          paymentPlan={booking.paymentPlan}
          propertyId={scope.propertyId}
          start={newBooking}
          today={booking.today}
          units={booking.units}
        />
      ) : null}

      {moving ? (
        <MoveDialogs
          calendar={calendar}
          locale={locale}
          onClose={() => {
            setMoving(null);
            void query.refetch();
          }}
          request={moving}
        />
      ) : null}

      <BarDrawer
        barKey={opened ? barKey(opened.bar) : (selected?.key ?? null)}
        calendar={calendar}
        canOpenFolio={canOpenFolio}
        changed={opened !== null && selected?.status !== opened.bar.status}
        entry={opened}
        locale={locale}
        mayAmend={calendar.mayAmend}
        onChanged={() => void query.refetch()}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        scope={scope}
        today={calendar.today}
      />
    </div>
  );
}
