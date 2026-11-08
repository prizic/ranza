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
import type { SupportedLocale } from "@ranza/i18n";
import { useHome, useWorkspaceNav } from "../../../lib/nav";
import type { NavMode } from "../../../lib/nav-mode";
import {
  pageTitleFor,
  useWorkspacePageTitles,
  withoutLocale,
} from "../../../lib/page-titles";

const DETAIL_KEYS = ["record", "folio", "entry"] as const;

/**
 * Resolves the page's own title, the trail above it, and the way up from the route.
 *
 * A client component because it reads the pathname and query parameters, which
 * a router layout cannot. Renders a back button with proper routing on all
 * inner pages (any destination other than Today, or detail views like record/folio/entry).
 */
export function WorkspacePageBar({
  action,
  brand,
  defaultProperty,
  dormitoryIds,
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
  /** The Properties run as dormitories, whose pages are listed in their order. */
  dormitoryIds: readonly string[];
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
    dormitoryIds,
  );
  const t = useTranslations();
  const home = useHome(locale, defaultProperty, segmentsByProperty);
  // An address that is no page still gets the bar, and with it the way up
  // (ADR 0035): the not-found screen is drawn under it (SHELL-03).
  const match = pageTitleFor(pathname, titles) ?? {
    display: true,
    prefix: pathname,
    title: t("notFound.pageTitle"),
  };

  // A nav group has no page of its own, so it is named without a link.
  const group = navGroupFor(pathname, entries);

  // Today, or the page that stands in for it at a Property with Today switched
  // off: the root of the Property being worked in, and the one page with no way
  // up (audit 2026-11-07, D-01).
  const rootHref = home.href;
  const route = withoutLocale(pathname);
  const isRoot =
    route === `/${home.segment}` || (home.segment === "today" && route === "/");
  // A detail view's way up is its own list, with the rest of the query kept.
  const detailKey = DETAIL_KEYS.find((key) => searchParams.has(key));
  const isInnerPage = !isRoot || detailKey !== undefined;

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
