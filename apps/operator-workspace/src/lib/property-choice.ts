/**
 * Which Property the Workspace works in, and where switching to another one
 * lands (OA-S3-05, OA-S3-07). Shared by the server, which resolves the choice,
 * and the switcher, which makes it — so both read it the same way.
 */

/**
 * The Property last chosen on this device. A cookie rather than a row: a
 * front-desk terminal belongs to a Property, not to whoever signs in at it, and
 * nothing needs to be migrated for a hint. It is only ever a hint — every
 * request checks it against what the viewer reaches, so a forged or stale one
 * falls back rather than widening anything.
 */
export const PROPERTY_COOKIE = "ranza_property";

const A_YEAR = 60 * 60 * 24 * 365;

/** Remembers `propertyId` on this device. Called by the switcher. */
export function rememberProperty(propertyId: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PROPERTY_COOKIE}=${encodeURIComponent(propertyId)}; Path=/; SameSite=Lax; Max-Age=${A_YEAR}${secure}`;
}

/**
 * The Property to show from `properties`.
 *
 * `?property=` always wins: one it names is shown, and one it names that is
 * not in `properties` — switched off, out of reach, forged — shows nothing
 * rather than another Property, so the page and the switcher above it never
 * disagree about where the viewer is working (HK-S1-24). With none named, the
 * Property remembered on this device, when it is still in `properties`; then
 * the first. A remembered Property the viewer no longer reaches is passed over
 * silently.
 */
export function chooseProperty<T extends { propertyId: string }>(
  properties: readonly T[],
  requested: string | undefined,
  remembered: string | undefined,
): T | undefined {
  if (requested) {
    return properties.find((candidate) => candidate.propertyId === requested);
  }
  return (
    properties.find((candidate) => candidate.propertyId === remembered) ??
    properties[0]
  );
}

/**
 * The Property a page with no `?property=` is working in — what the switcher
 * names and every rail link carries.
 *
 * Resolved against Today's Properties first, exactly as a bare Today resolves
 * it, because Today is where signing in lands and the two must name the same
 * Property (HK-S1-24): a remembered Property where Today is off is passed over
 * there. Against every switchable Property only for a viewer with Today
 * nowhere.
 */
export function workingProperty<
  T extends { propertyId: string },
  U extends { propertyId: string },
>(
  todayProperties: readonly T[],
  switchable: readonly U[],
  remembered: string | undefined,
): T | U | undefined {
  return (
    chooseProperty(todayProperties, undefined, remembered) ??
    chooseProperty(switchable, undefined, remembered)
  );
}

/**
 * The Organization the shell names: that of the Property `?property=` names,
 * when it is one the viewer can switch to, and otherwise `fallback` — the
 * working Property's. A Staff Member of two Organizations who is working in
 * the second one's Property must not see the first one's name above it.
 */
export function organizationFor(
  requested: string | null | undefined,
  organizations: Readonly<Record<string, string>>,
  fallback: string | undefined,
): string | undefined {
  return (requested ? organizations[requested] : undefined) ?? fallback;
}

/** A Property the switcher offers, and the destinations open to the viewer there. */
export interface SwitchableProperty {
  propertyId: string;
  propertyName: string;
  organizationName: string;
  /** Route segments, in rail order. */
  segments: readonly string[];
}

/**
 * Every Property the viewer can use at least one Workspace destination in —
 * the union across entitled capabilities and permission-gated screens — each
 * with the destinations open there, ordered as the rail orders them.
 * Deduplicated by Property; ordered by Organization, then Property.
 */
export function switchableProperties(
  destinations: readonly {
    segment: string;
    properties: readonly {
      propertyId: string;
      propertyName: string;
      organizationName: string;
    }[];
  }[],
): SwitchableProperty[] {
  const found = new Map<string, SwitchableProperty & { segments: string[] }>();
  for (const destination of destinations) {
    for (const property of destination.properties) {
      const entry = found.get(property.propertyId) ?? {
        propertyId: property.propertyId,
        propertyName: property.propertyName,
        organizationName: property.organizationName,
        segments: [],
      };
      if (!entry.segments.includes(destination.segment)) {
        entry.segments.push(destination.segment);
      }
      found.set(property.propertyId, entry);
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      a.organizationName.localeCompare(b.organizationName) ||
      a.propertyName.localeCompare(b.propertyName),
  );
}

/**
 * Where choosing a Property lands: the page being viewed when it is open
 * there, otherwise Today, otherwise the first destination open there. Only the
 * page's own segment — a detail beneath it belongs to the Property being left.
 */
export function switchTarget(
  current: string | undefined,
  segments: readonly string[],
): string | undefined {
  if (current && segments.includes(current)) return current;
  if (segments.includes("today")) return "today";
  return segments[0];
}
