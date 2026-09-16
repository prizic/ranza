import "server-only";
import type { EntitledProperty } from "@ranza/core";

/**
 * Which Property a front desk screen is showing.
 *
 * Both screens answer this the same way, and answering it differently on one of
 * them would be a bug nobody notices until the Property switcher disagrees with
 * the list beneath it.
 *
 * A Property the viewer may not reach is simply absent from `properties`, so an
 * unknown or forged `?property=` falls back to the first one they can reach
 * rather than erroring — what a viewer cannot see should not be distinguishable
 * from what does not exist.
 */
export function frontDeskProperty(
  properties: readonly EntitledProperty[],
  search: { property?: string },
): EntitledProperty | undefined {
  return (
    properties.find((candidate) => candidate.propertyId === search.property) ??
    properties[0]
  );
}
