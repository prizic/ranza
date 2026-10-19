import type { FolioLine, FolioSummary } from "@ranza/folios";
import { overdueDays } from "../today/views";

/**
 * What the Finance screen says about a Folio beyond its lines, derived from the
 * read and never from a second one.
 */

/** The lists the Finance screen offers, in the order its tabs read. */
export const FOLIO_TABS = ["all", "owing", "open", "closed"] as const;
export type FolioTab = (typeof FOLIO_TABS)[number];

/**
 * The tab a `?show=` names. `open` is what Today's card links to, so it keeps
 * its meaning; anything else is the whole list.
 */
export function parseFolioTab(raw: string | undefined): FolioTab {
  return raw === "owing" || raw === "open" || raw === "closed" ? raw : "all";
}

/** Whole days an in-house Guest is past their planned departure; 0 otherwise. */
export function folioOverdueDays(
  folio: Pick<FolioSummary, "stayInHouse" | "endsOn" | "today">,
): number {
  return folio.stayInHouse ? overdueDays(folio.endsOn, folio.today) : 0;
}

/**
 * What a Guest's open Folio can say about the nights still to come onto it.
 *
 * A zero balance because nothing has been charged yet is not a settled bill,
 * and the Folio must not read like one (FIN-09, RANZ-51 rule 1). Nights post
 * when each business day closes and at check-out (ADR 0038), so an in-house
 * Guest's Folio is always short of what the stay will come to.
 *
 * - `unpriced`: the booking has no price, so no night will ever be charged.
 * - `none_yet`: priced, and no night has been charged.
 * - `so_far`: some nights are on the bill and later ones post as above.
 * - `null`: nothing to say — closed, not in house, or a Resident billed
 *   monthly rather than by the night.
 */
export type NightsNote = "unpriced" | "none_yet" | "so_far";

export function nightsNote(
  folio: Pick<
    FolioSummary,
    | "status"
    | "stayInHouse"
    | "stayType"
    | "nightlyRateMinor"
    | "roomNightLines"
  >,
): NightsNote | null {
  if (folio.status !== "open" || !folio.stayInHouse) return null;
  if (folio.stayType !== "guest") return null;
  if (folio.nightlyRateMinor === null) return "unpriced";
  return folio.roomNightLines === 0 ? "none_yet" : "so_far";
}

/**
 * The line a correction cancels, found on the same Folio, so a reader sees what
 * was taken off and why (FIN-07).
 */
export function cancelledLine(
  line: Pick<FolioLine, "lineType" | "reversesLineId">,
  lines: readonly FolioLine[],
): FolioLine | null {
  if (line.lineType !== "reversal" || line.reversesLineId === null) return null;
  return lines.find((other) => other.lineId === line.reversesLineId) ?? null;
}
