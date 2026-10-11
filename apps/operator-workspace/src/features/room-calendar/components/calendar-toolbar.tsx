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
import { shiftDay } from "../layout";
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
  onChange: (change: Partial<RoomCalendarView>) => void;
  view: RoomCalendarView;
}) {
  const t = useTranslations("roomCalendar");
  const common = useTranslations();
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
            onChange={(range) => {
              if (range.from && range.to) {
                const fromDate = new Date(`${range.from}T00:00:00Z`);
                const toDate = new Date(`${range.to}T00:00:00Z`);
                const span =
                  Math.round(
                    (toDate.getTime() - fromDate.getTime()) / 86_400_000,
                  ) + 1;
                const closest = lengths.reduce((prev, curr) =>
                  Math.abs(curr - span) < Math.abs(prev - span) ? curr : prev,
                );
                onChange({ from: range.from, days: closest });
              } else if (range.from && !range.to) {
                onChange({ from: range.from });
              } else if (!range.from && !range.to) {
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
