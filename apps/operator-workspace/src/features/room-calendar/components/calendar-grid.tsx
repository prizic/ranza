"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Bed, ChevronDown, ChevronRight, Lock } from "lucide-react";
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
} from "../layout";
import {
  BAR_ICON,
  BAR_LOOK,
  barLook,
  barWarnings,
  OUT_OF_USE,
  WARNING_ICON,
  warningRing,
} from "./bar-style";

/** Half a day's minimum width in rem, so 30 days still fit a laptop and 7 have room for names. */
function halfRem(days: number): number {
  if (days <= 7) return 3.5;
  if (days <= 14) return 2.25;
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
  "grid grid-cols-[11rem_repeat(var(--cal-halves),minmax(var(--cal-half),1fr))]";

function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

/** A day's heading as two lines: the weekday, narrow when the days are, and the date. */
function dayHeading(
  day: string,
  locale: SupportedLocale,
  days: number,
): { weekday: string; date: string } {
  const at = new Date(`${day}T00:00:00Z`);
  const only = (options: Intl.DateTimeFormatOptions) =>
    formatDate(at, locale, {
      day: undefined,
      month: undefined,
      year: undefined,
      timeZone: "UTC",
      ...options,
    });
  return {
    weekday: only({ weekday: days > 14 ? "narrow" : "short" }),
    date: only({ day: "numeric" }),
  };
}

function shortDate(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    year: undefined,
    timeZone: "UTC",
  });
}

export function CalendarGrid({
  calendar,
  locale,
  onOpen,
  onToggleBeds,
  rows,
  updating,
}: {
  calendar: RoomCalendar;
  locale: SupportedLocale;
  onOpen: (bar: RoomCalendarBar) => void;
  onToggleBeds: (roomId: string) => void;
  rows: CalendarRow[];
  updating: boolean;
}) {
  const t = useTranslations("roomCalendar");
  const nights = calendar.nights.map((night) => night.day);

  return (
    <div
      aria-busy={updating}
      className={cn(
        "max-h-[70vh] overflow-auto rounded-xl border bg-card transition-opacity",
        updating && "opacity-60",
      )}
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
        className="w-[calc(11rem+var(--cal-halves)*var(--cal-half))] min-w-full"
        role="table"
      >
        <div className="sticky top-0 z-20 bg-card" role="rowgroup">
          <div className={cn(ROW, "border-b")} role="row">
            <div
              className="sticky start-0 z-10 bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
              role="columnheader"
            >
              {t("roomColumn")}
            </div>
            {nights.map((day) => (
              <div
                aria-current={day === calendar.today ? "date" : undefined}
                className={cn(
                  "col-span-2 overflow-hidden border-s py-1.5 text-center text-xs tabular-nums",
                  day === calendar.today
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground",
                )}
                key={day}
                role="columnheader"
              >
                <span className="block leading-tight">
                  {dayHeading(day, locale, calendar.days).weekday}
                </span>
                <span className="block font-medium leading-tight">
                  {dayHeading(day, locale, calendar.days).date}
                </span>
              </div>
            ))}
          </div>
          <div className={cn(ROW, "border-b bg-muted/40")} role="row">
            <div
              className="sticky start-0 z-10 bg-muted px-3 py-1.5 text-xs font-medium"
              role="rowheader"
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
                calendar={calendar}
                collapsed={row.collapsed}
                key={row.key}
                locale={locale}
                nested={row.nested}
                nights={nights}
                onOpen={onOpen}
                onToggleBeds={onToggleBeds}
                unit={row.unit}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UnitRow({
  calendar,
  collapsed,
  locale,
  nested,
  nights,
  onOpen,
  onToggleBeds,
  unit,
}: {
  calendar: RoomCalendar;
  collapsed: boolean;
  locale: SupportedLocale;
  nested: boolean;
  nights: string[];
  onOpen: (bar: RoomCalendarBar) => void;
  onToggleBeds: (roomId: string) => void;
  unit: RoomCalendarUnit;
}) {
  const t = useTranslations("roomCalendar");
  const { placed, lanes } = placeBars(unit.bars, calendar.from, calendar.days);
  const outOfUse =
    unit.status === "blocked" || unit.status === "out_of_service";
  const taken = collapsed ? bedsTaken(unit, nights) : null;

  return (
    <div
      className={cn(ROW, "relative auto-rows-[2.25rem] border-b")}
      role="row"
      style={vars({ "--lanes": lanes })}
    >
      <div
        className={cn(
          "sticky start-0 z-10 row-span-(--lanes) flex items-center gap-1.5 border-e bg-card pe-2 text-sm",
          nested ? "ps-8 text-muted-foreground" : "ps-3 font-medium",
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
            title={unit.statusReason ?? undefined}
          >
            <Lock aria-hidden="true" className="size-3" />
            {unit.status === "blocked" ? t("blocked") : t("outOfService")}
            {unit.statusReason ? (
              <span className="sr-only">: {unit.statusReason}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {nights.map((day, index) => (
        <div
          className={cn(
            "col-start-(--day-col) col-span-2 row-start-1 row-span-(--lanes) border-s",
            day === calendar.today && "bg-primary/5",
            outOfUseOn(unit, day, calendar.today) && OUT_OF_USE,
          )}
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
                end={end}
                key={barKey(bar)}
                lane={lane}
                locale={locale}
                onOpen={onOpen}
                start={start}
              />
            ),
          )}
    </div>
  );
}

function BarButton({
  bar,
  continuesAfter,
  continuesBefore,
  days,
  end,
  lane,
  locale,
  onOpen,
  start,
}: {
  bar: RoomCalendarBar;
  continuesAfter: boolean;
  continuesBefore: boolean;
  days: number;
  end: number;
  lane: number;
  locale: SupportedLocale;
  onOpen: (bar: RoomCalendarBar) => void;
  start: number;
}) {
  const t = useTranslations("roomCalendar");
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
  const label = [
    t("barLabel", {
      guest,
      status: t(look),
      from: shortDate(bar.startsOn, locale),
      to: bar.endsOn ? shortDate(bar.endsOn, locale) : t("noEndDate"),
    }),
    ...flags,
  ].join(". ");

  return (
    <button
      aria-label={label}
      data-bar-key={barKey(bar)}
      data-look={look}
      className={cn(
        "relative z-[1] col-start-(--bar-start) col-end-(--bar-end) row-start-(--bar-lane) my-1 flex min-w-0 items-center overflow-hidden rounded-md text-start text-xs font-medium shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        showWords ? "gap-1 px-1.5" : "gap-0.5 px-0.5",
        BAR_LOOK[look],
        warningRing(warnings),
        continuesBefore && "rounded-s-none border-s-0",
        continuesAfter && "rounded-e-none border-e-0",
      )}
      onClick={() => onOpen(bar)}
      style={vars({
        "--bar-start": start + 2,
        "--bar-end": end + 2,
        "--bar-lane": lane + 1,
      })}
      title={label}
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
      <span className="truncate">{guest}</span>
    </button>
  );
}
