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
  "upcoming",
] as const;

export type ReservationTab = (typeof RESERVATION_TABS)[number];

type Placed = Pick<ReservationRow, "status" | "startsOn" | "endsOn">;

const NOT_ARRIVED = new Set(["requested", "confirmed"]);

/**
 * Whether a booking belongs to a tab, given the Property's business date.
 *
 * `arriving` is what Arrivals lists: not yet arrived, first night come and not
 * every night gone, so a late arrival is here and a booking whose nights all
 * passed unarrived is only under `all`, where it can be marked a no-show.
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
      return row.status === "checked_in" && row.endsOn === today;
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
