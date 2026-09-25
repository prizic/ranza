"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppPageBar, navGroupFor, SectionTabs } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";
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
  defaultProperty,
  entitled,
  locale,
}: {
  action?: ReactNode;
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  entitled: readonly string[];
  locale: SupportedLocale;
}) {
  const pathname = usePathname();
  const titles = useWorkspacePageTitles();
  const entries = useWorkspaceNav(locale, entitled, defaultProperty);
  const t = useTranslations();
  const withProperty = useWithProperty(defaultProperty);
  const match = pageTitleFor(pathname, titles);

  if (!match) return null;

  // A nav group has no page of its own, so it is named without a link.
  const group = navGroupFor(pathname, entries);

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      breadcrumbLabel={t("breadcrumb")}
      crumbs={[
        {
          href: withProperty(localizeHref(locale, "today")),
          label: t("workspaceBadge"),
        },
        ...(group ? [{ label: group.label }] : []),
      ]}
      display={match.display}
      tabs={<SectionTabs entries={entries} label={t("sections")} />}
      title={match.title}
    />
  );
}
