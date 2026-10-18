/**
 * What a front-desk command can answer when it did not do what was asked, and
 * the message for each (RANZ-54).
 *
 * A refusal says why and what to do next. The server knows the reason for every
 * booking or Stay the caller can read — already checked in, cancelled, not
 * theirs to change, the day closed — and tells it; only a booking the caller
 * cannot read is `refused`, one answer for out of reach and never existed,
 * because telling those apart would confirm that a row they cannot see is
 * there. `failed` is the answer when something broke that nobody expected: it
 * says nothing was changed, and the server records what it was.
 *
 * One list for every dialog and button that calls these commands, so Arrivals,
 * Departures, Reservations and Today cannot each invent their own wording.
 */
export const REFUSAL_MESSAGE = {
  refused: "refusalUnreachable",
  notPermitted: "refusalNotPermitted",
  alreadyCheckedIn: "refusalAlreadyCheckedIn",
  alreadyCheckedOut: "refusalAlreadyCheckedOut",
  withdrawn: "refusalWithdrawn",
  notConfirmed: "refusalNotConfirmed",
  nightsPassed: "refusalNightsPassed",
  notStarted: "refusalNotStarted",
  dayClosed: "refusalDayClosed",
  bookingMismatch: "refusalBookingMismatch",
  signedOut: "refusalSignedOut",
  failed: "refusalFailed",
} as const;

export type RefusalOutcome = keyof typeof REFUSAL_MESSAGE;

/** The message for a refusal outcome, or null for any other outcome. */
export function refusalMessage(
  outcome: string,
): (typeof REFUSAL_MESSAGE)[RefusalOutcome] | null {
  return outcome in REFUSAL_MESSAGE
    ? REFUSAL_MESSAGE[outcome as RefusalOutcome]
    : null;
}
