import type { Departure, DepartureView } from "@ranza/reservations";

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
