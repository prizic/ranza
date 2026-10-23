/**
 * The week the rota shows, counted on the Property's calendar (HR-06).
 *
 * Every date here is a `YYYY-MM-DD` string and every sum is done in UTC, so the
 * answer cannot depend on the time zone of the machine doing it. The rota used
 * to take "now" from the browser, move to a local midnight and write it with
 * `toISOString()`: in a zone ahead of UTC the Monday column was keyed with
 * Sunday's date, a shift set on it was saved a day early, and the server's own
 * Monday-to-Sunday read left it out — so it appeared to vanish after the next
 * load. The Property's own today is already on the page; this starts there.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parse(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A calendar day moved by a number of days. */
export function addDays(day: string, days: number): string {
  const moved = parse(day);
  moved.setUTCDate(moved.getUTCDate() + days);
  return format(moved);
}

/** Whether a value is a real calendar day, so a typed address cannot roll over. */
export function isCalendarDay(value: string | undefined): value is string {
  return (
    value !== undefined && DAY.test(value) && format(parse(value)) === value
  );
}

/** The Monday of the week a day is in. */
export function mondayOf(day: string): string {
  const weekday = parse(day).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Monday to Sunday of the week containing `day`. */
export function weekOf(day: string): readonly string[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * The week to show: the one asked for when it is a real day, else the
 * Property's own. Anything is moved to its Monday, so a link to any day of a
 * week lands on that week.
 */
export function weekToShow(
  requested: string | undefined,
  today: string,
): readonly string[] {
  return weekOf(isCalendarDay(requested) ? requested : today);
}
