import type { SupportedLocale } from "@ranza/i18n";
import {
  EXPORT_RESOURCE_TYPES,
  PERSONAL_DATASETS,
  RANGE_CUT_DATASETS,
  type ExportResourceType,
  type ExportScheduleRecord,
  type ScheduleFrequency,
} from "./types";

/** The chosen datasets in the order the catalogue lists them, which is the order the file holds them. */
export function inCatalogueOrder(
  chosen: readonly ExportResourceType[],
): ExportResourceType[] {
  return EXPORT_RESOURCE_TYPES.filter((type) => chosen.includes(type));
}

/** Whether a file of these datasets would hold personal data. */
export function holdsPersonalData(
  chosen: readonly ExportResourceType[],
): boolean {
  return chosen.some((type) => PERSONAL_DATASETS.includes(type));
}

/** Whether a range of dates would cut any of these datasets. */
export function rangeCutsAny(chosen: readonly ExportResourceType[]): boolean {
  return chosen.some((type) => RANGE_CUT_DATASETS.includes(type));
}

/**
 * How long something has been waiting, in the reader's language and digits
 * ("40 s", "3 min", "2 h"): `Intl` writes the unit, so no word is typed here.
 */
export function formatElapsed(
  milliseconds: number,
  locale: SupportedLocale,
): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const [value, unit] =
    seconds < 60
      ? ([seconds, "second"] as const)
      : seconds < 3600
        ? ([Math.floor(seconds / 60), "minute"] as const)
        : ([Math.floor(seconds / 3600), "hour"] as const);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  }).format(value);
}

/** A file's size, in the reader's digits and the unit that suits it. */
export function formatSize(bytes: number, locale: SupportedLocale): string {
  const [value, unit] =
    bytes < 1024
      ? ([bytes, "byte"] as const)
      : bytes < 1024 * 1024
        ? ([bytes / 1024, "kilobyte"] as const)
        : ([bytes / (1024 * 1024), "megabyte"] as const);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value);
}

/** An export that has waited this long without the worker taking it up is worth saying so about. */
export const PENDING_SLOW_AFTER_MS = 2 * 60_000;
export const PROCESSING_SLOW_AFTER_MS = 5 * 60_000;

/**
 * When a schedule made now would first run: one step from now, as the database
 * stamps it (`now() + interval`). A month is a calendar month there, and the
 * 31st plus a month is the last day of the next one and not a day into the
 * month after, so it is clamped here the same way. Still "about" on the
 * screen: the database's clock is the one that decides.
 */
export function firstRunAt(frequency: ScheduleFrequency, now: Date): Date {
  const next = new Date(now);
  if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(
      next.getFullYear(),
      next.getMonth() + 1,
      0,
    ).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

/**
 * How far a Property's clock is from UTC, as `UTC+03:00`: the file's times are
 * UTC and the screen's are the Property's, and the gap between them is what a
 * person cutting "last month" needs to know. Latin digits in every language,
 * as everywhere else on the page. Read at `at`, which is today unless asked:
 * a zone with daylight saving is not the same distance from UTC all year.
 */
export function utcOffsetOf(timeZone: string, at: Date = new Date()): string {
  const named = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  // ECMA-402 words a zero offset as a bare "GMT", and V8 writes "GMT+00:00".
  const offset = named?.replace("GMT", "") ?? "";
  return `UTC${offset === "" ? "+00:00" : offset}`;
}

/** `days` after a `YYYY-MM-DD` day, counted in UTC so no zone moves it. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The ready-made ranges the date field offers, counted from the Property's own today. */
export function rangePresets(today: string): {
  last30: { from: string; to: string };
  thisMonth: { from: string; to: string };
  lastMonth: { from: string; to: string };
  thisYear: { from: string; to: string };
} {
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const lastOfLastMonth = shiftDay(firstOfMonth, -1);
  return {
    last30: { from: shiftDay(today, -29), to: today },
    thisMonth: { from: firstOfMonth, to: today },
    lastMonth: {
      from: `${lastOfLastMonth.slice(0, 8)}01`,
      to: lastOfLastMonth,
    },
    thisYear: { from: `${today.slice(0, 4)}-01-01`, to: today },
  };
}

/** Whether a schedule that is paused was paused because its creator may no longer export. */
export function pausedForWantOfRight(schedule: ExportScheduleRecord): boolean {
  return (
    schedule.status === "paused" &&
    schedule.lastRunError === "requester_not_permitted"
  );
}
