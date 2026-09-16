import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { BedDouble } from "lucide-react";
import {
  directionFor,
  isSupportedLocale,
  localizeHref,
  supportedLocales,
} from "@ranza/i18n";
import {
  AppShell,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ranza/ui";
import { messages } from "../../../messages";
import { requireViewer } from "../../../server/viewer";

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
  const stayHref = localizeHref(locale, "stay");

  return (
    <AppShell
      account={
        <div className="flex items-center gap-4">
          <nav
            aria-label={copy.languageLabel}
            className="flex items-center gap-1 text-step--1"
          >
            {supportedLocales.map((supported) => (
              <a
                aria-current={supported === locale ? "true" : undefined}
                className="rounded-sm px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground"
                href={localizeHref(supported, "stay")}
                hrefLang={supported}
                key={supported}
                lang={supported}
              >
                {supported.toUpperCase()}
              </a>
            ))}
          </nav>
          <span className="text-step--1 text-muted-foreground">
            {viewer.email}
          </span>
        </div>
      }
      navigation={
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive tooltip={copy.stay}>
                  <a aria-current="page" href={stayHref}>
                    <BedDouble aria-hidden="true" />
                    <span>{copy.stay}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
      productName={copy.productName}
      side={directionFor(locale) === "rtl" ? "right" : "left"}
      skipLabel={copy.skip}
      toggleLabel={copy.toggleNavigation}
    >
      {children}
    </AppShell>
  );
}
