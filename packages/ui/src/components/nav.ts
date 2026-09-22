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

/** The group a route sits in, so the rail can open itself where the reader is. */
export function navGroupFor(
  pathname: string,
  entries: readonly NavEntry[],
): NavGroup | null {
  return (
    entries
      .filter(isNavGroup)
      .find((group) => group.children.some((c) => c.href === pathname)) ?? null
  );
}

/**
 * One entry per tile on a phone, where there is no room to drill in: a category
 * stands for its first page rather than opening anything.
 */
export function toMobileNav(entries: readonly NavEntry[]): NavLeaf[] {
  return entries.flatMap((entry) => {
    if (!isNavGroup(entry)) return [entry];
    const [first] = entry.children;
    return first
      ? [{ href: first.href, label: entry.label, icon: entry.icon }]
      : [];
  });
}

export interface NavSection {
  id?: string | undefined;
  label?: string | undefined;
  entries: NavEntry[];
}

/**
 * Groups entries by their optional `section` property.
 * Entries without a section are grouped together under undefined id.
 */
export function groupNavEntries(
  entries: readonly NavEntry[],
  sectionLabels?: Record<string, string>,
): NavSection[] {
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
      sections.push({
        id: sec,
        label: sec && sectionLabels ? (sectionLabels[sec] ?? sec) : sec,
        entries: list,
      });
    }
  }

  return sections;
}
