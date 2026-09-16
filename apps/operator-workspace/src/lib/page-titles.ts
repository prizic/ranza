import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { ALL_SCREENS } from "./screens";
import type { Messages } from "../messages";

/**
 * The bar that names the page, above every surface.
 *
 * Built from the same list the rail is, so a destination cannot exist in one
 * and not the other. In the dashboard this pattern came from, a page that was
 * in the rail but not in the titles list rendered with no bar at all — silently
 * — which is how a whole screen shipped without a heading.
 *
 * Routes here are locale-prefixed, so the locale is stripped before matching.
 */
export interface PageTitle {
  /** Locale-less route prefix, e.g. `/departures`. */
  prefix: string;
  title: string;
  /** A child page names its parent so the bar can carry the way back. */
  parent?: { href: string; title: string };
}

export function workspacePageTitles(
  locale: SupportedLocale,
  copy: Messages,
): PageTitle[] {
  return [
    ...ALL_SCREENS.filter((screen) => !screen.children).map((screen) => ({
      prefix: `/${screen.segment}`,
      title: copy.navigation[screen.segment] ?? screen.segment,
    })),
    {
      prefix: "/security",
      title: copy.security,
      parent: { href: localizeHref(locale, "today"), title: copy.productName },
    },
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
