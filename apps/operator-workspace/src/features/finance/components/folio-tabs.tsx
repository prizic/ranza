"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import { FOLIO_TABS, type FolioTab } from "../derive";

/**
 * Which Folios the list holds: all of them, the ones owing something, the open
 * ones, the closed ones. Links to the same route with a different `?show=`,
 * because the narrowing is done by the database and a bookmark of "who owes
 * us" should stay that.
 */
export function FolioTabs({
  current,
  hrefs,
}: {
  current: FolioTab;
  hrefs: Readonly<Record<FolioTab, string>>;
}) {
  const f = useTranslations("finance");

  return (
    <nav
      aria-label={f("tabsLabel")}
      className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
    >
      {FOLIO_TABS.map((tab) => {
        const active = tab === current;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-sm",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={hrefs[tab]}
            key={tab}
            prefetch={false}
          >
            {f(`tabs.${tab}`)}
          </Link>
        );
      })}
    </nav>
  );
}
