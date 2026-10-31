import { notFound } from "next/navigation";
import { isolate, isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Sparkles, Wrench } from "lucide-react";
import { PageHeader } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ALL_SCREENS, gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { InspectionSettings } from "../../../../features/housekeeping/components/inspection-settings";
import { MaintenanceSettingsCard } from "../../../../features/maintenance/components/maintenance-settings";
import { OrganizationCard } from "../../../../features/configuration/components/organization-card";
import {
  ElsewhereCard,
  SwitchedOnCard,
  type SwitchedOn,
} from "../../../../features/configuration/components/overview-cards";
import { PropertySettingsForm } from "../../../../features/configuration/components/property-settings-form";
import { RatesCard } from "../../../../features/configuration/components/rates-card";
import { unpricedKinds } from "../../../../features/configuration/unpriced";
import { SettingsCard } from "../../../../features/configuration/components/settings-card";
import {
  SectionNav,
  type Section,
} from "../../../../features/configuration/components/section-nav";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  CONFIGURATION_CAPABILITY,
  entitledPropertiesByCapability,
  housekeepingInspection,
  maintenanceSettings,
  priceList,
  propertySettings,
  requireViewer,
  screenProperties,
  timezoneNames,
  whyDenied,
} from "../../../../server/viewer";

/**
 * Configuration (blueprint 5.1, ADR 0036): every setting that applies at this
 * Property, in one place.
 *
 * The Property's own settings, its nightly prices (ADR 0038) and the
 * Organization's name are edited here.
 * Inspection after cleaning is Housekeeping's setting, and how maintenance
 * works is Maintenance's; each is shown by the same component and saved by the
 * same command as on its own screen, so the two can never disagree (CF-S3-06,
 * CF-S3-12). Rooms and staff have screens of their own and are
 * linked, not repeated.
 *
 * Gated like every screen; a reader without the permission sees every value
 * and changes none (CF-S3-01).
 */

/**
 * One entry per capability a screen asks of a Property, parents before
 * children. A destination decided by a permission alone asks none.
 */
const GATED_SCREENS = ALL_SCREENS.filter(
  (screen, index) =>
    !(screen.permission && !screen.requires) &&
    screen.capability !== CONFIGURATION_CAPABILITY.capabilityKey &&
    ALL_SCREENS.findIndex(
      (other) =>
        other.capability === screen.capability &&
        other.module === screen.module,
    ) === index,
);

export default async function ConfigurationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await screenProperties(gateOf("configuration"));
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "configuration"),
  );
  const settings = property
    ? await propertySettings(property.propertyId)
    : null;

  if (!property || !settings) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("configuration"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const [inspection, maintenance, prices, timezones, capabilities] =
    await Promise.all([
      housekeepingInspection(property.propertyId),
      maintenanceSettings(property.propertyId),
      priceList(property.propertyId),
      timezoneNames(),
      entitledPropertiesByCapability(
        GATED_SCREENS.map((screen) => ({
          moduleKey: screen.module,
          capabilityKey: screen.requires ?? screen.capability,
        })),
      ),
    ]);

  const switchedOn: SwitchedOn[] = GATED_SCREENS.filter((_, index) =>
    capabilities[index]?.properties.some(
      (candidate) => candidate.propertyId === property.propertyId,
    ),
  ).map((screen) => ({ segment: screen.segment, icon: screen.icon }));
  const isOn = (capability: string) =>
    GATED_SCREENS.some(
      (screen, index) =>
        screen.capability === capability &&
        capabilities[index]?.properties.some(
          (candidate) => candidate.propertyId === property.propertyId,
        ),
    );
  const showRooms = isOn("front_desk");
  const showPeople = isOn("staff_administration");

  const sections: Section[] = [
    { id: "organization", label: t("configuration.organizationTitle") },
    { id: "property", label: t("configuration.propertyTitle") },
    { id: "time", label: t("configuration.timeTitle") },
    { id: "model", label: t("configuration.modelTitle") },
    ...(prices
      ? [
          {
            id: "rates" as const,
            label: t("rates.title"),
            ...(unpricedKinds(prices).length > 0
              ? {
                  note: t("rates.unpricedCount", {
                    count: unpricedKinds(prices).length,
                  }),
                }
              : {}),
          },
        ]
      : []),
    ...(inspection
      ? [
          {
            id: "housekeeping" as const,
            label: t("configuration.housekeepingTitle"),
          },
        ]
      : []),
    ...(maintenance
      ? [{ id: "maintenance" as const, label: t("navigation.maintenance") }]
      : []),
    ...(switchedOn.length > 0
      ? [{ id: "modules" as const, label: t("configuration.modulesTitle") }]
      : []),
    ...(showRooms || showPeople
      ? [{ id: "elsewhere" as const, label: t("configuration.elsewhereTitle") }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* The layout's h1 names the screen; this says whose settings. */}
      <PageHeader>
        <h2 className="text-step-2 font-semibold tracking-tight">
          {t("configuration.subtitle", { property: isolate(settings.name) })}
        </h2>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <SectionNav label={t("configuration.sections")} sections={sections} />

        <div className="grid min-w-0 gap-6">
          {/* Keyed by Property, so a draft typed for one can never be saved
              to another if the page is ever reached without a full load. */}
          <OrganizationCard
            key={`organization-${settings.propertyId}`}
            locale={locale}
            settings={settings}
          />
          <PropertySettingsForm
            key={`property-${settings.propertyId}`}
            locale={locale}
            settings={settings}
            timezones={timezones}
          />
          {prices ? (
            <RatesCard
              key={`rates-${prices.propertyId}`}
              locale={locale}
              priceList={prices}
            />
          ) : null}
          {inspection ? (
            <SettingsCard
              hint={t("housekeeping.inspectionHint")}
              icon={Sparkles}
              id="housekeeping"
              title={t("housekeeping.inspectionTitle")}
            >
              <InspectionSettings
                embedded
                locale={locale}
                propertyId={property.propertyId}
                settings={inspection}
              />
            </SettingsCard>
          ) : null}
          {maintenance ? (
            <SettingsCard
              hint={t("maintenance.settingsHint")}
              icon={Wrench}
              id="maintenance"
              title={t("maintenance.settingsTitle")}
            >
              <MaintenanceSettingsCard
                embedded
                locale={locale}
                propertyId={property.propertyId}
                settings={maintenance}
              />
            </SettingsCard>
          ) : null}
          {switchedOn.length > 0 ? (
            <SwitchedOnCard screens={switchedOn} />
          ) : null}
          <ElsewhereCard
            locale={locale}
            propertyId={property.propertyId}
            showPeople={showPeople}
            showRooms={showRooms}
          />
        </div>
      </div>
    </div>
  );
}
