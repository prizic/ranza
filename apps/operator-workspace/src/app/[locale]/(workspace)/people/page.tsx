import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState, PageHeader } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DefineRoleDialog } from "../../../../features/staff/components/define-role-dialog";
import { InviteDialog } from "../../../../features/staff/components/invite-dialog";
import { StaffScreen } from "../../../../features/staff/components/staff-screen";
import { rolesWithinViewer } from "../../../../features/staff/acts-on";
import {
  PERMISSION_CATALOGUE,
  shippedRoleOf,
} from "../../../../features/staff/labels";
import { readRoles, readRoster } from "../../../../server/staff";
import {
  entitledProperties,
  permittedProperties,
  requireViewer,
} from "../../../../server/viewer";

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
 *
 * A command is offered only to a viewer holding the permission it needs
 * (#80): inviting and changing somebody's role or reach ask for
 * `staff.administer`, defining a role for `staff.define_roles`. A viewer
 * holding neither reads the roster and is told who can change it; one holding
 * either is offered what it allows and nothing else — and only the roles, and
 * the members, within their own role and reach (SP-S1-35). The policies stay
 * the authority; this only stops offering what they would refuse.
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
  const viewer = await requireViewer(locale);

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
  const holds = async (permission: string) =>
    (await permittedProperties(permission)).some(
      (property) => property.organizationId === organizationId,
    );
  const mayAdminister = await holds("staff.administer");
  const mayDefineRoles = await holds("staff.define_roles");
  // Sequential rather than parallel: both resolve the same session through
  // `currentViewer`, which is cached per request, and issuing them together
  // would only race to be the one that validates it.
  const roster = await readRoster(organizationId);
  const roles = await readRoles(organizationId);
  // An invitation is bounded like a change (SP-S1-34): only a role within the
  // viewer's own. With none to offer, the dialog could only be refused.
  const invitableRoles = rolesWithinViewer(
    roles.filter((role) => role.status === "active"),
    roster,
    viewer.userId,
  );

  return (
    <>
      <PageHeader
        aside={
          <span className="flex flex-wrap gap-2">
            {mayDefineRoles ? (
              <DefineRoleDialog
                locale={locale}
                organizationId={organizationId}
              />
            ) : null}
            {mayAdminister && invitableRoles.length > 0 ? (
              <InviteDialog
                locale={locale}
                organizationId={organizationId}
                properties={properties.map((property) => ({
                  propertyId: property.propertyId,
                  propertyName: property.propertyName,
                }))}
                roles={invitableRoles.map((role) => {
                  const shipped = shippedRoleOf(role);
                  return {
                    key: role.key,
                    organizationId: role.organizationId,
                    name: shipped ? t(`staff.roles.${shipped}`) : role.name,
                  };
                })}
              />
            ) : null}
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("staff.screenSummary")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {home.organizationName}
        </p>
        {mayAdminister || mayDefineRoles ? null : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("staff.readOnly")}
          </p>
        )}
      </PageHeader>

      {roster.length === 0 ? (
        <EmptyState
          description={t("staff.emptyRosterDescription")}
          title={t("staff.emptyRosterTitle")}
        />
      ) : (
        <StaffScreen
          locale={locale}
          mayAdminister={mayAdminister}
          mayDefineRoles={mayDefineRoles}
          organizationId={organizationId}
          permissions={PERMISSION_CATALOGUE}
          roles={roles}
          roster={roster}
          viewerUserId={viewer.userId}
        />
      )}
    </>
  );
}
