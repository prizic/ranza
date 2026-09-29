import "server-only";
import { cookies } from "next/headers";
import type { EntitledProperty } from "@ranza/core";
import { chooseProperty, PROPERTY_COOKIE } from "../lib/property-choice";

/** The Property remembered on this device, unchecked (OA-S3-05). */
export async function rememberedProperty(): Promise<string | undefined> {
  return (await cookies()).get(PROPERTY_COOKIE)?.value;
}

/**
 * Which Property a front desk screen is showing.
 *
 * Every front desk screen answers this the same way, and answering it
 * differently on one of them would be a bug nobody notices until the Property
 * switcher disagrees with the list beneath it.
 *
 * `properties` holds only the Properties where the viewer may use this screen's
 * capability. A `?property=` wins, and one naming none of them shows nothing
 * (HK-S1-24). With none named, the Property remembered on this device if it is
 * among them, and otherwise the first (`chooseProperty`). What a viewer cannot
 * see stays indistinguishable from what does not exist.
 */
export async function frontDeskProperty(
  properties: readonly EntitledProperty[],
  search: { property?: string | undefined },
): Promise<EntitledProperty | undefined> {
  return chooseProperty(
    properties,
    search.property,
    await rememberedProperty(),
  );
}
