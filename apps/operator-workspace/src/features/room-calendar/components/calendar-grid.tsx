"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { Ban, Bed, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  RoomCalendar,
  RoomCalendarBar,
  RoomCalendarUnit,
} from "../../../server/viewer";
import {
  barKey,
  bedsTaken,
  outOfUseOn,
  placeBars,
  type CalendarRow,
  type PlacedEntry,
} from "../layout";
import { lateArrival } from "../late";
import {
  bookingGhost,
  ghostOf,
  hasEndHandle,
  type BookingTarget,
  type Ghost,
  type MoveRequest,
} from "../move";
import { useHoldText } from "./hold-text";
import { useBarDrag, type BarDrop } from "./use-bar-drag";
import { useCoarsePointer } from "./use-coarse-pointer";
import { useNightDrag } from "./use-night-drag";
import {
  BAR_GRIP,
  BAR_ICON,
  BAR_LOOK,
  barLook,
  barWarnings,
  OUT_OF_USE,
  WARNING_ICON,
  warningRing,
} from "./bar-style";

/**
 * Half a day's minimum width in rem: seven days have room for names, fourteen
 * fit a laptop with the sidebar open (a name then shows on hover and focus),
 * thirty scroll.
 */
function halfRem(days: number): number {
  if (days <= 7) return 3.5;
  if (days <= 14) return 1.5;
  return 1.25;
}

/**
 * The narrowest a bar can be and still show a warning's word beside both
 * icons: its padding and the state icon, then room for each short word. The
 * column's minimum is used, never its drawn width, so a word shown is a word
 * that fits; below this the icon stays and the word is in the bar's name
 * (RC-S1-25).
 */
function wordsFit(halves: number, days: number, words: number): boolean {
  return halves * halfRem(days) >= 2.5 + 4.25 * words;
}

const ROW =
  "grid grid-cols-[var(--cal-room)_repeat(var(--cal-halves),minmax(var(--cal-half),1fr))]";

function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

/**
 * A day's heading: its month where one begins, the weekday, and the date.
 *
 * The weekday is the language's short form. Narrower than that is ambiguous in
 * Latin scripts (Tuesday and Thursday are both T), so only Arabic, whose
 * seven single letters are all different, narrows at thirty days.
 */
