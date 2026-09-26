"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  formatDate,
  formatTime,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { Button, EmptyState, PageHeader, Skeleton } from "@ranza/ui";
import type { RoomCalendar } from "../../../server/viewer";
import { frontOfficeKeys, type Scope } from "../../front-office/query-keys";
import { barKey, barsByKey, calendarRows, shiftDay } from "../layout";
import {
  isCalendarDay,
  rememberedCookie,
  viewSearch,
  type RoomCalendarView,
} from "../view";
import { BarDrawer } from "./bar-drawer";
import { CalendarGrid } from "./calendar-grid";
import { CalendarToolbar } from "./calendar-toolbar";

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
  defaultLength,
  initialView,
  lengths,
  locale,
  propertyName,
  scope,
}: {
  defaultLength: number;
  initialView: RoomCalendarView;
  lengths: number[];
  locale: SupportedLocale;
  propertyName: string;
  scope: Scope;
}) {
  const t = useTranslations("roomCalendar");
  const [view, setView] = useState(initialView);
  // Kept after the drawer closes, so focus can go back to the bar it came from.
  const [selected, setSelected] = useState<{
    key: string;
    status: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  function update(change: Partial<RoomCalendarView>) {
    // Every start the screen makes goes through the same check the URL's
    // does, so paging past the years the read takes stops rather than writing
    // a window the grid will not show.
    if (change.from && !isCalendarDay(change.from)) return;
    setWindowFailedAt(null);
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
  const filtered =
    view.floor !== null ||
    view.search !== "" ||
    view.overlapsOnly ||
    !view.showRequested ||
    !view.showDeparted;
  const opened = selected ? (bars.get(selected.key) ?? null) : null;

  return (
    <div className="space-y-5">
      <PageHeader>
        {/* h2: the page bar (AppPageBar) already sets this route's one h1. */}
        <h2 className="text-2xl font-bold tracking-tight">
          {t("title", { property: propertyName })}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </PageHeader>

      <CalendarToolbar
        calendar={calendar}
        lengths={lengths}
        locale={locale}
        onChange={update}
        view={view}
      />

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
                  floor: null,
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
          {nothingBooked ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("nothingBooked", {
                from: calendarDate(calendar.from, locale),
                to: calendarDate(lastDay, locale),
              })}
            </p>
          ) : null}
          <CalendarGrid
            calendar={calendar}
            locale={locale}
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
          {filtered ? (
            <p className="text-xs text-muted-foreground">{t("filteredNote")}</p>
          ) : null}
        </>
      )}

      <BarDrawer
        barKey={opened ? barKey(opened.bar) : (selected?.key ?? null)}
        changed={opened !== null && selected?.status !== opened.bar.status}
        entry={opened}
        locale={locale}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        propertyId={scope.propertyId}
        today={calendar.today}
      />
    </div>
  );
}
