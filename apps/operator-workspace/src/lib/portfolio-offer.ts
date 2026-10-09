import type { CapabilityRef } from "@ranza/core";

/** What a Property's figures are gated by: the portfolio asks analytics per Property. */
export const PORTFOLIO_GATE: CapabilityRef = {
  moduleKey: "analytics",
  capabilityKey: "analytics",
};

/** The rail key of the portfolio destination: its entry in `screens.ts`, and no capability. */
export const PORTFOLIO_KEY = "portfolio";

interface Reach {
  propertyId: string;
  organizationId: string;
}

/**
 * Whether the rail offers All Properties.
 *
 * The portfolio is read for one Organization, so it is worth opening only
 * where a viewer reaches at least two Properties of the same one and has
 * analytics at one of them — without analytics every figure is withheld and
 * the page would be names alone. A viewer with one Property per Organization
 * is not offered it: there is nothing to line up (a Staff Member of two
 * Organizations holding one Property in each has no portfolio in either).
 *
 * Hiding is not the boundary; the read gates every Property again.
 */
export function offersPortfolio(
  reachable: readonly Reach[],
  withAnalytics: readonly Reach[],
): boolean {
  const reached = new Map<string, Set<string>>();
  for (const { organizationId, propertyId } of reachable) {
    const properties = reached.get(organizationId) ?? new Set<string>();
    properties.add(propertyId);
    reached.set(organizationId, properties);
  }
  return withAnalytics.some(
    ({ organizationId }) => (reached.get(organizationId)?.size ?? 0) > 1,
  );
}
