/**
 * The most pages a role may reach and still be offered them as chips across the
 * top (`NavChips`) rather than as a sidebar. Beyond it the row would scroll, and
 * a sidebar is built for that many; within it a sidebar is a column that takes
 * the width of the page to list a handful of links.
 *
 * Six is where the shipped Finance role (five pages) fits one row on a laptop
 * with room to spare; a Front desk Staff Member, with eleven, keeps the sidebar.
 */
export const TOP_NAV_MAX_PAGES = 6;

export type NavMode = "sidebar" | "chips";

/** How a role's pages are laid out, from the destinations it reaches. */
export function navModeFor(reachable: readonly string[]): NavMode {
  return reachable.length <= TOP_NAV_MAX_PAGES ? "chips" : "sidebar";
}