function dayHeading(
  day: string,
  index: number,
  locale: SupportedLocale,
  days: number,
): { month: string; weekday: string; date: string; label: string } {
  const at = new Date(`${day}T00:00:00Z`);
  const only = (options: Intl.DateTimeFormatOptions) =>
    formatDate(at, locale, {
      day: undefined,
      month: undefined,
      year: undefined,
      timeZone: "UTC",
      ...options,
    });
  const begins = index === 0 || day.endsWith("-01");
  return {
    month: begins ? only({ month: "short" }) : "",
    weekday: only({
      weekday: days > 14 && locale === "ar" ? "narrow" : "short",
    }),
    date: only({ day: "numeric" }),
    label: only({
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

/** Saturday and Sunday, tinted so a week reads at a glance. */
function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function shortDate(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    year: undefined,
    timeZone: "UTC",
  });
}

/** The bar a key press moves to, found by where bars are drawn rather than how they are stored. */
function neighbour(
  container: HTMLElement,
  current: HTMLElement,
  key: string,
): HTMLElement | null {
  const bars = [...container.querySelectorAll<HTMLElement>("[data-bar-key]")];
  const rowOf = (bar: HTMLElement) =>
    bar.closest<HTMLElement>("[data-unit-id]");
  const centre = (bar: HTMLElement) => {
    const box = bar.getBoundingClientRect();
    return box.left + box.width / 2;
  };
  const here = centre(current);
  const nearest = (candidates: HTMLElement[]) =>
    candidates.sort(
      (a, b) => Math.abs(centre(a) - here) - Math.abs(centre(b) - here),
    )[0] ?? null;
  const currentRow = rowOf(current);

  if (key === "ArrowLeft" || key === "ArrowRight") {
    return nearest(
      bars.filter(
        (bar) =>
          rowOf(bar) === currentRow &&
          (key === "ArrowRight" ? centre(bar) > here : centre(bar) < here),
      ),
    );
  }
  if (key === "Home" || key === "End") {
    const inRow = bars.filter((bar) => rowOf(bar) === currentRow);
    const rtl = getComputedStyle(container).direction === "rtl";
    const leftmost = (key === "Home") !== rtl;
    return (
      inRow.sort((a, b) =>
        leftmost ? centre(a) - centre(b) : centre(b) - centre(a),
      )[0] ?? null
    );
  }
  if (key === "ArrowDown" || key === "ArrowUp") {
    const rows = [...container.querySelectorAll<HTMLElement>("[data-unit-id]")];
    const step = key === "ArrowDown" ? 1 : -1;
    for (
      let index = rows.indexOf(currentRow as HTMLElement) + step;
      index >= 0 && index < rows.length;
      index += step
    ) {
      const found = nearest(bars.filter((bar) => rowOf(bar) === rows[index]));
      if (found) return found;
    }
  }
  return null;
}

/** What a bar says about itself, shown the moment it is pointed at or focused. */
interface BarCard {
  box: DOMRect;
  guest: string;
  detail: string;
}

export function CalendarGrid({
  bookable,
  calendar,
  held,
  locale,
  markedDay,
  mayAmend,
  onBook,
  onDrop,
  onOpen,
  onToggleBeds,
  rows,
  updating,
}: {
  /**
   * The Units the viewer may book, whose free nights a drag across books
   * (RC-S5-02); null for a viewer without `front_desk.book`.
   */
  bookable: ReadonlySet<string> | null;
  calendar: RoomCalendar;
  /** A drop waiting on its confirm, drawn where it would go until answered. */
  held: MoveRequest | null;
  locale: SupportedLocale;
  /** The date the reader jumped to, which the window opens three days before. */
  markedDay: string | null;
  /** Whether a bar can be dragged: the viewer holds `front_desk.amend` (RC-S3-10). */
  mayAmend: boolean;
  /** Free nights were dragged across; nothing has been written (RC-S5-02). */
  onBook: (target: BookingTarget & { endsOn: string }) => void;
  /** A bar was dropped somewhere; nothing has been written (RC-S3-01). */
  onDrop: (request: MoveRequest, drop: BarDrop) => void;
  onOpen: (bar: RoomCalendarBar) => void;
  onToggleBeds: (roomId: string) => void;
  rows: CalendarRow[];
  updating: boolean;
}) {
  const t = useTranslations("roomCalendar");
  // A bar is dragged with a mouse or a pen; a finger taps it open and uses
  // Move… (CALENDAR-17).
  const dragHint = useCoarsePointer() ? t("dragHintTouch") : t("dragHint");
  const nights = calendar.nights.map((night) => night.day);
  const lastDay = nights[nights.length - 1] ?? calendar.from;
  const [drag, setDrag] = useState<{
    key: string;
    ghost: Ghost;
  } | null>(null);
  const preview = useCallback(
    (key: string, request: MoveRequest | null) =>
      setDrag(request ? { key, ghost: ghostOf(calendar, request) } : null),
    [calendar],
  );
  // A new booking has no bar of its own to fade, so it is dragged under no key.
  const previewNights = useCallback(
    (target: BookingTarget | null) =>
      setDrag(
        target ? { key: "", ghost: bookingGhost(calendar, target) } : null,
      ),
    [calendar],
  );
  const ghost = drag?.ghost ?? (held ? ghostOf(calendar, held) : null);

  // One bar is in the tab order and the arrow keys move between the rest, so
  // the grid is one stop on the page and not forty (a bar per tab stop put the
  // first booking behind every control above it).
  const orderedKeys = useMemo(
    () =>
      rows.flatMap((row) =>
        row.kind === "unit" && !row.collapsed
          ? placeBars(row.unit.bars, calendar.from, calendar.days).placed.map(
              (placed) => barKey(placed.bar),
            )
          : [],
      ),
    [rows, calendar.from, calendar.days],
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tabStop =
    activeKey !== null && orderedKeys.includes(activeKey)
      ? activeKey
      : (orderedKeys[0] ?? null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-bar-key]",
    );
    if (!current || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = neighbour(event.currentTarget, current, event.key);
    if (!next) return;
    event.preventDefault();
    setActiveKey(next.dataset.barKey ?? null);
    next.focus();
  };

  const [card, setCard] = useState<BarCard | null>(null);
  const showCard = useCallback((next: BarCard | null) => setCard(next), []);

  // Whether more days lie beyond the edge of what is shown, so a window that
  // does not fit says so instead of ending at an unmarked cut.
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      setMore(
        Math.abs(element.scrollLeft) + element.clientWidth <
          element.scrollWidth - 2,
      );
      setCard(null);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [calendar.days, rows.length]);

  return (
    <div className="relative">
      <div
        aria-busy={updating}
        className={cn(
          "max-h-[max(24rem,calc(100dvh-13rem))] overflow-auto rounded-xl border bg-card transition-opacity [--cal-room:5rem] md:[--cal-room:11rem]",
          updating && "opacity-60",
        )}
        onKeyDown={onKeyDown}
        ref={scroller}
        style={vars({
          "--cal-halves": calendar.days * 2,
          "--cal-half": `${halfRem(calendar.days)}rem`,
        })}
      >
        {/*
          A definite width, from the same template every row uses. Sized to its
          content instead, a guest's name inside a bar would widen the days it
          spans, and thirty days would no longer be thirty narrow columns.
        */}
        <div
          aria-label={t("gridLabel")}
          className="w-[calc(var(--cal-room)+var(--cal-halves)*var(--cal-half))] min-w-full"
          role="table"
        >
          <div className="sticky top-0 z-20 bg-card" role="rowgroup">
            <div className={cn(ROW, "border-b")} role="row">
              <div
                className="sticky start-0 z-10 flex items-end bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
                role="columnheader"
              >
                {t("roomColumn")}
              </div>
              {nights.map((day, index) => {
                const heading = dayHeading(day, index, locale, calendar.days);
                return (
                  <div
                    aria-current={day === calendar.today ? "date" : undefined}
                    aria-label={
                      day === markedDay
                        ? `${heading.label}. ${t("chosenDay")}`
                        : heading.label
                    }
                    className={cn(
                      "col-span-2 overflow-hidden border-s py-1.5 text-center text-xs tabular-nums",
                      heading.month && index > 0 && "border-s-foreground/30",
                      day === calendar.today
                        ? "bg-primary/10 font-semibold text-primary"
                        : isWeekend(day)
                          ? "bg-muted/60 text-muted-foreground"
                          : "text-muted-foreground",
                      day === markedDay && "ring-2 ring-primary/60 ring-inset",
                    )}
                    data-marked={day === markedDay || undefined}
                    key={day}
                    role="columnheader"
                  >
                    <span className="block h-3 text-[10px] leading-3 font-semibold tracking-wide uppercase">
                      {heading.month}
                    </span>
                    <span className="block leading-tight">
                      {heading.weekday}
                    </span>
                    <span className="block font-medium leading-tight">
                      {heading.date}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={cn(ROW, "border-b bg-muted/40")} role="row">
              <div
                className="sticky start-0 z-10 bg-muted px-3 py-1.5 text-xs font-medium"
                role="rowheader"
                title={t("freeRowHint")}
              >
                {t("freeRow")}
              </div>
              {calendar.nights.map((night) => (
                <div
                  aria-label={t("freeOn", {
                    date: shortDate(night.day, locale),
                    n: night.free,
                    of: calendar.sellable,
                  })}
                  className={cn(
                    "col-span-2 border-s py-1.5 text-center text-xs tabular-nums",
                    night.free === 0 && "font-semibold text-danger",
                  )}
                  key={night.day}
                  role="cell"
                >
                  {night.free}
                </div>
              ))}
            </div>
          </div>

          <div role="rowgroup">
            {rows.map((row) => {
              if (row.kind === "building") {
                return (
                  <div
                    className="sticky start-0 border-b bg-muted/60 px-3 py-1.5 text-sm font-semibold"
                    key={row.key}
                    role="row"
                  >
                    <span role="rowheader">
                      {row.building ?? t("noBuilding")}
                    </span>
                  </div>
                );
              }
              if (row.kind === "floor") {
                return (
                  <div
                    className="border-b px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    key={row.key}
                    role="row"
                  >
                    <span role="rowheader">
                      {row.floor === null
                        ? t("noFloor")
                        : t("floorOption", { floor: row.floor })}
                    </span>
                  </div>
                );
              }
              return (
                <UnitRow
                  bookable={bookable?.has(row.unit.unitId) ?? false}
                  calendar={calendar}
                  collapsed={row.collapsed}
                  draggingKey={drag?.key ?? null}
                  dragHint={dragHint}
                  ghost={ghost?.unitId === row.unit.unitId ? ghost : null}
                  key={row.key}
                  lastDay={lastDay}
                  locale={locale}
                  mayAmend={mayAmend}
                  nested={row.nested}
                  nights={nights}
                  onBook={onBook}
                  onCard={showCard}
                  onDrop={onDrop}
                  onFocusBar={setActiveKey}
                  onOpen={onOpen}
                  onPreview={preview}
                  onPreviewNights={previewNights}
                  onToggleBeds={onToggleBeds}
                  room={row.room}
                  tabStop={tabStop}
                  unit={row.unit}
                />
              );
            })}
          </div>
        </div>
      </div>
      {more ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-px end-px w-10 rounded-e-xl bg-linear-to-l from-foreground/15 to-transparent rtl:bg-linear-to-r"
          data-scroll-cue=""
        />
      ) : null}
      {card ? <BarCardView card={card} /> : null}
    </div>
  );
}

/** The hover and focus card: instant, unlike the browser's own tooltip, which waits. */
function BarCardView({ card }: { card: BarCard }) {
  const width = 256;
  const left = Math.max(
    8,
    Math.min(card.box.left, window.innerWidth - width - 8),
  );
  const above = card.box.bottom + 72 > window.innerHeight;
  return (
    <div
      className="pointer-events-none fixed z-50 w-64 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md"
      data-bar-card=""
      role="presentation"
      style={{
        left,
        top: above ? card.box.top - 6 : card.box.bottom + 6,
        transform: above ? "translateY(-100%)" : undefined,
      }}
    >
      <span className="block text-sm font-semibold" dir="auto">
        {card.guest}
      </span>
      <span className="block">{card.detail}</span>
    </div>
  );
}

function UnitRow({
  bookable,
  calendar,
  collapsed,
  dragHint,
  draggingKey,
  ghost,
  lastDay,
  locale,
  mayAmend,
  nested,
  nights,
  onBook,
  onCard,
  onDrop,
  onFocusBar,
  onOpen,
  onPreview,
  onPreviewNights,
  onToggleBeds,
  room,
  tabStop,
  unit,
}: {
  /** Whether the viewer may book this Unit, so a drag across its free nights does. */
  bookable: boolean;
  calendar: RoomCalendar;
  collapsed: boolean;
  /** What a bar says about moving it, for the pointer in use. */
  dragHint: string;
  /** The bar being dragged, drawn faint where it still stands. */
  draggingKey: string | null;
  /** Where the drag would put its bar, when that is this row. */
  ghost: Ghost | null;
  lastDay: string;
  locale: SupportedLocale;
  mayAmend: boolean;
  nested: boolean;
  nights: string[];
  onBook: (target: BookingTarget & { endsOn: string }) => void;
  onCard: (card: BarCard | null) => void;
  onDrop: (request: MoveRequest, drop: BarDrop) => void;
  onFocusBar: (key: string) => void;
  onOpen: (bar: RoomCalendarBar) => void;
  onPreview: (key: string, request: MoveRequest | null) => void;
  onPreviewNights: (target: BookingTarget | null) => void;
  onToggleBeds: (roomId: string) => void;
  room: RoomCalendarUnit | null;
  /** The one bar in the tab order. */
  tabStop: string | null;
  unit: RoomCalendarUnit;
}) {
  const t = useTranslations("roomCalendar");
  const { placed, lanes } = placeBars(unit.bars, calendar.from, calendar.days);
  const outOfUse =
    unit.status === "blocked" || unit.status === "out_of_service";
  const holdText = useHoldText(locale);
  // A bed under a room held out of order is held by the room's request.
  const hold =
    unit.status === "out_of_service"
      ? (calendar.holds?.[unit.unitId] ??
        (room ? calendar.holds?.[room.unitId] : undefined))
      : undefined;
  const heldBy = hold ? holdText(hold) : null;
  const taken = collapsed ? bedsTaken(unit, nights) : null;
  // A room let by the bed is booked through its beds, and a collapsed room
  // shows counts rather than nights to choose from.
  const books = bookable && unit.sellable && !collapsed;
  const nightDrag = useNightDrag({
    enabled: books,
    onBook,
    onPreview: onPreviewNights,
    today: calendar.today,
    unitId: unit.unitId,
  });

  return (
    <div
      className={cn(ROW, "relative auto-rows-[2.25rem] border-b")}
      data-unit-id={unit.unitId}
      role="row"
      style={vars({ "--lanes": lanes })}
      {...(books ? nightDrag : {})}
    >
      <div
        className={cn(
          "sticky start-0 z-10 row-span-(--lanes) flex items-center gap-1.5 border-e bg-card pe-2 text-sm",
          nested ? "ps-5 text-muted-foreground md:ps-8" : "ps-3 font-medium",
        )}
        role="rowheader"
      >
        {unit.beds.length > 0 ? (
          <button
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? "expand" : "collapse", {
              room: unit.name,
            })}
            className="-ms-1 rounded p-0.5 hover:bg-muted"
            onClick={() => onToggleBeds(unit.unitId)}
            type="button"
          >
            {collapsed ? (
              <ChevronRight
                aria-hidden="true"
                className="size-4 rtl:rotate-180"
              />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4" />
            )}
          </button>
        ) : null}
        {unit.unitType === "bed" ? (
          <Bed aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        <span className="truncate">{unit.name}</span>
        {outOfUse ? (
          <span
            className="ms-auto inline-flex items-center gap-1 text-xs text-warning"
            title={
              [unit.statusReason, heldBy?.full].filter(Boolean).join(" · ") ||
              undefined
            }
          >
            <Lock aria-hidden="true" className="size-3" />
            <span className="sr-only md:not-sr-only">
              {unit.status === "blocked" ? t("blocked") : t("outOfService")}
              {heldBy ? ` · ${heldBy.reference}` : null}
            </span>
            {unit.statusReason ? (
              <span className="sr-only">: {unit.statusReason}</span>
            ) : null}
            {heldBy ? <span className="sr-only">: {heldBy.full}</span> : null}
          </span>
        ) : null}
      </div>

      {nights.map((day, index) => (
        <div
          className={cn(
            "col-start-(--day-col) col-span-2 row-start-1 row-span-(--lanes) border-s",
            day === calendar.today
              ? "bg-primary/5"
              : isWeekend(day) && "bg-muted/40",
            outOfUseOn(unit, day, calendar.today) && OUT_OF_USE,
            books && day >= calendar.today && "cursor-cell",
          )}
          data-day={day}
          key={day}
          role="cell"
          style={vars({ "--day-col": index * 2 + 2 })}
        >
          {taken ? (
            <span
              aria-label={t("bedsTakenLabel", {
                n: taken[index] ?? 0,
                of: unit.beds.length,
              })}
              className="flex h-full items-center justify-center text-xs tabular-nums text-muted-foreground"
            >
              {taken[index]}/{unit.beds.length}
            </span>
          ) : null}
        </div>
      ))}

      {collapsed
        ? null
        : placed.map(
            ({ bar, start, end, lane, continuesBefore, continuesAfter }) => (
              <BarButton
                bar={bar}
                continuesAfter={continuesAfter}
                continuesBefore={continuesBefore}
                days={calendar.days}
                dragHint={dragHint}
                dragging={draggingKey === barKey(bar)}
                end={end}
                entry={{ bar, unit, room }}
                key={barKey(bar)}
                lane={lane}
                lastDay={lastDay}
                locale={locale}
                mayAmend={mayAmend}
                onCard={onCard}
                onDrop={onDrop}
                onFocusBar={onFocusBar}
                onOpen={onOpen}
                onPreview={onPreview}
                start={start}
                today={calendar.today}
                tabStop={tabStop === barKey(bar)}
              />
            ),
          )}

      {ghost && ghost.span.start < ghost.span.end ? (
        <DropGhost ghost={ghost} />
      ) : null}
    </div>
  );
}

/** Where a drag would put its bar: dashed, and marked with an icon when it cannot go. */
function DropGhost({ ghost }: { ghost: Ghost }) {
  const t = useTranslations("roomCalendar");
  const { span } = ghost;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative z-[3] col-start-(--bar-start) col-end-(--bar-end) row-start-1 my-1 flex items-center justify-center rounded-md border-2 border-dashed",
        ghost.blocked
          ? "border-danger bg-danger-soft/70 text-danger"
          : "border-primary bg-primary/10 text-primary",
      )}
      data-blocked={ghost.blocked}
      data-drop-ghost=""
      style={vars({ "--bar-start": span.start + 2, "--bar-end": span.end + 2 })}
      title={ghost.blocked ? t("dropBlocked") : undefined}
    >
      {ghost.blocked ? <Ban className="size-4" /> : null}
    </div>
  );
}

function BarButton({
  bar,
  continuesAfter,
  continuesBefore,
  days,
  dragHint,
  dragging,
  end,
  entry,
  lane,
  lastDay,
  locale,
  mayAmend,
  onCard,
  onDrop,
  onFocusBar,
  onOpen,
  onPreview,
  start,
  tabStop,
  today,
}: {
  bar: RoomCalendarBar;
  continuesAfter: boolean;
  continuesBefore: boolean;
  days: number;
  dragHint: string;
  dragging: boolean;
  end: number;
  entry: PlacedEntry;
  lane: number;
  lastDay: string;
  locale: SupportedLocale;
  mayAmend: boolean;
  onCard: (card: BarCard | null) => void;
  onDrop: (request: MoveRequest, drop: BarDrop) => void;
  onFocusBar: (key: string) => void;
  onOpen: (bar: RoomCalendarBar) => void;
  onPreview: (key: string, request: MoveRequest | null) => void;
  start: number;
  /** Whether this is the bar the Tab key reaches. */
  tabStop: boolean;
  today: string;
}) {
  const t = useTranslations("roomCalendar");
  const key = barKey(bar);
  const { grip, consumeDragClick } = useBarDrag({
    enabled: mayAmend,
    entry,
    onDrop,
    onPreview: useCallback(
      (request) => onPreview(key, request),
      [key, onPreview],
    ),
  });
  const moveGrip = grip("move");
  const guest = bar.guestName ?? t("noGuestRecorded");
  const look = barLook(bar);
  const warnings = barWarnings(bar);
  const StateIcon = BAR_ICON[look];
  const showWords = wordsFit(end - start, days, warnings.length);
  // Too narrow for words, the bar tightens and keeps the most serious
  // warning's icon beside its state's; the rest are in its name and drawer.
  const iconSize = showWords ? "size-3.5" : "size-3";
  const flags = warnings.map((warning) =>
    warning === "clashes" && bar.clashesWith === "stay"
      ? t("clashesStay")
      : t(warning),
  );
  const from = shortDate(bar.startsOn, locale);
  const to = bar.endsOn ? shortDate(bar.endsOn, locale) : t("noEndDate");
  // An overdue Guest is drawn through tonight because they are still in the
  // room; the name says so, where "from the 29th to the 1st" would not.
  const late = lateArrival(bar, today);
  const label = [
    bar.overdue
      ? t("barLabelOverdue", { guest, from, to })
      : late
        ? t(late.nightsGone ? "barLabelGone" : "barLabelLate", {
            guest,
            status: t(look),
            from,
            to,
          })
        : t("barLabel", { guest, status: t(look), from, to }),
    ...flags,
  ].join(". ");
  const showCard = (target: HTMLElement) =>
    onCard({
      box: target.getBoundingClientRect(),
      guest,
      detail: [
        bar.overdue
          ? t("barOverdueCard", { to })
          : late
            ? t(late.nightsGone ? "barGoneCard" : "barLateCard", { from })
            : `${t(look)} · ${from} – ${to}`,
        ...flags,
      ].join(" · "),
    });

  const position = vars({
    "--bar-start": start + 2,
    "--bar-end": end + 2,
    "--bar-lane": lane + 1,
  });

  return (
    // `contents` keeps the bar and its grip grid items of the row while
    // giving the grip a hover of its own bar, not of every bar before it.
    <div className="group/bar contents">
      <button
        aria-label={label}
        data-bar-key={key}
        data-dragging={dragging || undefined}
        data-look={look}
        className={cn(
          "relative z-[1] col-start-(--bar-start) col-end-(--bar-end) row-start-(--bar-lane) my-1 flex min-w-0 select-none items-center overflow-hidden rounded-md text-start text-xs font-medium shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          showWords ? "gap-1 px-1.5" : "gap-0.5 px-0.5",
          BAR_LOOK[look],
          warningRing(warnings),
          continuesBefore && "rounded-s-none border-s-0",
          continuesAfter && "rounded-e-none border-e-0",
          mayAmend && "cursor-grab active:cursor-grabbing",
          dragging && "opacity-40",
        )}
        onBlur={() => onCard(null)}
        onClick={() => {
          onCard(null);
          if (!consumeDragClick()) onOpen(bar);
        }}
        onFocus={(event) => {
          onFocusBar(key);
          if (event.currentTarget.matches(":focus-visible")) {
            showCard(event.currentTarget);
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") showCard(event.currentTarget);
        }}
        onPointerLeave={() => onCard(null)}
        {...moveGrip}
        onPointerDown={(event) => {
          onCard(null);
          moveGrip.onPointerDown(event);
        }}
        style={position}
        tabIndex={tabStop ? 0 : -1}
        title={mayAmend ? dragHint : undefined}
        type="button"
      >
        <StateIcon aria-hidden="true" className={cn(iconSize, "shrink-0")} />
        {(showWords ? warnings : warnings.slice(0, 1)).map((warning) => {
          const WarningIcon = WARNING_ICON[warning];
          return (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 font-semibold"
              key={warning}
            >
              <WarningIcon aria-hidden="true" className={iconSize} />
              {showWords ? t(`barWord.${warning}`) : null}
            </span>
          );
        })}
        {/* Its own direction: a Latin name in an Arabic row would otherwise
            be cut at its front. */}
        <span className="truncate" dir="auto">
          {guest}
        </span>
      </button>
      {mayAmend && hasEndHandle(bar, lastDay) ? (
        // The end is shown as a pill while the bar is hovered, so pulling it
        // to change the departure is found rather than guessed at.
        <div
          aria-hidden="true"
          className={cn(
            "relative z-[2] col-start-(--bar-start) col-end-(--bar-end) row-start-(--bar-lane) my-1 w-3 cursor-ew-resize justify-self-end rounded-full bg-clip-content px-1 py-2 group-hover/bar:bg-current/50 hover:bg-current/80",
            BAR_GRIP[look],
          )}
          data-end-handle={key}
          {...grip("resize")}
          style={position}
          title={t("resizeHint")}
        />
      ) : null}
    </div>
  );
}
