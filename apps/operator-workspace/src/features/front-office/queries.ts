import type { Departure, DepartureView } from "@ranza/reservations";
import type { ArrivalRow } from "../../server/viewer";

/**
 * The departures list, read the way the Departures screen reads it.
 *
 * Shared with Today, which offers check-out from a row and needs the same
 * Departure the dialog there is given (TD-S2-02): the bill under review is the
 * one the desk would see on the Departures screen, not a copy Today derived.
 */
export async function fetchDepartures(
  propertyId: string,
  view: DepartureView,
): Promise<readonly Departure[]> {
  const response = await fetch(
    `/api/front-office/departures?property=${encodeURIComponent(propertyId)}&view=${view}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw Object.assign(new Error("departures could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as {
    departures: readonly Departure[];
  };
  return body.departures;
}

/**
 * Today's arrivals, read the way the Arrivals screen reads them; shared with
 * the room calendar's drawer, whose Check in is that screen's (RC-S5-03).
 */
export async function fetchArrivals(
  propertyId: string,
): Promise<readonly ArrivalRow[]> {
  const response = await fetch(
    `/api/front-office/arrivals?property=${encodeURIComponent(propertyId)}`,
    // The cache that matters is this one. Letting the browser serve a stale
    // copy would make the poll interval a suggestion.
    { cache: "no-store" },
  );
  if (!response.ok) {
    // Carries the status so the retry policy can tell "try again" from "no".
    throw Object.assign(new Error("arrivals could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { arrivals: readonly ArrivalRow[] };
  return body.arrivals;
}
