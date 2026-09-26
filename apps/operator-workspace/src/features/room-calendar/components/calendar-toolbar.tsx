"use client";

import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  TriangleAlert,
  Ban,
} from "lucide-react";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import type { RoomCalendar } from "../../../server/viewer";
import { shiftDay } from "../layout";
import { isCalendarDay, type RoomCalendarView } from "../view";
import { Legend } from "./legend";

/** A window moves a week at a time, whatever its length. */
const STEP_DAYS = 7;
/** A chosen date opens with the same lead as today does: three days before it. */
const LEAD_DAYS = 3;
const ALL_FLOORS = "all";

function range(calendar: RoomCalendar, locale: SupportedLocale): string {
  const format = (day: string) =>
    formatDate(new Date(`${day}T00:00:00Z`), locale, {
      month: "short",
      timeZone: "UTC",
    });
  return `${format(calendar.from)} – ${format(
    shiftDay(calendar.from, calendar.days - 1),
  )}`;
}

export function CalendarToolbar({
  calendar,
  lengths,
  locale,
  onChange,
  view,
}: {
  calendar: RoomCalendar;
  lengths: number[];
  locale: SupportedLocale;
  onChange: (change: Partial<RoomCalendarView>) => void;
  view: RoomCalendarView;
}) {
  const t = useTranslations("roomCalendar");
  const floors = [
    ...new Set(
      calendar.units
        .map((unit) => unit.floor)
        .filter((floor): floor is number => floor !== null),
    ),
  ].sort((a, b) => a - b);
  const hasNoFloor = calendar.units.some((unit) => unit.floor === null);
  const roomsWithBeds = calendar.units
    .filter((unit) => unit.beds.length > 0)
    .map((unit) => unit.unitId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1">
          <Button
            aria-label={t("previous")}
            onClick={() =>
              onChange({ from: shiftDay(calendar.from, -STEP_DAYS) })
            }
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
          </Button>
          <Button
            onClick={() => onChange({ from: null })}
            size="sm"
            variant={view.from === null ? "secondary" : "outline"}
          >
            {t("today")}
          </Button>
          <Button
            aria-label={t("next")}
            onClick={() =>
              onChange({ from: shiftDay(calendar.from, STEP_DAYS) })
            }
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
          </Button>
        </div>

        <p aria-live="polite" className="px-2 text-sm font-medium tabular-nums">
          {range(calendar, locale)}
        </p>

        <Label className="sr-only" htmlFor="room-calendar-date">
          {t("goTo")}
        </Label>
        {/*
          Uncontrolled, so a date half typed is not cleared under the cursor,
          and a value is taken only once it is a real day in range: typing a
          year passes through 0002 and 0202 on the way to 2026, and none of
          those may reach the URL.
        */}
        <Input
          className="h-8 w-auto"
          id="room-calendar-date"
          onChange={(event) => {
            const day = event.target.value;
            if (isCalendarDay(day)) {
              onChange({ from: shiftDay(day, -LEAD_DAYS) });
            }
          }}
          title={t("goTo")}
          type="date"
        />

        <div
          aria-label={t("length")}
          className="inline-flex rounded-lg border bg-muted p-0.5"
          role="group"
        >
          {lengths.map((days) => (
            <Button
              aria-pressed={view.days === days}
              className="h-7 px-3 text-xs"
              key={days}
              onClick={() => onChange({ days })}
              size="sm"
              variant={view.days === days ? "default" : "ghost"}
            >
              {t("lengthOption", { days })}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          onValueChange={(value) =>
            onChange({ floor: value === ALL_FLOORS ? null : value })
          }
          value={view.floor ?? ALL_FLOORS}
        >
          <SelectTrigger aria-label={t("floorFilter")} className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FLOORS}>{t("allFloors")}</SelectItem>
            {floors.map((floor) => (
              <SelectItem key={floor} value={String(floor)}>
                {t("floorOption", { floor })}
              </SelectItem>
            ))}
            {hasNoFloor ? (
              <SelectItem value="none">{t("noFloor")}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>

        <Label className="sr-only" htmlFor="room-calendar-search">
          {t("search")}
        </Label>
        <Input
          className="h-8 w-56"
          id="room-calendar-search"
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={t("search")}
          type="search"
          value={view.search}
        />

        <label className="inline-flex items-center gap-2 text-sm">
          <Checkbox
            checked={view.showRequested}
            onCheckedChange={(checked) =>
              onChange({ showRequested: checked === true })
            }
          />
          {t("showRequested")}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <Checkbox
            checked={view.showDeparted}
            onCheckedChange={(checked) =>
              onChange({ showDeparted: checked === true })
            }
          />
          {t("showDeparted")}
        </label>

        {roomsWithBeds.length > 0 ? (
          <Button
            onClick={() =>
              onChange({
                collapsed: view.collapsed.length > 0 ? [] : roomsWithBeds,
              })
            }
            size="sm"
            variant="ghost"
          >
            {view.collapsed.length > 0 ? (
              <ChevronsUpDown aria-hidden="true" />
            ) : (
              <ChevronsDownUp aria-hidden="true" />
            )}
            {view.collapsed.length > 0 ? t("expandAll") : t("collapseAll")}
          </Button>
        ) : null}

        {calendar.overlaps > 0 || calendar.bookedWhileBlocked > 0 ? (
          <Button
            aria-pressed={view.overlapsOnly}
            className="border-danger/40 text-danger"
            onClick={() => onChange({ overlapsOnly: !view.overlapsOnly })}
            size="sm"
            variant={view.overlapsOnly ? "destructive" : "outline"}
          >
            {calendar.overlaps > 0 ? (
              <>
                <TriangleAlert aria-hidden="true" />
                {t("overlapCount", { count: calendar.overlaps })}
              </>
            ) : null}
            {calendar.bookedWhileBlocked > 0 ? (
              <>
                <Ban aria-hidden="true" />
                {t("bookedWhileBlockedCount", {
                  count: calendar.bookedWhileBlocked,
                })}
              </>
            ) : null}
          </Button>
        ) : null}
      </div>

      <Legend />
    </div>
  );
}
