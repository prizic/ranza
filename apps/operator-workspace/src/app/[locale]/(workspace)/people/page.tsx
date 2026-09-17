import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { DefineRoleDialog } from "../../../../features/staff/components/define-role-dialog";
import { InviteDialog } from "../../../../features/staff/components/invite-dialog";
import { RolesTable } from "../../../../features/staff/components/roles-table";
import { RosterTable } from "../../../../features/staff/components/roster-table";
import { asShippedRole } from "../../../../features/staff/labels";
import { readRoles, readRoster } from "../../../../server/staff";
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
  // Sequential rather than parallel: both resolve the same session through
  // `currentViewer`, which is cached per request, and issuing them together
  // would only race to be the one that validates it.
  const roster = await readRoster(organizationId);
  const roles = await readRoles(organizationId);
  const offerable = roles.filter((role) => role.status === "active");

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
          roles={offerable.map((role) => {
            const shipped = asShippedRole(role.key);
            return {
              key: role.key,
              scopeId: role.organizationId,
              name: shipped ? t(`staff.roles.${shipped}`) : role.name,
            };
          })}
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

      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <h2 className="text-lg font-medium">{t("staff.rolesHeading")}</h2>
        <DefineRoleDialog locale={locale} organizationId={organizationId} />
      </div>
      <RolesTable
        locale={locale}
        organizationId={organizationId}
        roles={roles}
      />
    </>
  );
}
