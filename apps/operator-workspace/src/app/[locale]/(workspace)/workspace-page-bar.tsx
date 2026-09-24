"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppPageBar, SectionTabs } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";
import { pageTitleFor, useWorkspacePageTitles } from "../../../lib/page-titles";

/**
 * Resolves the page's own title from the route.
 *
 * A client component because it reads the pathname, which a router layout
 * cannot. A route with no entry renders no bar and therefore no heading — see
 * lib/page-titles for why that is worth knowing about rather than guarding
 * against here.
 */
export function WorkspacePageBar({
  action,
  entitled,
  locale,
}: {
  action?: ReactNode;
  entitled: readonly string[];
  locale: SupportedLocale;
}) {
  const pathname = usePathname();
  const titles = useWorkspacePageTitles(locale);
  const entries = useWorkspaceNav(locale, entitled);
  const t = useTranslations();
  const withProperty = useWithProperty();
  const match = pageTitleFor(pathname, titles);

  if (!match) return null;

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      {...(match.parent === undefined
        ? {}
        : {
            parent: {
              ...match.parent,
              href: withProperty(match.parent.href),
            },
          })}
      tabs={<SectionTabs entries={entries} label={t("sections")} />}
      title={match.title}
    />
  );
}
