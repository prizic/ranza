"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppPageBar, SectionTabs } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { workspaceNav } from "../../../lib/nav";
import { pageTitleFor, workspacePageTitles } from "../../../lib/page-titles";
import type { Messages } from "../../../messages";

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
  copy,
  entitled,
  locale,
}: {
  action?: ReactNode;
  copy: Messages;
  entitled: readonly string[];
  locale: SupportedLocale;
}) {
  const pathname = usePathname();
  const match = pageTitleFor(pathname, workspacePageTitles(locale, copy));

  if (!match) return null;

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      {...(match.parent === undefined ? {} : { parent: match.parent })}
      tabs={
        <SectionTabs
          entries={workspaceNav(locale, copy, entitled)}
          label={copy.sections}
        />
      }
      title={match.title}
    />
  );
}
