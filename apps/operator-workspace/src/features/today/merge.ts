import type { Section, TodaySummary } from "../../server/today-derive";

function carry<T>(
  previous: Section<T> | undefined,
  next: Section<T> | undefined,
): Section<T> | undefined {
  // Only a card the new answer still has, and has as unavailable, is carried:
  // a card the new answer leaves out has been taken away — a permission
  // withdrawn, a module switched off — and must not come back from memory.
  if (next?.status !== "unavailable") return next;
  // Carried once. A read that fails again is not a blip: the card then says
  // it could not be read and offers a retry, rather than holding figures
  // from the morning under a page that keeps refreshing (TD-S1-24).
  if (previous?.status !== "ok" || previous.stale) return next;
  return { status: "ok", data: previous.data, stale: true };
}

/** Whether any card on the page is showing a copy it could not refresh. */
export function hasStale(summary: TodaySummary): boolean {
  return [
    summary.arrivals,
    summary.departures,
    summary.occupancy,
    summary.rooms,
    summary.money,
  ].some((section) => section?.status === "ok" && section.stale === true);
}

/**
 * The newest summary, with the last good copy of any card whose read has just
 * failed kept on screen and marked stale (TD-S1-24, TD-S1-25).
 */
export function mergeSummary(
  previous: TodaySummary | undefined,
  next: TodaySummary,
): TodaySummary {
  // Never across a Property switch, and never across the cutoff: a card from
  // yesterday is not today's figure gone stale, it is the wrong day.
  if (
    !previous ||
    previous.day.propertyId !== next.day.propertyId ||
    previous.day.businessDate !== next.day.businessDate
  ) {
    return next;
  }
  const { arrivals, departures, occupancy, rooms, money, ...rest } = next;
  const cards = {
    arrivals: carry(previous.arrivals, arrivals),
    departures: carry(previous.departures, departures),
    occupancy: carry(previous.occupancy, occupancy),
    rooms: carry(previous.rooms, rooms),
    money: carry(previous.money, money),
  };
  return {
    ...rest,
    ...(cards.arrivals ? { arrivals: cards.arrivals } : {}),
    ...(cards.departures ? { departures: cards.departures } : {}),
    ...(cards.occupancy ? { occupancy: cards.occupancy } : {}),
    ...(cards.rooms ? { rooms: cards.rooms } : {}),
    ...(cards.money ? { money: cards.money } : {}),
  };
}
