import type { LucideIcon } from "lucide-react";

/**
 * The sidebar and rail navigation shapes.
 *
 * Icons are components, so a tree carrying them cannot cross the server/client
 * boundary — it has to be defined in a module the client imports. Each
 * application keeps its own in `src/lib/nav.ts` and filters it by the
 * capabilities the server said were entitled, which travel as plain strings.
 */
export interface NavLeaf {
  href: string;
  /** The short form or readable label for the navigation link. */
  label: string;
  icon: LucideIcon;
  section?: string | undefined;
  badge?: string | number | undefined;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
  section?: string | undefined;
  badge?: string | number | undefined;
}

export type NavEntry = NavLeaf | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup =>
  "children" in entry;

/**
 * The path of an href, without its query string.
 *
 * A host may carry state on its links — which Property is being worked in, say
 * — and a link is still the page it points at whatever it carries, so every
 * "is this the current page" question compares paths.
 */
export function hrefPath(href: string): string {
  const query = href.indexOf("?");
  return query === -1 ? href : href.slice(0, query);
}

/** The group a route sits in, so the rail can open itself where the reader is. */
export function navGroupFor(
  pathname: string,
  entries: readonly NavEntry[],
): NavGroup | null {
  return (
    entries
      .filter(isNavGroup)
      .find((group) =>
        group.children.some((c) => hrefPath(c.href) === pathname),
      ) ?? null
  );
}

/** A tile on a phone: a page, or the category that stands for several. */
export interface MobileNavItem extends NavLeaf {
  /**
   * Every page the tile stands for, so it reads as the current one on any of
   * them and not only on the first (audit 2026-11-07, D-08).
   */
  hrefs: readonly string[];
}

/**
 * One entry per tile on a phone, where there is no room to drill in: a category
 * stands for its first page rather than opening anything.
 */
export function toMobileNav(entries: readonly NavEntry[]): MobileNavItem[] {
  return entries.flatMap((entry): MobileNavItem[] => {
    if (!isNavGroup(entry)) return [{ ...entry, hrefs: [entry.href] }];
    const [first] = entry.children;
    return first
      ? [
          {
            href: first.href,
            hrefs: entry.children.map((child) => child.href),
            label: entry.label,
            icon: entry.icon,
            badge: entry.badge,
          },
        ]
      : [];
  });
}

/**
 * Every page as one flat row, for navigation with no room to nest: a category
 * is not a chip of its own, its pages are, each under its own name.
 */
export function toChips(entries: readonly NavEntry[]): NavLeaf[] {
  return entries.flatMap((entry) =>
    isNavGroup(entry) ? entry.children : [entry],
  );
}

export interface NavSection {
  id?: string | undefined;
  entries: NavEntry[];
}

/**
 * Groups entries by their optional `section` property, in first-seen order.
 * Entries without a section are grouped together under undefined id.
 */
export function groupNavEntries(entries: readonly NavEntry[]): NavSection[] {
  const sections: NavSection[] = [];
  const sectionMap = new Map<string | undefined, NavEntry[]>();

  for (const entry of entries) {
    const sec = entry.section;
    const existing = sectionMap.get(sec);
    if (existing) {
      existing.push(entry);
    } else {
      const list = [entry];
      sectionMap.set(sec, list);
      sections.push({ id: sec, entries: list });
    }
  }

  return sections;
}
