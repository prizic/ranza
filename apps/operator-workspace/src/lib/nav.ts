import { useSearchParams } from "next/navigation";
import type { NavEntry } from "@ranza/ui";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { SCREENS } from "./screens";

/**
 * The rail's tree, built from the blueprint 4.6 destination list.
 *
 * It lives in a module the client imports rather than arriving as a prop,
 * because every entry carries an icon component and a server component handing
 * one across the boundary is the "Only plain objects can be passed to Client
 * Components" error.
 *
 * Which entries a viewer sees is still the server's decision: it sends the
 * route segments the viewer can open somewhere they reach, as strings, and the
 * tree is filtered by those — and, once a Property is chosen, by the ones open
 * at that Property. Each destination's gate is the one its page asks
 * (`lib/screens.ts`), so a link the rail offers is a page that opens. Hiding is
 * never the boundary — the server and the database deny an unentitled route
 * either way (blueprint 3.5) — but navigation lists only what was bought
 * (blueprint 4.6), and locked upsells belong in a separate Explore area rather
 * than greyed out here.
 *
 * Labels are the short form. A tile is 56px and a long label spills out of it;
 * the full name lives in the page bar, where there is room.
 *
 * A hook rather than a function taking the catalogue: the segment names are
 * looked up by key, and `navigation` is the one map keyed on a route segment
 * rather than on a union, so a segment with no word for it still falls back to
 * the segment itself. `t.has` is what asks without raising.
 */

/**
 * The Property the URL names when the viewer can switch to it, and otherwise
 * `defaultProperty`. A `?property=` that names nothing the viewer reaches — a
 * stale bookmark, a Property they were unassigned from — is not carried to the
 * next page: the page that denied it says so, and every link away from it
 * should lead somewhere that opens (PORTFOLIO-03).
 */
function usePropertyInUse(
  defaultProperty: string | undefined,
  known: readonly string[] | undefined,
): string | undefined {
  const requested = useSearchParams().get("property");
  // Nothing known is nothing to check against, not "no Property is real".
  const unknown = known && known.length > 0 && !known.includes(requested ?? "");
  return requested && !unknown ? requested : defaultProperty;
}

/**
 * Carries the Property being worked in onto a link to another page.
 *
 * The selection lives in the query string, so a bare link drops it and the next
 * page falls back to the Property remembered on this device, or the first it
 * lists — a Property switch nobody asked for. Only the switcher changes the
 * Property, and it does so with a full load, because ADR 0019 drops the client
 * cache on a Property switch.
 *
 * A page that shows a Property writes it into its own URL before rendering
 * (`frontDeskProperty`, OA-S3-02), so a link from it carries that one. On a page
 * that shows none — Security, an unbuilt destination — links carry the
 * Property the switcher names by default, so the next page does not choose
 * another one on its own (HK-S1-24).
 */
export function useWithProperty(
  defaultProperty: string | undefined,
  known?: readonly string[],
): (href: string) => string {
  const property = usePropertyInUse(defaultProperty, known);
  return (href) =>
    property ? `${href}?property=${encodeURIComponent(property)}` : href;
}

export function useWorkspaceNav(
  locale: SupportedLocale,
  reachable: readonly string[],
  defaultProperty: string | undefined,
  segmentsByProperty: Readonly<Record<string, readonly string[]>> = {},
): NavEntry[] {
  const t = useTranslations("navigation");
  const soon = useTranslations()("plannedBadge");
  const known = Object.keys(segmentsByProperty);
  const property = usePropertyInUse(defaultProperty, known);
  const withProperty = useWithProperty(defaultProperty, known);
  const label = (segment: string) => (t.has(segment) ? t(segment) : segment);

  // At a Property the viewer can switch to, only what is open there: a rail
  // that offers a page the Property has switched off sends the person to a
  // refusal. All Properties is the Organization's and is open from anywhere.
  const openHere = property ? segmentsByProperty[property] : undefined;
  const open = (segment: string) =>
    openHere && segment !== "portfolio"
      ? openHere.includes(segment)
      : reachable.includes(segment);

  return SCREENS.filter((screen) =>
    screen.children
      ? screen.children.some((child) => open(child.segment))
      : open(screen.segment),
  ).map((screen) =>
    screen.children
      ? {
          icon: screen.icon,
          label: label(screen.segment),
          section: screen.section,
          children: screen.children
            .filter((child) => open(child.segment))
            .map((child) => ({
              href: withProperty(localizeHref(locale, child.segment)),
              icon: child.icon,
              label: label(child.segment),
            })),
        }
      : {
          href: withProperty(localizeHref(locale, screen.segment)),
          icon: screen.icon,
          label: label(screen.segment),
          section: screen.section,
          // Offered on purpose (ADR 0056) and marked, so nobody opens it
          // expecting a workflow (PORTAL-01).
          badge: screen.built ? undefined : soon,
        },
  );
}
