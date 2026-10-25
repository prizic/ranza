"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  TriangleAlert,
  Ban,
  SlidersHorizontal,
} from "lucide-react";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Checkbox,
  cn,
  DateRangeField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import type { RoomCalendar, RoomCalendarUnit } from "../../../server/viewer";
import { daysBetween, lengthCovering, shiftDay } from "../layout";
import { UNIT_STATES, UNIT_TYPES, type RoomCalendarView } from "../view";
import { Legend } from "./legend";

/** A window moves a week at a time, whatever its length. */
const STEP_DAYS = 7;
const ALL_FLOORS = "all";
const ALL = "all";

/** The types and states of the Units the calendar holds, beds included. */
function presentKinds(units: readonly RoomCalendarUnit[]): {
  types: Set<string>;
  states: Set<string>;
} {
  const types = new Set<string>();
  const states = new Set<string>();
  const visit = (unit: RoomCalendarUnit) => {
    types.add(unit.unitType);
    states.add(unit.status);
    unit.beds.forEach(visit);
  };
  units.forEach(visit);
  return { types, states };
}

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
  /** `marked` is the day a jump to a date was asked for, to be shown in its column. */
  onChange: (change: Partial<RoomCalendarView>, marked?: string) => void;
  view: RoomCalendarView;
}) {
  const t = useTranslations("roomCalendar");
  const common = useTranslations();
  // Floor, type, state, the two toggles and the legend fold behind one button
  // on every screen, so the grid starts within a laptop's first screen
  // (CALENDAR-12). The button counts what narrows the grid; a link that opens
  // already narrowed opens the filters too, so the narrowing is not hidden.
  // The search and the overlap button stay in view: they are the ones used
  // every minute.
  const narrowing = [
    view.floor !== null,
    view.unitType !== null,
    view.unitState !== null,
    !view.showRequested,
    !view.showDeparted,
  ].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(narrowing > 0);
  // Only what the Property has is offered, so no filter can empty the grid on
  // a kind of Unit that does not exist (RC-S3-14).
  const present = presentKinds(calendar.units);
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
            title={t("previous")}
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
            title={t("next")}
            variant="outline"
          >
            <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
          </Button>
        </div>

        <p aria-live="polite" className="sr-only">
          {range(calendar, locale)}
        </p>

        <div className="w-64 sm:w-72">
          <DateRangeField
            id="room-calendar-range"
            labels={{
              from: t("from"),
              to: t("to"),
              emptyFrom: t("emptyFrom"),
              emptyTo: t("emptyTo"),
              pickFrom: t("pickFrom"),
              pickTo: t("pickTo"),
              clear: common("dateRangeClear"),
              done: common("dateRangeDone"),
              span: (days) => t("lengthOption", { days: days + 1 }),
            }}
            locale={locale}
            maxSpan={Math.max(...lengths) - 1}
            // Applied once both ends are chosen: the start alone is half a
            // choice, and reading the grid under an open calendar for it
            // would only be thrown away by the next press.
            onChange={(chosen) => {
              if (chosen.from && chosen.to) {
                onChange(
                  {
                    from: chosen.from,
                    days: lengthCovering(
                      daysBetween(chosen.from, chosen.to) + 1,
                      lengths,
                    ),
                  },
                  chosen.from,
                );
              } else if (!chosen.from && !chosen.to) {
                onChange({ from: null });
              }
            }}
            presets={lengths.map((days) => ({
              label: t("lengthOption", { days }),
              from: calendar.from,
              to: shiftDay(calendar.from, days - 1),
            }))}
            today={calendar.today}
            value={{
              from: calendar.from,
              to: shiftDay(calendar.from, calendar.days - 1),
            }}
          />
        </div>

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

        <Label className="sr-only" htmlFor="room-calendar-search">
          {t("search")}
        </Label>
        <Input
          // Grows to 12 rem and gives way before the Filters button wraps onto
          // a row of its own: with a fixed 12 rem the toolbar fitted one row at
          // 1280 px by under 20 px, and a build whose text is a little wider
          // (CI's) made it two, which put the grid 40 px lower (CALENDAR-12).
          className="h-8 w-full sm:w-auto sm:max-w-48 sm:min-w-32 sm:flex-1 sm:basis-32"
          id="room-calendar-search"
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={t("search")}
          type="search"
          value={view.search}
        />

        <Button
          aria-controls="room-calendar-filters"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          size="sm"
          title={t("filtersHint")}
          variant="outline"
        >
          <SlidersHorizontal aria-hidden="true" />
          {narrowing > 0
            ? t("filtersCount", { count: narrowing })
            : t("filters")}
        </Button>

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

      <div
        className={cn(
          "flex-wrap items-center gap-x-4 gap-y-2",
          filtersOpen ? "flex" : "hidden",
        )}
        id="room-calendar-filters"
      >
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

        <Select
          onValueChange={(value) =>
            onChange({
              unitType: UNIT_TYPES.find((type) => type === value) ?? null,
            })
          }
          value={view.unitType ?? ALL}
        >
          <SelectTrigger aria-label={t("typeFilter")} className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
            {UNIT_TYPES.filter((type) => present.types.has(type)).map(
              (type) => (
                <SelectItem key={type} value={type}>
                  {common(`unitType.${type}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) =>
            onChange({
              unitState: UNIT_STATES.find((state) => state === value) ?? null,
            })
          }
          value={view.unitState ?? ALL}
        >
          <SelectTrigger aria-label={t("stateFilter")} className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allStates")}</SelectItem>
            {UNIT_STATES.filter((state) => present.states.has(state)).map(
              (state) => (
                <SelectItem key={state} value={state}>
                  {t(`unitState.${state}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>

        <div className="inline-flex items-center gap-4 whitespace-nowrap">
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
        </div>

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

        <div className="basis-full">
          <Legend />
        </div>
      </div>
    </div>
  );
}
