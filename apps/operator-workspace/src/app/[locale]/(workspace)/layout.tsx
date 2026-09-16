import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import {
  directionFor,
  isSupportedLocale,
  localizeHref,
  supportedLocales,
} from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import { messages } from "../../../messages";
import {
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { PropertySwitcher } from "./property-switcher";
import { WorkspaceNav, type NavItem } from "./workspace-nav";

/**
 * The authenticated shell: the rail, the top bar, and the gate that sends a
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

  // Asked separately, because they are separate gates. A Property can have
  // Today without the front desk — different Entitlement, different Property
  // capability — and navigation lists what was bought, not what exists.
  const properties = await entitledProperties(TODAY_CAPABILITY);
  const frontDesk = await entitledProperties(FRONT_DESK_CAPABILITY);
  const todayHref = localizeHref(locale, "today");

  const navigation: NavItem[] = [
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
  ];

  const [first] = properties;

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
                href={localizeHref(supported, "today")}
                hrefLang={supported}
                key={supported}
                lang={supported}
              >
                {supported.toUpperCase()}
              </a>
            ))}
          </nav>
          {/* Account security is not an entitled capability — it belongs to the
              person, not the Organization — so it is reached through the
              account rather than added to navigation, which lists only what was
              bought. */}
          <a
            className="flex items-center gap-1.5 text-step--1 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            href={localizeHref(locale, "security")}
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            {viewer.email}
          </a>
        </div>
      }
      navigation={<WorkspaceNav items={navigation} />}
      productName={copy.productName}
      scope={
        first ? (
          <PropertySwitcher
            label={copy.propertySwitcher}
            organization={first.organizationName}
            slots={properties.map((property) => ({
              href: `${todayHref}?property=${property.propertyId}`,
              id: property.propertyId,
              name: property.propertyName,
            }))}
          />
        ) : null
      }
      // The rail mirrors to the other edge in Arabic. Logical CSS cannot do
      // this one: the offcanvas transition and the collapse rail are physical.
      side={directionFor(locale) === "rtl" ? "right" : "left"}
      skipLabel={copy.skip}
      toggleLabel={copy.toggleNavigation}
    >
      {children}
    </AppShell>
  );
}
