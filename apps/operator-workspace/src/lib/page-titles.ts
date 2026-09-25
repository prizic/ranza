import { useTranslations } from "next-intl";
import { supportedLocales } from "@ranza/i18n";
import { ALL_SCREENS } from "./screens";

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
  /** False when the page opens with display type of its own, so the title is
      not set large twice. */
  display: boolean;
}

/** Today's heading is the weekday, set larger than any page title. */
const OWN_DISPLAY_TYPE = new Set(["today"]);

export function useWorkspacePageTitles(): PageTitle[] {
  const t = useTranslations();
  const nav = useTranslations("navigation");
  return [
    ...ALL_SCREENS.filter((screen) => !screen.children).map((screen) => ({
      prefix: `/${screen.segment}`,
      title: nav.has(screen.segment) ? nav(screen.segment) : screen.segment,
      display: !OWN_DISPLAY_TYPE.has(screen.segment),
    })),
    { prefix: "/security", title: t("security"), display: true },
  ];
}

/**
 * Strips the locale prefix so a route prefix never has to name the locale.
 *
 * Built from `supportedLocales` rather than spelled out, because the list it
 * used to repeat is the list a fourth language would be added to — and a prefix
 * this did not know about would leave every page under it with no bar at all.
 */
const LOCALE_PREFIX = new RegExp(`^/(${supportedLocales.join("|")})(?=/|$)`);

export function withoutLocale(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX, "");
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
