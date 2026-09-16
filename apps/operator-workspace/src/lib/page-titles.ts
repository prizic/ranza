import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../messages";

/**
 * The bar that names the page, above every surface.
 *
 * Matching lives here rather than in the component so it can be held against
 * the rail. In the dashboard this pattern came from, a page that was in the
 * rail but not in this list rendered with no bar at all — silently — which is
 * how a whole screen shipped without a heading.
 *
 * Routes here are locale-prefixed, so the locale is stripped before matching
 * and every prefix is written without it.
 */
export interface PageTitle {
  /** Locale-less route prefix, e.g. `/front-office`. */
  prefix: string;
  title: string;
  /** A child page names its parent so the bar can carry the way back. */
  parent?: { href: string; title: string };
}

/** The first entry that fits wins, so a child route is listed before its parent. */
export function workspacePageTitles(
  locale: SupportedLocale,
  copy: Messages,
): PageTitle[] {
  return [
    { prefix: "/front-office", title: copy.frontOffice },
    {
      prefix: "/security",
      title: copy.security,
      parent: { href: localizeHref(locale, "today"), title: copy.productName },
    },
    { prefix: "/today", title: copy.today },
  ];
}

/** Strips `/tr`, `/en`, `/ar` so a prefix never has to name the locale. */
export function withoutLocale(pathname: string): string {
  const stripped = pathname.replace(/^\/(tr|en|ar)(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

export function pageTitleFor(
  pathname: string,
  titles: readonly PageTitle[],
): PageTitle | undefined {
  const route = withoutLocale(pathname);
  return titles.find(
    ({ prefix }) =>
      route === prefix || (prefix !== "/" && route.startsWith(`${prefix}/`)),
  );
}
