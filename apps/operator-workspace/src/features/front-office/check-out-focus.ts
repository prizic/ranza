/**
 * Where a keyboard goes once a Guest has been checked out.
 *
 * The row that held the pressed button is gone by the time the check-out has
 * answered, and the focus trap of the dialog it was pressed in is gone with it,
 * so a keyboard is back at the top of a page whose whole point is the next
 * Guest. Check-in already moves on to the next row; this is the same for
 * check-out (ARRIVALS-18).
 *
 * Found by a data attribute on each row's check-out button, so this reaches
 * into a table another component draws without owning any of its state.
 */
const ATTRIBUTE = "data-check-out";

/** What a check-out button carries, so the one after it can be found. */
export function checkOutMarker(stayId: string): Record<string, string> {
  return { [ATTRIBUTE]: stayId };
}

/** The Stay whose check-out button is the next one below this row, if any. */
export function nextCheckOutAfter(button: HTMLElement | null): string | null {
  let row = button?.closest("tr")?.nextElementSibling ?? null;
  while (row) {
    const next = row.querySelector<HTMLElement>(`[${ATTRIBUTE}]`);
    if (next) return next.getAttribute(ATTRIBUTE);
    row = row.nextElementSibling;
  }
  return null;
}

/**
 * Focuses that Stay's check-out button once no dialog is open any more, which
 * is when the list has been read again and the pressed row has gone. Gives up
 * after two seconds: a list that never settled is not worth fighting for.
 */
export function focusCheckOutOf(stayId: string): void {
  let waited = 0;
  const settle = () => {
    if (document.querySelector('[role="dialog"]') && waited < 2_000) {
      waited += 50;
      setTimeout(settle, 50);
      return;
    }
    document.querySelector<HTMLElement>(`[${ATTRIBUTE}="${stayId}"]`)?.focus();
  };
  settle();
}
