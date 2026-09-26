"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppPageBar, BackButton, navGroupFor, SectionTabs } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";
import {
  pageTitleFor,
  useWorkspacePageTitles,
  withoutLocale,
} from "../../../lib/page-titles";

/**
 * Resolves the page's own title, the trail above it, and back routing from the route.
 *
 * A client component because it reads the pathname and query parameters, which
 * a router layout cannot. Renders a back button with proper routing on all
 * inner pages (any destination other than Today, or detail views like record/folio).
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
  const searchParams = useSearchParams();
  const titles = useWorkspacePageTitles();
  const entries = useWorkspaceNav(locale, entitled, defaultProperty);
  const t = useTranslations();
  const withProperty = useWithProperty(defaultProperty);
  const match = pageTitleFor(pathname, titles);

  if (!match) return null;

  // A nav group has no page of its own, so it is named without a link.
  const group = navGroupFor(pathname, entries);

  const rootHref = withProperty(localizeHref(locale, "today"));
  const route = withoutLocale(pathname);
  const isToday = route === "/today" || route === "/";
  const hasDetailRecord = searchParams.has("record");
  const hasDetailFolio = searchParams.has("folio");
  const isInnerPage = !isToday || hasDetailRecord || hasDetailFolio;

  let fallbackHref = rootHref;
  if (hasDetailRecord) {
    const listParams = new URLSearchParams(searchParams.toString());
    listParams.delete("record");
    const query = listParams.toString();
    fallbackHref = query ? `${pathname}?${query}` : pathname;
  } else if (hasDetailFolio) {
    const listParams = new URLSearchParams(searchParams.toString());
    listParams.delete("folio");
    const query = listParams.toString();
    fallbackHref = query ? `${pathname}?${query}` : pathname;
  }

  const back = isInnerPage ? (
    <BackButton
      fallbackHref={fallbackHref}
      href={fallbackHref}
      label={t("back")}
    />
  ) : undefined;

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      back={back}
      breadcrumbLabel={t("breadcrumb")}
      crumbs={[
        {
          href: rootHref,
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
