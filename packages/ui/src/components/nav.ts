import type { LucideIcon } from "lucide-react";

/**
 * The rail's shape.
 *
 * Icons are components, so a tree carrying them cannot cross the server/client
 * boundary — it has to be defined in a module the client imports. Each
 * application keeps its own in `src/lib/nav.ts` and filters it by the
 * capabilities the server said were entitled, which travel as plain strings.
 */
export interface NavLeaf {
  href: string;
  /** The short form. A tile is 56px and a long label spills out of it. */
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
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
