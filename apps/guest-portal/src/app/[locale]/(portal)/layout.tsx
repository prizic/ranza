import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { AccountMenu, AppShell, AppPageBar, LanguageSwitcher } from "@ranza/ui";
import { brandStyle } from "../../../lib/brand-style";
import { ownStays, requireViewer, stayBrands } from "../../../server/viewer";
import { BrandLogo } from "./brand-logo";
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
 * Language is the flag at the end of the bar, as in the Workspace and in the
 * Leaders portal both are drawn after; the Portal has one page, so every
 * language's link is that page.
 *
 * It is the Workspace's shell, deliberately. A Resident who also works for the
 * Organization should not have to learn two products, and sharing the chrome is
 * what keeps that true as both grow.
 *
 * The frame carries the Organization's brand (ADR 0046): its colour as the two
 * theme tokens it overrides, set inline on the shell, and its logo in the bar.
 * Whose brand it is follows the Stay at the head of the page, which is the one
 * the Stay page leads with; each further Stay carries its own on its section.
 * The sign-in page is outside this layout, and stays Ranza's: the Organization
 * is not known before the viewer is.
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
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);
  const root = localizeHref(locale, "stay");

  const [stays, brands] = await Promise.all([ownStays(), stayBrands()]);
  const lead = stays[0];
  const brand = lead && brands.find((entry) => entry.stayId === lead.stayId);

  return (
    <AppShell
      style={brandStyle(brand)}
      bottomNav={
        <PortalBottomNav
          label={t("mainNavigation")}
          locale={locale}
          root={root}
        />
      }
      pageBar={
        <AppPageBar
          action={
            <>
              <LanguageSwitcher
                currentLocale={locale}
                hrefPattern="/{locale}/stay"
                label={t("languageLabel")}
              />
              <div aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
              <AccountMenu
                email={viewer.email}
                label={t("account")}
                locale={locale}
                name={viewer.name}
                variant="compact"
              />
            </>
          }
          brand={
            lead && brand?.logo ? (
              <BrandLogo
                alt={lead.propertyName}
                height={brand.logo.height}
                stayId={lead.stayId}
                version={brand.logo.hash}
                width={brand.logo.width}
              />
            ) : undefined
          }
          // The Stay opens with the Property's name in display type, so the
          // bar's own title stays small rather than set large above it.
          display={false}
          title={t("stay")}
        />
      }
      rail={
        <PortalRail
          actions={
            <AccountMenu
              email={viewer.email}
              label={t("account")}
              locale={locale}
              name={viewer.name}
            />
          }
          labels={{
            badge: t("portalBadge"),
            collapse: t("collapse"),
            expand: t("expand"),
            home: t("productName"),
            mainNavigation: t("mainNavigation"),
          }}
          locale={locale}
          root={root}
        />
      }
      skipLabel={t("skip")}
    >
      {children}
    </AppShell>
  );
}
