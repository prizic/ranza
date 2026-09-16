import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { AccountMenu, AppShell, AppPageBar } from "@ranza/ui";
import { messages } from "../../../messages";
import { requireViewer } from "../../../server/viewer";
import { PortalBottomNav, PortalRail } from "./portal-rail";

/**
 * The authenticated shell, and the gate that sends a signed-out visitor to sign
 * in.
 *
 * Navigation has one destination, which is the Portal's entire information
 * architecture for now. Blueprint 4.3 lists further capabilities — service
 * requests, announcements, meal choices, attendance — and none of them are
 * built, so none of them appear. A capability that is not entitled is absent
 * rather than disabled, and one that does not exist yet is absent for the same
 * reason.
 *
 * It is the Workspace's shell, deliberately. A Resident who also works for the
 * Organization should not have to learn two products, and sharing the chrome is
 * what keeps that true as both grow.
 */
export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  const viewer = await requireViewer(locale);
  const root = localizeHref(locale, "stay");

  const account = (
    <AccountMenu email={viewer.email} label={copy.account} name={viewer.email}>
      <nav
        aria-label={copy.languageLabel}
        className="flex items-center gap-1 px-2 py-1.5 text-step--1"
      >
        {supportedLocales.map((supported) => (
          <a
            aria-current={supported === locale ? "true" : undefined}
            className="rounded-sm px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-secondary aria-[current=true]:text-foreground"
            href={localizeHref(supported, "stay")}
            hrefLang={supported}
            key={supported}
            lang={supported}
          >
            {supported.toUpperCase()}
          </a>
        ))}
      </nav>
    </AccountMenu>
  );

  return (
    <AppShell
      bottomNav={
        <PortalBottomNav
          copy={copy}
          label={copy.mainNavigation}
          locale={locale}
          root={root}
        />
      }
      pageBar={
        <AppPageBar
          action={<div className="md:hidden">{account}</div>}
          title={copy.stay}
        />
      }
      rail={
        <PortalRail
          actions={account}
          copy={copy}
          labels={{
            back: copy.back,
            home: copy.productName,
            mainNavigation: copy.mainNavigation,
          }}
          locale={locale}
          root={root}
        />
      }
      skipLabel={copy.skip}
    >
      {children}
    </AppShell>
  );
}
