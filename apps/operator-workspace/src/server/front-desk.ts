import "server-only";
import type { EntitledProperty } from "@ranza/core";

/**
 * Which Property a front desk screen is showing.
 *
 * Every front desk screen answers this the same way, and answering it
 * differently on one of them would be a bug nobody notices until the Property
 * switcher disagrees with the list beneath it.
 *
 * `properties` holds only the Properties where the viewer may use this screen's
 * capability. With no `?property=`, the screen opens on the first of them. A
 * `?property=` that names none of them — switched off there, out of reach,
 * unknown or forged — shows nothing rather than another Property: the page
 * bar's switcher reads the same parameter and would name the Property the URL
 * asked for above another one's rooms (HK-S1-24). All of those look alike, so
 * what a viewer cannot see stays indistinguishable from what does not exist.
 */
export function frontDeskProperty(
  properties: readonly EntitledProperty[],
  search: { property?: string },
): EntitledProperty | undefined {
  if (!search.property) return properties[0];
  return properties.find(
    (candidate) => candidate.propertyId === search.property,
  );
}
