import type { ReservationRow } from "@ranza/reservations";

/**
 * The views the Reservations list is narrowed to, in the order a desk reaches
 * for them. `all` is what the list opens on, so nothing is hidden until somebody
 * asks for it to be.
 */
export const RESERVATION_TABS = [
  "all",
  "arriving",
  "inHouse",
  "departing",
  "overdue",
  "upcoming",
] as const;

export type ReservationTab = (typeof RESERVATION_TABS)[number];

type Placed = Pick<
  ReservationRow,
  "status" | "startsOn" | "endsOn" | "overdueDays"
>;

const NOT_ARRIVED = new Set(["requested", "confirmed"]);

/** Whole days from one `YYYY-MM-DD` date to another, counted in UTC. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * A booking whose every night has passed and whose Guest never arrived: nothing
 * on Arrivals lists it any more, and it still holds a place on the list until
 * somebody marks it a no-show or cancels it (RESERVATIONS-07).
 */
export function didNotArrive(
  row: Pick<ReservationRow, "status" | "endsOn">,
  today: string,
): boolean {
  return (
    NOT_ARRIVED.has(row.status) && row.endsOn !== null && row.endsOn <= today
  );
}

/**
 * Whether a booking belongs to a tab, given the Property's business date.
 *
 * `arriving` is what Arrivals lists: not yet arrived, first night come and not
 * every night gone, so a late arrival is here. `departing` is the Guests due
 * out today and nobody else. `overdue` is the two kinds of person the desk owes
 * an answer: a Guest still in the room past their departure (ADR 0033), and a
 * booking whose nights all passed with nobody arriving.
 */
export function inTab(
  row: Placed,
  tab: ReservationTab,
  today: string,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "inHouse":
      return row.status === "checked_in";
    case "departing":
      return (
        row.status === "checked_in" &&
        row.endsOn === today &&
        !(row.overdueDays > 0)
      );
    case "overdue":
      return (
        (row.status === "checked_in" && row.overdueDays > 0) ||
        didNotArrive(row, today)
      );
    case "arriving":
      return (
        NOT_ARRIVED.has(row.status) &&
        row.startsOn <= today &&
        (row.endsOn === null || row.endsOn > today)
      );
    case "upcoming":
      return NOT_ARRIVED.has(row.status) && row.startsOn > today;
  }
}

/**
 * How soon a row needs the desk, for the order the list opens in: arrivals
 * first, then whoever is overdue, then departures, the house, what is booked
 * ahead, and last whatever has ended. The list used to open on the oldest
 * booking, which was a never-arrived one and eight overdue stays, with the two
 * Guests arriving that day a tab away (RESERVATIONS-15).
 */
export function attentionRank(row: Placed, today: string): number {
  if (inTab(row, "arriving", today)) return 0;
  if (inTab(row, "overdue", today)) return 1;
  if (inTab(row, "departing", today)) return 2;
  if (row.status === "checked_in") return 3;
  if (inTab(row, "upcoming", today)) return 4;
  return 5;
}
