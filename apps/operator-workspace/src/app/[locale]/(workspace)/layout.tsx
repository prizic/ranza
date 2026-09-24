import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { AccountMenu, AppShell, BrandMark, DropdownMenuItem } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { ALL_SCREENS } from "../../../lib/screens";
import {
  entitledProperties,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { QueryProvider } from "../../providers/query-provider";
import { PropertySwitcher } from "./property-switcher";
import { WorkspaceLanguageSwitcher } from "./workspace-language-switcher";
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

  const t = await getTranslations();
  const viewer = await requireViewer(locale);

  // Every destination is asked about separately, because each is a separate
  // gate: a Property can have Today without the front desk — different
  // Entitlement, different Property capability — and navigation lists what was
  // bought, not what exists (blueprint 4.6).
  //
  // In parallel, because they are independent reads and the shell waits for the
  // slowest. The unique capability keys are asked once each; two destinations
  // sharing one (arrivals and departures) do not cost two round trips.
  const capabilities = [
    ...new Map(
      ALL_SCREENS.map((screen) => [
        screen.capability,
        { capabilityKey: screen.capability, moduleKey: screen.module },
      ]),
    ).values(),
  ];
  const answers = await Promise.all(
    capabilities.map(async (capability) => ({
      key: capability.capabilityKey,
      reachable: await entitledProperties(capability),
    })),
  );

  // Plain strings, so the tree can be built on the client where its icons live.
  const entitled = answers
    .filter((answer) => answer.reachable.length > 0)
    .map((answer) => answer.key);

  const properties =
    answers.find((answer) => answer.key === TODAY_CAPABILITY.capabilityKey)
      ?.reachable ?? [];

  const root = localizeHref(locale, "today");
  const [first] = properties;

  const accountItems = (
    <DropdownMenuItem asChild>
      {/* Account security is not an entitled capability — it belongs to the
          person, not the Organization — so it is reached through the account
          rather than added to the rail, which lists only what was bought. */}
      <a href={localizeHref(locale, "security")}>
        <ShieldCheck aria-hidden="true" className="size-4" />
        {t("security")}
      </a>
    </DropdownMenuItem>
  );

  return (
    <AppShell
      bottomNav={
        <WorkspaceBottomNav
          entitled={entitled}
          label={t("mainNavigation")}
          locale={locale}
          root={root}
        />
      }
      pageBar={
        <WorkspacePageBar
          action={
            <>
              <div className="flex min-w-0 items-center gap-1">
                {first ? (
                  <PropertySwitcher
                    label={t("propertySwitcher")}
                    organization={first.organizationName}
                    slots={properties.map((property) => ({
                      href: `${root}?property=${property.propertyId}`,
                      id: property.propertyId,
                      name: property.propertyName,
                    }))}
                  />
                ) : null}
                <WorkspaceLanguageSwitcher
                  label={t("languageLabel")}
                  locale={locale}
                />
              </div>
              <div aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
              <AccountMenu
                email={viewer.email}
                label={t("account")}
                locale={locale}
                name={viewer.email}
                variant="compact"
              >
                {accountItems}
              </AccountMenu>
            </>
          }
          entitled={entitled}
          locale={locale}
        />
      }
      rail={
        <WorkspaceRail
          actions={
            <AccountMenu
              email={viewer.email}
              label={t("account")}
              locale={locale}
              name={viewer.email}
            >
              {accountItems}
            </AccountMenu>
          }
          brand={<BrandMark className="size-5" />}
          entitled={entitled}
          labels={{
            collapse: t("collapse"),
            expand: t("expand"),
            home: t("productName"),
            mainNavigation: t("mainNavigation"),
            badge: t("workspaceBadge"),
          }}
          locale={locale}
          {...(first ? { organization: first.organizationName } : {})}
          root={root}
        />
      }
      skipLabel={t("skip")}
    >
      {/* Here rather than in the root layout, so sign-in and every public page
          carry no tenant cache at all. Scoped to the viewer: a different Staff
          Member on the same browser drops everything held for the last one
          (ADR 0019). */}
      <QueryProvider scope={viewer.userId}>{children}</QueryProvider>
    </AppShell>
  );
}
