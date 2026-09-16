import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import { messages } from "../../../messages";
import {
  entitledProperties,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { PropertySwitcher } from "./property-switcher";

/**
 * The authenticated shell: navigation, the Property switcher, and the gate that
 * sends a signed-out visitor to sign in.
 *
 * Navigation lists entitled capabilities only (blueprint 4.6). A capability the
 * Organization has not bought is absent, not disabled — locked upsells belong
 * in a separate Explore area and must not clutter operational navigation.
 * Hiding a control is never the boundary, though: the server and the database
 * deny it regardless of what this renders.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  await requireViewer(locale);

  const properties = await entitledProperties(TODAY_CAPABILITY);
  const todayHref = localizeHref(locale, "today");

  return (
    <AppShell
      context={
        <Suspense fallback={null}>
          <PropertySwitcher
            label={copy.propertySwitcher}
            options={properties.map((property) => ({
              href: `${todayHref}?property=${property.propertyId}`,
              id: property.propertyId,
              name: property.propertyName,
            }))}
          />
        </Suspense>
      }
      languageLabel={copy.languageLabel}
      localeLinks={supportedLocales.map((supported) => ({
        current: supported === locale,
        href: localizeHref(supported, "today"),
        label: supported.toUpperCase(),
        locale: supported,
      }))}
      navigation={
        properties.length > 0
          ? [{ current: true, href: todayHref, label: copy.today }]
          : []
      }
      productName={copy.productName}
      skipLabel={copy.skip}
    >
      {children}
    </AppShell>
  );
}
