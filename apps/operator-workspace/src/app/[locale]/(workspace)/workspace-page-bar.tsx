"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppPageBar } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
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
  locale,
}: {
  action?: ReactNode;
  copy: Messages;
  locale: SupportedLocale;
}) {
  const pathname = usePathname();
  const match = pageTitleFor(pathname, workspacePageTitles(locale, copy));

  if (!match) return null;

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      {...(match.parent === undefined ? {} : { parent: match.parent })}
      title={match.title}
    />
  );
}
