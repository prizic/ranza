"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefPath, type NavLeaf } from "./nav";
import { cn } from "../lib/utils";

/**
 * The pages a person reaches, as a row of chips across the top of the frame —
 * for a role with few enough pages that a sidebar would be a column of mostly
 * empty space taken from the page.
 *
 * Links to routes, as the sidebar's entries are, so each page keeps its own
 * URL. Scrolls sideways when the row is wider than the room it has, and the
 * scrollbar is hidden because the chips are the affordance.
 */
export function NavChips({
  entries,
  label,
}: {
  entries: readonly NavLeaf[];
  /** Names the navigation landmark. Localized. */
  label: string;
}) {
  const pathname = usePathname();

  if (entries.length === 0) return null;

  return (
    <nav aria-label={label} className="min-w-0">
      <ul className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {entries.map(({ href, icon: Icon, label: entryLabel }) => {
          const path = hrefPath(href);
          const active = pathname === path || pathname.startsWith(`${path}/`);
          return (
            <li className="shrink-0" key={href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                href={href}
              >
                <Icon aria-hidden="true" className="size-4" />
                {entryLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
