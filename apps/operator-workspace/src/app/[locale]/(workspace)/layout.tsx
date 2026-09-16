import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import {
  AccountMenu,
  AppShell,
  BrandMark,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@ranza/ui";
import { messages } from "../../../messages";
import {
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { PropertySwitcher } from "./property-switcher";
import { WorkspacePageBar } from "./workspace-page-bar";
import { WorkspaceBottomNav, WorkspaceRail } from "./workspace-rail";

/**
 * The authenticated shell: the rail, the page bar, and the gate that sends a
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

  // Plain strings, so the tree can be built on the client where its icons live.
  const entitled = [
    ...(properties.length > 0 ? [TODAY_CAPABILITY.capabilityKey] : []),
    ...(frontDesk.length > 0 ? [FRONT_DESK_CAPABILITY.capabilityKey] : []),
  ];

  const root = localizeHref(locale, "today");
  const [first] = properties;

  const account = (
    <AccountMenu email={viewer.email} label={copy.account} name={viewer.email}>
      <DropdownMenuItem asChild>
        {/* Account security is not an entitled capability — it belongs to the
            person, not the Organization — so it is reached through the account
            rather than added to the rail, which lists only what was bought. */}
        <a href={localizeHref(locale, "security")}>
          <ShieldCheck aria-hidden="true" className="size-4" />
          {copy.security}
        </a>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Language belongs to the person too, and it is set once and then never
          again — so it lives beside the account rather than costing three
          permanent controls in a bar that has real work to show. */}
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {copy.languageLabel}
      </DropdownMenuLabel>
      {supportedLocales.map((supported) => (
        <DropdownMenuItem asChild key={supported}>
          <a
            aria-current={supported === locale ? "true" : undefined}
            href={localizeHref(supported, "today")}
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
        <WorkspaceBottomNav
          copy={copy}
          entitled={entitled}
          label={copy.mainNavigation}
          locale={locale}
          root={root}
        />
      }
      pageBar={
        <WorkspacePageBar
          action={
            <div className="flex items-center gap-2">
              {first ? (
                <PropertySwitcher
                  label={copy.propertySwitcher}
                  organization={first.organizationName}
                  slots={properties.map((property) => ({
                    href: `${root}?property=${property.propertyId}`,
                    id: property.propertyId,
                    name: property.propertyName,
                  }))}
                />
              ) : null}
              {/* The rail is desktop-only, so on a phone the account rides in
                  the page bar rather than earning a second row of chrome. */}
              <div className="md:hidden">{account}</div>
            </div>
          }
          copy={copy}
          locale={locale}
        />
      }
      rail={
        <WorkspaceRail
          actions={account}
          brand={<BrandMark className="size-7 text-primary" />}
          copy={copy}
          entitled={entitled}
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
