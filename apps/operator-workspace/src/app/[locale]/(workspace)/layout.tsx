import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { AccountMenu, AppShell, BrandMark, DropdownMenuItem } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ALL_SCREENS } from "../../../lib/screens";
import {
  switchableProperties,
  workingProperty,
} from "../../../lib/property-choice";
import { rememberedProperty } from "../../../server/front-desk";
import {
  billingNotices,
  entitledPropertiesByCapability,
  permittedProperties,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { QueryProvider } from "../../providers/query-provider";
import { BillingNotice } from "./billing-notice";
import { PropertyLink } from "./property-link";
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
 *
 * It renders on a full load and not again as the rail moves between pages —
 * those are client navigations that render only the page beneath. So each page
 * checks the session for itself (`requireViewer`), and the rail shows what was
 * entitled when the workspace was opened; a capability withdrawn since stays
 * listed until the next full load, and its page answers with the empty state.
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
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);

  // Every destination is asked about separately, because each is a separate
  // gate: a Property can have Today without the front desk — different
  // Entitlement, different Property capability — and navigation lists what was
  // bought, not what exists (blueprint 4.6).
  //
  // All in one read rather than one per destination: a transaction each was a
  // connection each, and a full page load asked for more at once than the pool
  // holds. The unique capabilities are asked once each; two destinations
  // sharing one (arrivals and departures) do not cost two answers.
  //
  // A destination gated by a permission is asked about that instead — the
  // audit log, which no package selection may remove (ADR 0031) — alongside
  // the capability read rather than after it.
  const capabilities = [
    ...new Map(
      ALL_SCREENS.filter((screen) => !screen.permission).map((screen) => [
        `${screen.module}:${screen.capability}`,
        { capabilityKey: screen.capability, moduleKey: screen.module },
      ]),
    ).values(),
  ];
  const permitted = ALL_SCREENS.flatMap((screen) =>
    screen.permission
      ? [{ key: screen.capability, permission: screen.permission }]
      : [],
  );
  const [byCapability, byPermission, overdue] = await Promise.all([
    entitledPropertiesByCapability(capabilities),
    Promise.all(
      permitted.map(async (screen) => ({
        key: screen.key,
        reachable: await permittedProperties(screen.permission),
      })),
    ),
    billingNotices(),
  ]);

  // Plain strings, so the tree can be built on the client where its icons live.
  const entitled = [
    ...byCapability
      .filter((answer) => answer.properties.length > 0)
      .map((answer) => answer.capability.capabilityKey),
    ...byPermission
      .filter((answer) => answer.reachable.length > 0)
      .map((answer) => answer.key),
  ];

  // The switcher lists every Property the viewer can use at least one
  // destination in, not only Today's (OA-S3-07): a Staff Member who reaches
  // Housekeeping at a Property where Today is off could otherwise never choose
  // it. Each carries the destinations open there, so choosing it can keep the
  // page being viewed.
  const switchable = switchableProperties(
    ALL_SCREENS.filter((screen) => !screen.children).map((screen) => ({
      segment: screen.segment,
      properties: screen.permission
        ? (byPermission.find((answer) => answer.key === screen.capability)
            ?.reachable ?? [])
        : (byCapability.find(
            (answer) =>
              answer.capability.moduleKey === screen.module &&
              answer.capability.capabilityKey === screen.capability,
          )?.properties ?? []),
    })),
  );
  const todayProperties =
    byCapability.find(
      (answer) =>
        answer.capability.moduleKey === TODAY_CAPABILITY.moduleKey &&
        answer.capability.capabilityKey === TODAY_CAPABILITY.capabilityKey,
    )?.properties ?? [];

  const first = workingProperty(
    todayProperties,
    switchable,
    await rememberedProperty(),
  );

  const root = localizeHref(locale, "today");

  const accountItems = (
    <DropdownMenuItem asChild>
      {/* Account security is not an entitled capability — it belongs to the
          person, not the Organization — so it is reached through the account
          rather than added to the rail, which lists only what was bought. */}
      <PropertyLink
        defaultProperty={first?.propertyId}
        href={localizeHref(locale, "security")}
      >
        <ShieldCheck aria-hidden="true" className="size-4" />
        {t("security")}
      </PropertyLink>
    </DropdownMenuItem>
  );

  return (
    <AppShell
      bottomNav={
        <WorkspaceBottomNav
          defaultProperty={first?.propertyId}
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
                    chooseLabel={t("chooseProperty")}
                    defaultId={first.propertyId}
                    label={t("propertySwitcher")}
                    locale={locale}
                    slots={switchable.map((property) => ({
                      id: property.propertyId,
                      name: property.propertyName,
                      organization: property.organizationName,
                      segments: property.segments,
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
          defaultProperty={first?.propertyId}
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
          defaultProperty={first?.propertyId}
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
      <BillingNotice
        description={t("billingNotice.description")}
        notices={overdue}
        title={(organization) => t("billingNotice.title", { organization })}
      />
      <QueryProvider scope={viewer.userId}>{children}</QueryProvider>
    </AppShell>
  );
}
