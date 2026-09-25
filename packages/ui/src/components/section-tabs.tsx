"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefPath, isNavGroup, navGroupFor, type NavEntry } from "./nav";
import { cn } from "../lib/utils";

/**
 * The pages beside this one, taken from the rail's own category tree — so the
 * bar and the rail can never list a different set.
 *
 * Only where the rail is not: from `md` the rail's second level lists the same
 * pages. Below it the dock at the foot opens a section on its first page, so
 * without this strip a phone could not reach the others at all. Drawn as the
 * Leaders tab list — a muted track with the current page lifted out in white —
 * and scrolled sideways when a phone is narrower than the section.
 *
 * They are links to routes, not tabs over one: each has its own URL, can be
 * bookmarked, and is what the rail's second level already offers.
 */
export function SectionTabs({
  entries,
  label,
}: {
  entries: readonly NavEntry[];
  /** Names the landmark. Localized. */
  label: string;
}) {
  const pathname = usePathname();
  const group = navGroupFor(pathname, entries);

  // One page on its own is not a section worth naming.
  if (!group || group.children.length < 2) return null;

  return (
    <nav
      aria-label={label}
      className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-md bg-muted p-1 scrollbar-none md:hidden"
    >
      {group.children.map(({ href, label: child }) => {
        const active = pathname === hrefPath(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-9 shrink-0 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-all",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={href}
            key={href}
          >
            {child}
          </Link>
        );
      })}
    </nav>
  );
}

/** The group a route belongs to, for a host resolving its page title. */
export { isNavGroup, navGroupFor };
