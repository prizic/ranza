/**
 * Guards a row's click handler against the click that closed an overlay on top
 * of it.
 *
 * Dismissing a menu, a dialog or a popover is a pointerdown while it is open
 * and a pointerup after it has closed — so the browser dispatches the resulting
 * click to whatever is underneath by then, which is the table row. In the
 * dashboard this was ported from, that meant deleting a record opened that
 * record's panel behind the confirm dialog, and dismissing a filter popover
 * opened whichever row it had been covering.
 *
 * A timestamp rather than event plumbing: the two sides are a portal apart and
 * share no tree, and the window only has to outlast one event loop.
 */
let closedAt = 0;

export function markOverlayClosed() {
  closedAt = Date.now();
}

export function overlayJustClosed() {
  return Date.now() - closedAt < 250;
}
