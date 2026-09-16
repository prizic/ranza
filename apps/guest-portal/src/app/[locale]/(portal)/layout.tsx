import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { Check } from "lucide-react";
import {
  AccountMenu,
  AppShell,
  AppPageBar,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@ranza/ui";
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
      {/* Language belongs to the person, and is set once and then never again —
          so it lives beside the account rather than costing a permanent control
          in the bar. */}
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {copy.languageLabel}
      </DropdownMenuLabel>
      {supportedLocales.map((supported) => (
        <DropdownMenuItem asChild key={supported}>
          <a
            aria-current={supported === locale ? "true" : undefined}
            href={localizeHref(supported, "stay")}
            hrefLang={supported}
            lang={supported}
          >
            <Check
              aria-hidden="true"
              className={
                supported === locale
                  ? "size-4 shrink-0"
                  : "size-4 shrink-0 invisible"
              }
            />
            {copy.languageName[supported]}
          </a>
        </DropdownMenuItem>
      ))}
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
