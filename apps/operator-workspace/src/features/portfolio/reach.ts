/** The screens a portfolio figure leads to. */
export type PortfolioSegment =
  "arrivals" | "departures" | "maintenance" | "finance";

/**
 * For each screen a figure links to, the Properties where the viewer may open
 * it. Analytics sees a figure without holding the permission of the screen
 * behind it, so a link is offered only where that screen opens (audit
 * 2026-11-07, C-10).
 */
export type PortfolioReach = Readonly<
  Record<PortfolioSegment, readonly string[]>
>;
