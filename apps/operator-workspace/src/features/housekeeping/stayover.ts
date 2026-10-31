import type { OperatingModel } from "@ranza/core";
import type { StayoverCadence } from "@ranza/housekeeping";
import { formatDate, formatWeekday, type SupportedLocale } from "@ranza/i18n";

/**
 * What a Property cleans on when it has said nothing (ADR 0063): the operating
 * model chooses a default and nothing else (ADR 0057). A hotel turns a staying
 * guest's room every day; a dormitory cleans a room its student lives in once a
 * week, on a Monday. Either is only where a Property starts: it can say never,
 * or any other interval, and a hotel that wants weekly gets exactly that.
 *
 * Lives here and not in the database, so no policy, trigger or function reads
 * the model.
 */
export function stayoverDefaultFor(
  model: OperatingModel | null,
): StayoverCadence {
  return model === "dormitory"
    ? { kind: "weekly", weekday: 1 }
    : { kind: "every_n_days", everyDays: 1 };
}

/**
 * A weekday's name in the reader's language. ISO numbering, Monday is 1; read
 * from a fixed Monday in UTC so no time zone can move it a day.
 */
export function weekdayName(weekday: number, locale: SupportedLocale): string {
  return formatWeekday(new Date(Date.UTC(2024, 0, weekday)), locale, "UTC");
}

/**
 * A business date the database sent as YYYY-MM-DD, as a short date in the
 * reader's language. Read in UTC: it is a calendar day, not an instant, and no
 * time zone may move it.
 */
export function dayName(isoDate: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${isoDate}T00:00:00Z`), locale, {
    year: undefined,
    timeZone: "UTC",
  });
}

/** The part of a cadence a person picks first. */
export type StayoverKind = "default" | StayoverCadence["kind"];

export function kindOf(cadence: StayoverCadence | null): StayoverKind {
  return cadence === null ? "default" : cadence.kind;
}
