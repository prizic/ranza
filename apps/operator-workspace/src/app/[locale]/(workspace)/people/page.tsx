import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { InviteDialog } from "../../../../features/staff/components/invite-dialog";
import { RosterTable } from "../../../../features/staff/components/roster-table";
import { readRoster } from "../../../../server/staff";
import { entitledProperties } from "../../../../server/viewer";

/**
 * Staff and permissions: who works for this Organization, and where.
 *
 * The Organization comes from the viewer's own reach rather than from the URL.
 * A Property is how reach is expressed everywhere else in the product, and
 * staff administration is the one command that is about the Organization
 * instead — so the gate is still asked about a Property, and the answer is used
 * to find the Organization that Property belongs to.
 *
 * Which means an Organization with no Property has nobody who can invite. That
 * is a real gap and it is named here rather than papered over: creating the
 * first Property is part of onboarding, which is not built.
 */
const STAFF_ADMINISTRATION = {
  moduleKey: "platform_core",
  capabilityKey: "staff_administration",
};

/**
 * The roles Ranza ships, restated rather than read.
 *
 * Reading them would be a query that returns the same five rows on every
 * request, and slice 3 — where an Organization authors its own — is what turns
 * this into a real read. Until then this list is the honest shape of it.
 */
const SHIPPED_ROLES = [
  "owner",
  "manager",
  "front_desk",
  "housekeeping",
  "finance",
] as const;

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const properties = await entitledProperties(STAFF_ADMINISTRATION);
  const home = properties[0];

  if (!home) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const organizationId = home.organizationId;
  const roster = await readRoster(organizationId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          {t("staff.rosterOf")} {home.organizationName}
        </p>
        <InviteDialog
          locale={locale}
          organizationId={organizationId}
          properties={properties.map((property) => ({
            propertyId: property.propertyId,
            propertyName: property.propertyName,
          }))}
          roles={SHIPPED_ROLES.map((key) => ({
            key,
            name: t(`staff.roles.${key}`),
          }))}
        />
      </div>
      {roster.length === 0 ? (
        <EmptyState
          description={t("staff.emptyRosterDescription")}
          title={t("staff.emptyRosterTitle")}
        />
      ) : (
        <RosterTable
          locale={locale}
          organizationId={organizationId}
          roster={roster}
        />
      )}
    </>
  );
}
