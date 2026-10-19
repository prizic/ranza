"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AppPageBar,
  BackButton,
  NavChips,
  navGroupFor,
  SectionTabs,
  toChips,
} from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";
import type { NavMode } from "../../../lib/nav-mode";
import {
  pageTitleFor,
  useWorkspacePageTitles,
  withoutLocale,
} from "../../../lib/page-titles";

const DETAIL_KEYS = ["record", "folio"] as const;

/**
 * Resolves the page's own title, the trail above it, and the way up from the route.
 *
 * A client component because it reads the pathname and query parameters, which
 * a router layout cannot. Renders a back button with proper routing on all
 * inner pages (any destination other than Today, or detail views like record/folio).
 */
export function WorkspacePageBar({
  action,
  brand,
  defaultProperty,
  locale,
  mode,
  reachable,
  segmentsByProperty,
}: {
  action?: ReactNode;
  /** The product's mark, where `mode` is "chips" and there is no sidebar to carry it. */
  brand?: ReactNode;
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  locale: SupportedLocale;
  /** Whether the pages are a sidebar's, or chips in this bar (`navModeFor`). */
  mode: NavMode;
  reachable: readonly string[];
  segmentsByProperty: Readonly<Record<string, readonly string[]>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const titles = useWorkspacePageTitles();
  const entries = useWorkspaceNav(
    locale,
    reachable,
    defaultProperty,
    segmentsByProperty,
  );
  const t = useTranslations();
  const withProperty = useWithProperty(
    defaultProperty,
    Object.keys(segmentsByProperty),
  );
  const match = pageTitleFor(pathname, titles);

  if (!match) return null;

  // A nav group has no page of its own, so it is named without a link.
  const group = navGroupFor(pathname, entries);

  const rootHref = withProperty(localizeHref(locale, "today"));
  const route = withoutLocale(pathname);
  const isToday = route === "/today" || route === "/";
  // A detail view's way up is its own list, with the rest of the query kept.
  const detailKey = DETAIL_KEYS.find((key) => searchParams.has(key));
  const isInnerPage = !isToday || detailKey !== undefined;

  let upHref = rootHref;
  if (detailKey) {
    const listParams = new URLSearchParams(searchParams.toString());
    listParams.delete(detailKey);
    const query = listParams.toString();
    upHref = query ? `${pathname}?${query}` : pathname;
  }

  const back = isInnerPage ? (
    <BackButton href={upHref} label={t("back")} />
  ) : undefined;

  const chips =
    mode === "chips" ? (
      <NavChips entries={toChips(entries)} label={t("mainNavigation")} />
    ) : undefined;

  return (
    <AppPageBar
      {...(action === undefined ? {} : { action })}
      back={back}
      {...(chips ? { chips, brand } : {})}
      breadcrumbLabel={t("breadcrumb")}
      crumbs={[
        {
          href: rootHref,
          label: t("workspaceBadge"),
        },
        ...(group ? [{ label: group.label }] : []),
      ]}
      display={match.display}
      tabs={
        chips ? undefined : (
          <SectionTabs entries={entries} label={t("sections")} />
        )
      }
      title={match.title}
    />
  );
}
