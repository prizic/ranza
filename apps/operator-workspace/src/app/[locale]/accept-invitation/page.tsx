import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { shippedRoleOf } from "../../../features/staff/labels";
import { readInvitationPage } from "../../../server/invitation";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { InvitationRefused } from "./invitation-refused";

/**
 * The link is a credential, so the page keeps it out of the Referer header of
 * anything it links to or loads.
 */
export const metadata: Metadata = { referrer: "no-referrer" };

const NIL_SCOPE = "00000000-0000-0000-0000-000000000000";

/**
 * Where an invited colleague lands. Outside the workspace shell for the reason
 * the sign-in screen is: the person has no session, so there is no
 * Organization to draw navigation for yet.
 */
export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" ? rawToken : "";
  const page = await readInvitationPage(token);

  const t = await getTranslations();
  const accept = await getTranslations("acceptInvitation");
  const switcher = (
    <LanguageSwitcher
      currentLocale={locale}
      hrefPattern={`/{locale}/accept-invitation?token=${encodeURIComponent(token)}`}
      label={t("languageLabel")}
      variant="pill"
    />
  );

  if (page.kind === "refused") {
    return (
      <SplitAuthLayout
        languageSwitcher={switcher}
        productBadge={t("workspaceBadge")}
        productName={t("productName")}
        services={[]}
        slogan={t("authSlogan")}
        subSlogan={t("authSubSlogan")}
        subtitle={accept(`refused.${page.reason}.body`)}
        title={accept(`refused.${page.reason}.title`)}
      >
        <InvitationRefused
          continueHref={localizeHref(
            locale,
            `accept-invitation?token=${encodeURIComponent(token)}`,
          )}
          reason={page.reason}
          signInHref={localizeHref(locale, "sign-in")}
        />
      </SplitAuthLayout>
    );
  }

  const shipped = shippedRoleOf({
    key: page.roleKey,
    organizationId: page.roleScopeId === NIL_SCOPE ? null : page.roleScopeId,
  });
  const role = shipped ? t(`staff.roles.${shipped}`) : page.roleName;

  return (
    <SplitAuthLayout
      languageSwitcher={switcher}
      productBadge={t("workspaceBadge")}
      productName={t("productName")}
      services={[]}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      subtitle={accept("summary", {
        organization: page.organizationName,
        role,
      })}
      title={accept(`title.${page.mode}`)}
    >
      <AcceptInvitationForm
        email={page.email}
        mode={page.mode}
        redirectTo={localizeHref(locale, "today")}
        signInHref={localizeHref(locale, "sign-in")}
        token={token}
      />
    </SplitAuthLayout>
  );
}
