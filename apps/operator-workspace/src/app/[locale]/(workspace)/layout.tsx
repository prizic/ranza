import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import {
  AccountMenu,
  AppShell,
  BrandMark,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  offersPortfolio,
  PORTFOLIO_GATE,
  PORTFOLIO_KEY,
} from "../../../lib/portfolio-offer";
import { ALL_SCREENS, gateOf } from "../../../lib/screens";
import {
  switchableProperties,
  workingProperty,
} from "../../../lib/property-choice";
import { rememberedProperty } from "../../../server/front-desk";
import {
  billingNotices,
  entitledPropertiesByCapability,
  requireViewer,
  screenProperties,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { QueryProvider } from "../../providers/query-provider";
import { BillingNotice } from "./billing-notice";
import { PropertyLink } from "./property-link";
import { PropertySwitcher } from "./property-switcher";
import { SignOutItem } from "./sign-out-item";
import { WorkspaceLanguageSwitcher } from "./workspace-language-switcher";
import { WorkspacePageBar } from "./workspace-page-bar";
import { WorkspaceBottomNav, WorkspaceRail } from "./workspace-rail";

/**
 * The authenticated shell: the rail, the page bar, and the gate that sends a
 * signed-out visitor to sign in.
 *
 * Navigation lists the destinations the viewer can open (blueprint 4.6) — one
 * the Organization has not bought, the Property has not switched on or the role
 * may not use is absent, not greyed out, and locked upsells belong in a
 * separate Explore area. Hiding a control is never the boundary though: the
 * server and the database deny it either way, and the page says which gate
 * stopped the viewer (`ScreenDenied`).
 *
 * It renders on a full load and not again as the rail moves between pages —
 * those are client navigations that render only the page beneath. So each page
 * checks the session for itself (`requireViewer`), and the rail shows what was
 * open when the workspace was opened; a destination withdrawn since stays
 * listed until the next full load, and its page answers with the reason.
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
  // bought, not what exists (blueprint 4.6). The gate is the destination's own,
  // from `lib/screens.ts`, which is also what its page asks (`screenProperties`).
  //
  // All in one read rather than one per destination: a transaction each was a
  // connection each, and a full page load asked for more at once than the pool
  // holds. The unique capabilities are asked once each; two destinations
  // sharing one (arrivals and departures) do not cost two answers.
  //
  // A destination gated by a permission is asked about that instead — the
  // audit log, which no package selection may remove (ADR 0031) — alongside
  // the capability read rather than after it.
  const destinations = ALL_SCREENS.filter(
    (screen) => !screen.children && !screen.derived,
  ).map((screen) => ({
    segment: screen.segment,
    gate: gateOf(screen.segment),
  }));
  const capabilities = [
    ...new Map(
      destinations.flatMap(({ gate }) =>
        gate.capability && !gate.permission
          ? [
              [
                `${gate.capability.moduleKey}:${gate.capability.capabilityKey}`,
                gate.capability,
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];
  const [byCapability, byPermission, overdue] = await Promise.all([
    entitledPropertiesByCapability(capabilities),
    Promise.all(
      destinations.map(async ({ segment, gate }) => ({
        segment,
        reachable: gate.permission
          ? await screenProperties(gate)
          : ([] as const),
      })),
    ),
    billingNotices(),
  ]);

  const reachBySegment = new Map(
    destinations.map(({ segment, gate }) => [
      segment,
      gate.permission
        ? (byPermission.find((answer) => answer.segment === segment)
            ?.reachable ?? [])
        : (byCapability.find(
            (answer) =>
              answer.capability.moduleKey === gate.capability?.moduleKey &&
              answer.capability.capabilityKey ===
                gate.capability?.capabilityKey,
          )?.properties ?? []),
    ]),
  );

  // All Properties is not a capability anybody switches on: it is offered
  // when the viewer reaches several Properties of one Organization and has
  // analytics at one of them (`offersPortfolio`).
  const portfolioOffered = offersPortfolio(
    [...reachBySegment.values()].flat(),
    byCapability.find(
      (answer) =>
        answer.capability.moduleKey === PORTFOLIO_GATE.moduleKey &&
        answer.capability.capabilityKey === PORTFOLIO_GATE.capabilityKey,
    )?.properties ?? [],
  );

  // The destinations the rail lists: every one open at some Property the
  // viewer reaches. Plain strings, so the tree can be built on the client
  // where its icons live. Which of them stay open once a Property is chosen is
  // `segmentsByProperty`.
  const reachable = [
    ...[...reachBySegment]
      .filter(([, properties]) => properties.length > 0)
      .map(([segment]) => segment),
    ...(portfolioOffered ? [PORTFOLIO_KEY] : []),
  ];

  // The switcher lists every Property the viewer can use at least one
  // destination in, not only Today's (OA-S3-07): a Staff Member who reaches
  // Housekeeping at a Property where Today is off could otherwise never choose
  // it. Each carries the destinations open there, so choosing it can keep the
  // page being viewed, and so the rail can list only those.
  const switchable = switchableProperties(
    destinations.map(({ segment }) => ({
      segment,
      properties: reachBySegment.get(segment) ?? [],
    })),
  );
  const segmentsByProperty = Object.fromEntries(
    switchable.map((property) => [property.propertyId, property.segments]),
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
    <>
      <DropdownMenuItem asChild>
        {/* Account security is not an entitled capability — it belongs to the
          person, not the Organization — so it is reached through the account
          rather than added to the rail, which lists only what was bought. */}
        <PropertyLink
          defaultProperty={first?.propertyId}
          knownProperties={Object.keys(segmentsByProperty)}
          href={localizeHref(locale, "security")}
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          {t("security")}
        </PropertyLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <SignOutItem
        failedLabel={t("signOutFailed")}
        label={t("signOut")}
        signInHref={localizeHref(locale, "sign-in")}
        workingLabel={t("signingOut")}
      />
    </>
  );

  return (
    <AppShell
      bottomNav={
        <WorkspaceBottomNav
          defaultProperty={first?.propertyId}
          reachable={reachable}
          segmentsByProperty={segmentsByProperty}
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
                name={viewer.name}
                variant="compact"
              >
                {accountItems}
              </AccountMenu>
            </>
          }
          defaultProperty={first?.propertyId}
          reachable={reachable}
          segmentsByProperty={segmentsByProperty}
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
              name={viewer.name}
            >
              {accountItems}
            </AccountMenu>
          }
          brand={<BrandMark className="size-5" />}
          defaultProperty={first?.propertyId}
          reachable={reachable}
          segmentsByProperty={segmentsByProperty}
          labels={{
            collapse: t("collapse"),
            expand: t("expand"),
            home: t("productName"),
            mainNavigation: t("mainNavigation"),
            badge: t("workspaceBadge"),
          }}
          locale={locale}
          {...(first ? { organization: first.organizationName } : {})}
          organizations={Object.fromEntries(
            switchable.map((property) => [
              property.propertyId,
              property.organizationName,
            ]),
          )}
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
