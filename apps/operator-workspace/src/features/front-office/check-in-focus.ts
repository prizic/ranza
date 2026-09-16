/**
 * Where focus goes when a row replaces the control that was pressed.
 *
 * Withdrawing a check-in does not change a control's state — it removes it. The
 * Reservation becomes arrivable, the cell renders a check-in button where the
 * dialog's trigger was, and the button that was pressed is gone by the time the
 * action returns. A keyboard is then at the document, at the top of a page
 * whose whole point is doing the thing again for the Guest who should have been
 * checked in.
 *
 * The two components never share a position in the tree — one replaces the
 * other — so there is no state to lift and no ref that survives. What crosses
 * the gap is an intention, left here by the component going away and claimed by
 * the one that arrives.
 *
 * Module scope, deliberately: this is a browser, with one person and one focus,
 * and an intention nobody claims is dropped by the next render that does.
 */
const wanted = new Set<string>();

/** Says where focus should land once this Reservation's row comes back. */
export function focusCheckInFor(reservationId: string): void {
  wanted.add(reservationId);
}

/** Takes the intention, if there is one. Never leaves it for a later render. */
export function claimCheckInFocus(reservationId: string): boolean {
  return wanted.delete(reservationId);
}
