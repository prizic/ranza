import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState, PageHeader } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DefineRoleDialog } from "../../../../features/staff/components/define-role-dialog";
import { InviteDialog } from "../../../../features/staff/components/invite-dialog";
import { StaffScreen } from "../../../../features/staff/components/staff-screen";
import {
  asShippedRole,
  PERMISSION_CATALOGUE,
} from "../../../../features/staff/labels";
import { readRoles, readRoster } from "../../../../server/staff";
import { entitledProperties, requireViewer } from "../../../../server/viewer";

/**
 * Staff and permissions: who works for this Organization, and what each role
 * may do.
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
  setRequestLocale(locale);
  await requireViewer(locale);

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

  return (
    <>
      <PageHeader
        aside={
          <span className="flex flex-wrap gap-2">
            <DefineRoleDialog locale={locale} organizationId={organizationId} />
            <InviteDialog
              locale={locale}
              organizationId={organizationId}
              properties={properties.map((property) => ({
                propertyId: property.propertyId,
                propertyName: property.propertyName,
              }))}
              roles={roles
                .filter((role) => role.status === "active")
                .map((role) => {
                  const shipped = asShippedRole(role.key);
                  return {
                    key: role.key,
                    scopeId: role.organizationId,
                    name: shipped ? t(`staff.roles.${shipped}`) : role.name,
                  };
                })}
            />
          </span>
        }
      >
        <p className="text-muted-foreground">{t("staff.screenSummary")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {home.organizationName}
        </p>
      </PageHeader>

      {roster.length === 0 ? (
        <EmptyState
          description={t("staff.emptyRosterDescription")}
          title={t("staff.emptyRosterTitle")}
        />
      ) : (
        <StaffScreen
          locale={locale}
          organizationId={organizationId}
          permissions={PERMISSION_CATALOGUE}
          roles={roles}
          roster={roster}
        />
      )}
    </>
  );
}
