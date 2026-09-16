import type { ReactNode } from "react";
import { BrandMark } from "./primitives";

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
   * A host that needs the distinction passes its own client component; one that
   * does not keeps setting `current` and ignores this.
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
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        {skipLabel}
      </a>

      <header className="site-header">
        <a className="brand" href={navigation[0]?.href ?? "/"}>
          <BrandMark />
          <span>{productName}</span>
        </a>

        {navigationSlot ??
          (navigation.length > 0 ? (
            <nav aria-label={productName} className="primary-nav">
              {navigation.map((item) => (
                <a
                  aria-current={item.current ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null)}

        <div className="header-end">
          <nav aria-label={languageLabel} className="locale-nav">
            {localeLinks.map((link) => (
              <a
                aria-current={link.current ? "true" : undefined}
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
              <a className="account" href={accountHref}>
                {account}
              </a>
            ) : (
              <span className="account">{account}</span>
            )
          ) : null}
        </div>
      </header>

      {rack}

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
