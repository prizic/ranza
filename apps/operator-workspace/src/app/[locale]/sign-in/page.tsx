import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * The gate. Deliberately not the workspace shell: there is no Organization, no
 * Property and no navigation yet, so showing the chrome would be showing an
 * empty version of it.
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

  const today = localizeHref(locale, "today");
  if (await currentViewer()) redirect(today);

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
      productBadge={t("workspaceBadge")}
      productName={t("productName")}
      sloganLead={t("authSloganLead")}
      sloganStrong={t("authSloganStrong")}
      subtitle={t("signInSummary")}
      title={t("welcomeBack")}
    >
      <SignInForm redirectTo={today} />
    </SplitAuthLayout>
  );
}
