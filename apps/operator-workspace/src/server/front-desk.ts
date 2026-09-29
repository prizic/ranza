import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { EntitledProperty } from "@ranza/core";
import { chooseProperty, PROPERTY_COOKIE } from "../lib/property-choice";

/** The Property remembered on this device, unchecked (OA-S3-05). */
export async function rememberedProperty(): Promise<string | undefined> {
  return (await cookies()).get(PROPERTY_COOKIE)?.value;
}

/** A page's query string as Next hands it over: every parameter, repeated or not. */
export type PageSearch = Readonly<
  Record<string, string | string[] | undefined>
>;

/**
 * Which Property a workspace page is showing — and, when its URL names none,
 * the same page again with the one it chose written into the URL.
 *
 * `properties` holds only the Properties where the viewer may use this page.
 * A `?property=` wins, and one naming none of them — switched off there, out
 * of reach, unknown or forged — shows nothing rather than another Property
 * (HK-S1-24). What a viewer cannot see stays indistinguishable from what does
 * not exist.
 *
 * With none named, the page chooses as it always has — the Property remembered
 * on this device if this page lists it, otherwise its first — and redirects to
 * `here` with that choice as `?property=`, keeping every other parameter. The
 * page's own list is the only thing that can say which Property it shows, and
 * the switcher and the rail above it read the URL, so writing the choice there
 * is what makes all three name one Property; resolved separately, a bare URL
 * could show one Property's page under another's name (OA-S3-02). It cannot
 * loop: it redirects only when `property` is absent or empty, and always to a
 * URL where it is neither.
 */
export async function frontDeskProperty(
  properties: readonly EntitledProperty[],
  search: PageSearch,
  here: string,
): Promise<EntitledProperty | undefined> {
  const requested = firstValue(search.property);
  if (requested) return chooseProperty(properties, requested, undefined);

  const chosen = chooseProperty(
    properties,
    undefined,
    await rememberedProperty(),
  );
  if (chosen) redirect(withProperty(here, search, chosen.propertyId));
  return undefined;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `here` with `search` as its query and `property` set, every other parameter kept. */
export function withProperty(
  here: string,
  search: PageSearch,
  propertyId: string,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "property" || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      query.append(key, one);
    }
  }
  query.set("property", propertyId);
  return `${here}?${query.toString()}`;
}
