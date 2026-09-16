import type { ReactNode } from "react";

export interface AppShellProps {
  children: ReactNode;
  /** Chrome that belongs to the shell rather than the page — a switcher, say. */
  context?: ReactNode;
  languageLabel: string;
  localeLinks: readonly LocaleLink[];
  navigation: readonly NavigationItem[];
  productName: string;
  skipLabel: string;
  /**
   * Page heading. Optional because a router layout renders the shell while the
   * page below it owns its own heading; omitting both leaves `children` to
   * supply the `<h1>`.
   */
  summary?: string;
  title?: string;
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

export function AppShell({
  children,
  context,
  languageLabel,
  localeLinks,
  navigation,
  productName,
  skipLabel,
  summary,
  title,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        {skipLabel}
      </a>
      <header className="site-header">
        <a className="brand" href={navigation[0]?.href ?? "/"}>
          <span aria-hidden="true" className="brand-mark">
            R
          </span>
          <span>{productName}</span>
        </a>
        {context}
        <nav aria-label={languageLabel} className="locale-nav">
          {localeLinks.map((link) => (
            <a
              aria-current={link.current ? "page" : undefined}
              href={link.href}
              hrefLang={link.locale}
              key={link.locale}
              lang={link.locale}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>
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
      <main className="main-content" id="main-content" tabIndex={-1}>
        {title ? (
          <header className="page-intro">
            <h1>{title}</h1>
            {summary ? <p>{summary}</p> : null}
          </header>
        ) : null}
        {children}
      </main>
    </div>
  );
}
