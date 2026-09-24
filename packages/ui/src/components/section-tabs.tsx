"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefPath, isNavGroup, navGroupFor, type NavEntry } from "./nav";
import { cn } from "../lib/utils";

/**
 * The pages beside this one, taken from the rail's own category tree — so the
 * bar and the rail can never list a different set.
 *
 * Rendered in the page bar's empty end rather than as a strip above the
 * content, which cost a row on every page.
 *
 * They are links to routes, not tabs over one: each has its own URL, can be
 * bookmarked, and is what the rail's second level already offers. This is the
 * same navigation said twice, in the two places a reader looks.
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
    <nav aria-label={label} className="hidden gap-1 sm:flex">
      {group.children.map(({ href, label: child }) => {
        const active = pathname === hrefPath(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
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
