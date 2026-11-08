import "server-only";
import type { EntitledProperty } from "@ranza/core";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { gateOf } from "../lib/screens";
import { permittedProperties, screenProperties } from "./viewer";

/** Whether `propertyId` is among the Properties a gate or a permission opened. */
export function opensAt(
  properties: readonly Pick<EntitledProperty, "propertyId">[],
  propertyId: string,
): boolean {
  return properties.some((candidate) => candidate.propertyId === propertyId);
}

/**
 * Where each named screen is, for a link on this page: its address with
 * `?property=` already on it where the viewer may open that screen at this
 * Property, and null where they may not.
 *
 * A link to a screen the viewer cannot open ends in a refusal, which is worse
 * than no link (audit 2026-11-07, GATE). The answer is the rail's own, because
 * `gateOf` is what the rail and the destination page both ask; a template
 * string built by hand asks something weaker, and the two drift. Callers append
 * their own parameters with `&`.
 */
export async function screenLinks<Segment extends string>(
  locale: SupportedLocale,
  propertyId: string,
  segments: readonly Segment[],
): Promise<Readonly<Record<Segment, string | null>>> {
  const reached = await Promise.all(
    segments.map((segment) => screenProperties(gateOf(segment))),
  );
  return Object.fromEntries(
    segments.map((segment, index) => [
      segment,
      opensAt(reached[index] ?? [], propertyId)
        ? `${localizeHref(locale, segment)}?property=${propertyId}`
        : null,
    ]),
  ) as Record<Segment, string | null>;
}

/** Whether the viewer holds `permission` at this Property. */
export async function holdsAt(
  permission: string,
  propertyId: string,
): Promise<boolean> {
  return opensAt(await permittedProperties(permission), propertyId);
}
