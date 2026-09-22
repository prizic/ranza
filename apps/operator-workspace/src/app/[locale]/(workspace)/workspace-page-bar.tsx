"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppPageBar, navGroupFor, SectionTabs } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { useWorkspaceNav } from "../../../lib/nav";
import { pageTitleFor, useWorkspacePageTitles } from "../../../lib/page-titles";

/**
 * Resolves the page's own title, and the trail above it, from the route.
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
  const titles = useWorkspacePageTitles();
  const entries = useWorkspaceNav(locale, entitled);
  const t = useTranslations();
  const match = pageTitleFor(pathname, titles);

  if (!match) return null;

  // A nav group has no page of its own, so it is named without a link.
  const group = navGroupFor(pathname, entries);

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      breadcrumbLabel={t("breadcrumb")}
      crumbs={[
        { href: localizeHref(locale, "today"), label: t("workspaceBadge") },
        ...(group ? [{ label: group.label }] : []),
      ]}
      display={match.display}
      tabs={<SectionTabs entries={entries} label={t("sections")} />}
      title={match.title}
    />
  );
}
