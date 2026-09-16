import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import { messages } from "../../../messages";
import {
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { PropertyRack } from "./property-rack";
import { WorkspaceNav } from "./workspace-nav";

/**
 * The authenticated shell: chrome, the Property rack, and the gate that sends a
 * signed-out visitor to sign in.
 *
 * Navigation lists entitled capabilities only (blueprint 4.6) — a capability
 * the Organization has not bought is absent, not greyed out, and locked upsells
 * belong in a separate Explore area. Hiding a control is never the boundary
 * though: the server and the database deny it either way.
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
  const viewer = await requireViewer(locale);
  const properties = await entitledProperties(TODAY_CAPABILITY);
  const todayHref = localizeHref(locale, "today");

  // Asked separately, because they are separate gates. A Property can have
  // Today without the front desk — different Entitlement, different Property
  // capability — and navigation lists what was bought, not what exists.
  const frontDesk = await entitledProperties(FRONT_DESK_CAPABILITY);

  return (
    <AppShell
      account={viewer.email}
      // Account security is not an entitled capability — it belongs to the
      // person, not the Organization — so it is reached through the account
      // rather than added to navigation, which lists only what was bought.
      accountHref={localizeHref(locale, "security")}
      languageLabel={copy.languageLabel}
      localeLinks={supportedLocales.map((supported) => ({
        current: supported === locale,
        href: localizeHref(supported, "today"),
        label: supported.toUpperCase(),
        locale: supported,
      }))}
      navigation={
        properties.length > 0 ? [{ href: todayHref, label: copy.today }] : []
      }
      navigationSlot={
        <WorkspaceNav
          items={[
            ...(properties.length > 0
              ? [{ href: todayHref, label: copy.today, segment: "today" }]
              : []),
            ...(frontDesk.length > 0
              ? [
                  {
                    href: localizeHref(locale, "front-office"),
                    label: copy.frontOffice,
                    segment: "front-office",
                  },
                ]
              : []),
          ]}
          label={copy.productName}
        />
      }
      productName={copy.productName}
      rack={
        <Suspense fallback={null}>
          <PropertyRack
            label={copy.propertySwitcher}
            slots={properties.map((property) => ({
              href: `${todayHref}?property=${property.propertyId}`,
              id: property.propertyId,
              name: property.propertyName,
            }))}
          />
        </Suspense>
      }
      skipLabel={copy.skip}
    >
      {children}
    </AppShell>
  );
}
