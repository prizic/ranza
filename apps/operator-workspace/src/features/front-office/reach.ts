/**
 * Which of the pages a front-desk row links to the viewer can open at this
 * Property. A menu item that leads to a refusal is worse than no item
 * (ARRIVALS-15), and the pages are gated by the same answer the rail uses.
 */
export interface FrontDeskReach {
  rooms: boolean;
  folio: boolean;
  housekeeping: boolean;
  reservations: boolean;
}

/** For a screen that has not asked: every link is offered, as it was. */
export const REACHES_EVERYTHING: FrontDeskReach = {
  rooms: true,
  folio: true,
  housekeeping: true,
  reservations: true,
};
