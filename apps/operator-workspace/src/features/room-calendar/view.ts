/**
 * What the room calendar is showing, as one value.
 *
 * The URL holds all of it, so a link opens the same view (RC-S1-60). A cookie
 * remembers the parts worth keeping between visits — the length and the two
 * toggles — but never the start date or a search, which belong to the moment
 * (RC-S1-61). The URL always wins over the cookie.
 *
 * One object rather than a scatter of search parameters, so the Property
 * defaults of slice 2 become one more source of the same shape.
 */

export const ROOM_CALENDAR_COOKIE = "ranza-room-calendar";

export interface RoomCalendarView {
  /** `YYYY-MM-DD`, or null for the default window around today. */
  from: string | null;
  days: number;
  /** Null for every floor, `"none"` for Units with no floor, else the floor. */
  floor: string | null;
  showRequested: boolean;
  showDeparted: boolean;
  search: string;
  overlapsOnly: boolean;
  /** Rooms whose beds are folded into one row (RC-S1-40). */
  collapsed: string[];
}

/** The part of a view that is remembered in this browser. */
export interface RememberedView {
  days?: number;
  showRequested?: boolean;
  showDeparted?: boolean;
}

type Params = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FLOOR = /^(none|-?\d{1,3})$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A day that exists, in the range the read accepts — never a date that throws later. */
export function isCalendarDay(value: string | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  if (value < "1000-01-01" || value > "9998-12-31") return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function flag(value: string | undefined): boolean | undefined {
  if (value === "1") return true;
  if (value === "0") return false;
  return undefined;
}

/**
 * The cookie's value is `days.requested.departed` — `14.1.0` — rather than
 * JSON, so reading one that was tampered with or truncated is a failed match
 * and never an exception.
 */
const REMEMBERED = /^(\d{1,3})\.([01])\.([01])$/;

/** The remembered part, from the cookie's value; anything else is ignored. */
export function readRemembered(raw: string | undefined): RememberedView {
  const match = REMEMBERED.exec(raw ?? "");
  if (!match) return {};
  return {
    days: Number(match[1]),
    showRequested: match[2] === "1",
    showDeparted: match[3] === "1",
  };
}

export function rememberedCookie(view: RoomCalendarView): string {
  const value = [
    view.days,
    view.showRequested ? 1 : 0,
    view.showDeparted ? 1 : 0,
  ].join(".");
  return `${ROOM_CALENDAR_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The view from the URL, falling back to what this browser remembers and then
 * to the defaults. Each parameter is checked on its own, so one that is not
 * valid is dropped without discarding the rest (RC-S1-60).
 */
export function parseView(
  params: Params,
  remembered: RememberedView,
  lengths: readonly number[],
  defaultLength: number,
): RoomCalendarView {
  const allowed = (days: number | undefined) =>
    days !== undefined && lengths.includes(days) ? days : undefined;
  const from = first(params.from);
  const floor = first(params.floor);
  const collapsed = (first(params.collapsed) ?? "")
    .split(",")
    .filter((id) => UUID.test(id));
  return {
    from: isCalendarDay(from) ? from : null,
    days:
      allowed(Number(first(params.days))) ??
      allowed(remembered.days) ??
      defaultLength,
    floor: floor && FLOOR.test(floor) ? floor : null,
    showRequested:
      flag(first(params.requested)) ?? remembered.showRequested ?? true,
    showDeparted:
      flag(first(params.departed)) ?? remembered.showDeparted ?? true,
    search: (first(params.q) ?? "").slice(0, 100),
    overlapsOnly: first(params.overlaps) === "1",
    collapsed,
  };
}

/** The URL's query for a view, keeping the Property and dropping defaults. */
export function viewSearch(
  view: RoomCalendarView,
  propertyId: string,
  defaultLength: number,
): string {
  const params = new URLSearchParams({ property: propertyId });
  if (view.from) params.set("from", view.from);
  if (view.days !== defaultLength) params.set("days", String(view.days));
  if (view.floor) params.set("floor", view.floor);
  if (!view.showRequested) params.set("requested", "0");
  if (!view.showDeparted) params.set("departed", "0");
  if (view.search) params.set("q", view.search);
  if (view.overlapsOnly) params.set("overlaps", "1");
  if (view.collapsed.length > 0)
    params.set("collapsed", view.collapsed.join(","));
  return params.toString();
}
