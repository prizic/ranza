import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";

export interface AppShellProps {
  /** Who is signed in. Quiet on purpose — it answers a question, it is not a menu. */
  account?: string;
  /**
   * Where the signed-in person manages their own account. Optional because not
   * every host has such a page; when given, the account stops being a label and
   * becomes the way to reach it, which is the only route a settings page needs.
   */
  accountHref?: string;
  children: ReactNode;
  languageLabel: string;
  localeLinks: readonly LocaleLink[];
  /** Entitled capabilities only. A capability not bought is absent, not disabled. */
  navigation: readonly NavigationItem[];
  /**
   * Replaces the rendered navigation, while `navigation` still supplies the
   * brand's destination.
   *
   * Which item is current depends on the route, and a router layout cannot read
   * the pathname — the same reason `rack` is a slot. Deciding it here would mean
   * these primitives importing a router, and they stay renderable without one.
   */
  navigationSlot?: ReactNode;
  productName: string;
  /** The Property switcher. Rendered as the rack directly beneath the chrome. */
  rack?: ReactNode;
  skipLabel: string;
}

export interface NavigationItem {
  current?: boolean;
  href: string;
  label: string;
}

export interface LocaleLink {
  current?: boolean;
  href: string;
  label: string;
  locale: string;
}

/**
 * The authenticated chrome: petrol bar, the Property rack, and the work surface.
 *
 * The page below owns its own heading. A router layout cannot know what the page
 * is called, and inventing a title here would put the wrong `h1` on every route.
 *
 * Every inline direction here is logical — `ps`/`pe`, `start`/`end`, `border-s`
 * — so Arabic mirrors by construction rather than through a second stylesheet.
 */
export function AppShell({
  account,
  accountHref,
  children,
  languageLabel,
  localeLinks,
  navigation,
  navigationSlot,
  productName,
  rack,
  skipLabel,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-petrol focus:px-4 focus:py-2 focus:text-background"
        href="#main-content"
      >
        {skipLabel}
      </a>

      <header className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-petrol px-(--page) py-3 text-background">
        <a
          className="flex items-center gap-2 font-medium"
          href={navigation[0]?.href ?? "/"}
        >
          <BrandMark className="text-brass" />
          <span>{productName}</span>
        </a>

        {navigationSlot ??
          (navigation.length > 0 ? (
            <nav
              aria-label={productName}
              className="flex items-center gap-5 text-sm"
            >
              {navigation.map((item) => (
                <a
                  aria-current={item.current ? "page" : undefined}
                  className="border-b-2 border-transparent py-1 text-background/70 transition-colors hover:text-background aria-[current=page]:border-brass aria-[current=page]:text-background"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null)}

        <div className="ms-auto flex items-center gap-5">
          <nav
            aria-label={languageLabel}
            className="flex items-center gap-2 text-step--1"
          >
            {localeLinks.map((link) => (
              <a
                aria-current={link.current ? "true" : undefined}
                className="rounded-sm px-1 text-background/60 transition-colors hover:text-background aria-[current=true]:text-brass"
                href={link.href}
                hrefLang={link.locale}
                key={link.locale}
                lang={link.locale}
              >
                {link.label}
              </a>
            ))}
          </nav>
          {account ? (
            accountHref ? (
              <a
                className="text-step--1 text-background/70 underline-offset-4 transition-colors hover:text-background hover:underline"
                href={accountHref}
              >
                {account}
              </a>
            ) : (
              <span className="text-step--1 text-background/70">{account}</span>
            )
          ) : null}
        </div>
      </header>

      {rack}

      <main
        className="flex-1 px-(--page) py-8 focus:outline-none"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
