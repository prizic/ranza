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
 * capability keys the Organization is entitled to, as strings, and the tree is
 * filtered by those. Hiding is never the boundary — the server and the database
 * deny an unentitled route either way (blueprint 3.5) — but navigation lists
 * only what was bought (blueprint 4.6), and locked upsells belong in a separate
 * Explore area rather than greyed out here.
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
 * Carries the Property being worked in onto a link to another page.
 *
 * The selection lives in the query string, so a bare link drops it and the next
 * page falls back to the first Property the viewer reaches — a Property switch
 * nobody asked for. Only the switcher changes the Property, and it does so with
 * a full load, because ADR 0019 drops the client cache on a Property switch.
 *
 * A page reached with no `?property=` — Today, straight after signing in — is
 * working in the Property the switcher names by default, so a link from it
 * names that one too. Left bare, the next screen opened on the first Property
 * with its own capability, which need not be the one the switcher still showed
 * (HK-S1-24).
 */
export function useWithProperty(
  defaultProperty: string | undefined,
): (href: string) => string {
  const property = useSearchParams().get("property") || defaultProperty;
  return (href) =>
    property ? `${href}?property=${encodeURIComponent(property)}` : href;
}

export function useWorkspaceNav(
  locale: SupportedLocale,
  entitled: readonly string[],
  defaultProperty: string | undefined,
): NavEntry[] {
  const t = useTranslations("navigation");
  const withProperty = useWithProperty(defaultProperty);
  const label = (segment: string) => (t.has(segment) ? t(segment) : segment);
  return SCREENS.filter((screen) =>
    screen.children
      ? screen.children.some((child) => entitled.includes(child.capability))
      : entitled.includes(screen.capability),
  ).map((screen) =>
    screen.children
      ? {
          icon: screen.icon,
          label: label(screen.segment),
          section: screen.section,
          children: screen.children
            .filter((child) => entitled.includes(child.capability))
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
        },
  );
}
