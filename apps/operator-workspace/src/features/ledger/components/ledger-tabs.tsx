"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import { LEDGER_TABS, type LedgerTab } from "../query";

/**
 * Journal or Accounts. Links to the same route with a different `?tab=`, so a
 * bookmark of the chart stays the chart.
 */
export function LedgerTabs({
  current,
  hrefs,
}: {
  current: LedgerTab;
  hrefs: Readonly<Record<LedgerTab, string>>;
}) {
  const t = useTranslations("ledger");

  return (
    <nav
      aria-label={t("viewsLabel")}
      className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
    >
      {LEDGER_TABS.map((tab) => {
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
            {t(tab === "journal" ? "journalTab" : "accountsTab")}
          </Link>
        );
      })}
    </nav>
  );
}
