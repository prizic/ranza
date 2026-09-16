import type { NavEntry } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { SCREENS } from "./screens";
import type { Messages } from "../messages";

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
 */

export function workspaceNav(
  locale: SupportedLocale,
  copy: Messages,
  entitled: readonly string[],
): NavEntry[] {
  return SCREENS.filter((screen) =>
    screen.children
      ? screen.children.some((child) => entitled.includes(child.capability))
      : entitled.includes(screen.capability),
  ).map((screen) =>
    screen.children
      ? {
          icon: screen.icon,
          label: copy.navigation[screen.segment] ?? screen.segment,
          children: screen.children
            .filter((child) => entitled.includes(child.capability))
            .map((child) => ({
              href: localizeHref(locale, child.segment),
              icon: child.icon,
              label: copy.navigation[child.segment] ?? child.segment,
            })),
        }
      : {
          href: localizeHref(locale, screen.segment),
          icon: screen.icon,
          label: copy.navigation[screen.segment] ?? screen.segment,
        },
  );
}
