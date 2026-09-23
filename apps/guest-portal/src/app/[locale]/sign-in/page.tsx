import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * The gate. Deliberately not the Portal shell: there is no Stay and no
 * navigation yet, so showing the chrome would be showing an empty version of
 * it. It also sits outside the (portal) group, whose layout requires a viewer
 * and would otherwise redirect here in a loop.
 *
 * Composed by SplitAuthLayout, after the EduBoard sign-in.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const stay = localizeHref(locale, "stay");
  if (await currentViewer()) redirect(stay);

  const t = await getTranslations();

  return (
    <SplitAuthLayout
      languageSwitcher={
        <LanguageSwitcher
          currentLocale={locale}
          hrefPattern="/{locale}/sign-in"
          label={t("languageLabel")}
          variant="pill"
        />
      }
      pitch={t("authSubSlogan")}
      productBadge={t("portalBadge")}
      productName={t("productName")}
      sloganLead={t("authSloganLead")}
      sloganStrong={t("authSloganStrong")}
      subtitle={t("signInSummary")}
      title={t("welcomeBack")}
    >
      <SignInForm redirectTo={stay} />
    </SplitAuthLayout>
  );
}
