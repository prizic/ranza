import {
  DoorOpen,
  House,
  LogOut,
  ShieldCheck,
  Hotel,
  type LucideIcon,
} from "lucide-react";
import type { NavEntry } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../messages";

/**
 * The rail's tree, in two levels.
 *
 * It lives in a module the client imports rather than arriving as a prop,
 * because every entry carries an icon component and a server component handing
 * one across the boundary is the "Only plain objects can be passed to Client
 * Components" error.
 *
 * Which entries a viewer actually sees is still the server's decision: it sends
 * the capability keys the Organization is entitled to, as strings, and the tree
 * is filtered by those. Hiding is never the boundary — the server and the
 * database deny an unentitled route either way (blueprint 3.5) — but navigation
 * lists only what was bought (blueprint 4.6).
 *
 * Arrivals and departures sit under one category because they are one job seen
 * from two ends, and because the rail is 76px: a category names the question
 * being answered and its pages live one level in, where the rail can hold them
 * without getting longer. The same two pages appear in the page bar through
 * `SectionTabs`, which reads this tree, so the bar and the rail can never
 * disagree about what the section contains.
 *
 * Labels are the short form. A tile is 56px and a long label spills out of it;
 * the full name lives in the page bar, where there is room.
 */

/** Matches the capability keys `src/server/viewer.ts` gates on. */
export type WorkspaceCapability = "today" | "front_desk";

interface Leaf {
  icon: LucideIcon;
  label: (copy: Messages) => string;
  segment: string;
}

interface Entry {
  capability: WorkspaceCapability;
  icon: LucideIcon;
  label: (copy: Messages) => string;
  /** A destination of its own, or a category holding several. */
  segment?: string;
  children?: Leaf[];
}

const ENTRIES: Entry[] = [
  {
    capability: "today",
    icon: House,
    label: (copy) => copy.today,
    segment: "today",
  },
  {
    capability: "front_desk",
    icon: Hotel,
    label: (copy) => copy.frontOffice,
    children: [
      { icon: DoorOpen, label: (copy) => copy.arrivals, segment: "arrivals" },
      { icon: LogOut, label: (copy) => copy.departures, segment: "departures" },
    ],
  },
];

export function workspaceNav(
  locale: SupportedLocale,
  copy: Messages,
  entitled: readonly string[],
): NavEntry[] {
  return ENTRIES.filter((entry) => entitled.includes(entry.capability)).map(
    (entry) =>
      entry.children
        ? {
            icon: entry.icon,
            label: entry.label(copy),
            children: entry.children.map((child) => ({
              href: localizeHref(locale, child.segment),
              icon: child.icon,
              label: child.label(copy),
            })),
          }
        : {
            href: localizeHref(locale, entry.segment ?? ""),
            icon: entry.icon,
            label: entry.label(copy),
          },
  );
}

/**
 * Security is not in the rail. It belongs to the person rather than the
 * Organization, so it is reached through the account menu — which is also why
 * it is not gated by an Entitlement.
 */
export const SECURITY_ICON = ShieldCheck;
