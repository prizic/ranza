import type { ReactNode } from "react";
import { BrandMark } from "./primitives";

export interface AppShellProps {
  /** Who is signed in. Quiet on purpose — it answers a question, it is not a menu. */
  account?: string;
  children: ReactNode;
  languageLabel: string;
  localeLinks: readonly LocaleLink[];
  /** Entitled capabilities only. A capability not bought is absent, not disabled. */
  navigation: readonly NavigationItem[];
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
  children,
  languageLabel,
  localeLinks,
  navigation,
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

        {navigation.length > 0 ? (
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
        ) : null}

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
          {account ? <span className="account">{account}</span> : null}
        </div>
      </header>

      {rack}

      <main className="main-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
