import type { ReactNode } from "react";

export interface AppShellProps {
  children: ReactNode;
  languageLabel: string;
  localeLinks: readonly LocaleLink[];
  navigation: readonly NavigationItem[];
  productName: string;
  skipLabel: string;
  summary: string;
  title: string;
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
        <header className="page-intro">
          <h1>{title}</h1>
          <p>{summary}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
