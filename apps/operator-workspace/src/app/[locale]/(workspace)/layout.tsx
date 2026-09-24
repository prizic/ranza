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
import { getTranslations } from "next-intl/server";
import { ALL_SCREENS } from "../../../lib/screens";
import {
  entitledPropertiesByCapability,
  permittedProperties,
  requireViewer,
  TODAY_CAPABILITY,
} from "../../../server/viewer";
import { QueryProvider } from "../../providers/query-provider";
import { PropertyLink } from "./property-link";
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
  const [byCapability, byPermission] = await Promise.all([
    entitledPropertiesByCapability(capabilities),
    Promise.all(
      permitted.map(async (screen) => ({
        key: screen.key,
        reachable: await permittedProperties(screen.permission),
      })),
    ),
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

  const properties =
    byCapability.find(
      (answer) =>
        answer.capability.moduleKey === TODAY_CAPABILITY.moduleKey &&
        answer.capability.capabilityKey === TODAY_CAPABILITY.capabilityKey,
    )?.properties ?? [];

  const root = localizeHref(locale, "today");
  const [first] = properties;

  const account = (
    <AccountMenu email={viewer.email} label={t("account")} name={viewer.email}>
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

      <DropdownMenuSeparator />

      {/* Language belongs to the person too, and it is set once and then never
          again — so it lives beside the account rather than costing three
          permanent controls in a bar that has real work to show. */}
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {t("languageLabel")}
      </DropdownMenuLabel>
      {/* A full load rather than a Link: the language decides `lang`, `dir`
          and the message catalogue on the root layout, which a client
          navigation would keep. */}
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
            {t(`languageName.${supported}`)}
          </a>
        </DropdownMenuItem>
      ))}
    </AccountMenu>
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
            <div className="flex items-center gap-2">
              {first ? (
                <PropertySwitcher
                  chooseLabel={t("chooseProperty")}
                  label={t("propertySwitcher")}
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
          defaultProperty={first?.propertyId}
          entitled={entitled}
          locale={locale}
        />
      }
      rail={
        <WorkspaceRail
          actions={account}
          brand={<BrandMark className="size-6 text-primary" />}
          defaultProperty={first?.propertyId}
          entitled={entitled}
          labels={{
            back: t("back"),
            collapse: t("collapse"),
            expand: t("expand"),
            home: t("productName"),
            mainNavigation: t("mainNavigation"),
            sections: {
              operations: t("navSections.operations"),
              management: t("navSections.management"),
              system: t("navSections.system"),
            },
            workspaceBadge: t("workspaceBadge"),
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
