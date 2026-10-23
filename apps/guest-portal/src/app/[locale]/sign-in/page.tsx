import { notFound, redirect } from "next/navigation";
import { BedDouble, Building2, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("signIn") };
}

/**
 * The gate. Deliberately not the Portal shell: there is no Stay and no
 * navigation yet, so showing the chrome would be showing an empty version of
 * it. It also sits outside the (portal) group, whose layout requires a viewer
 * and would otherwise redirect here in a loop.
 *
 * Composed by SplitAuthLayout, after EduBoard's login. Its service
 * row names what the Stay page shows — the Portal has built nothing else, and
 * the row is not a place to promise it. Password reset by email does not
 * exist (nothing sends mail), so the page says who can help instead (GP-01).
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const stay = localizeHref(locale, "stay");
  if (await currentViewer()) redirect(stay);

  const t = await getTranslations();
  const services = (
    [
      [BedDouble, t("serviceRoom")],
      [Building2, t("serviceProperty")],
      [CalendarDays, t("serviceDates")],
    ] as const
  ).map(([Icon, label]) => ({
    icon: <Icon aria-hidden="true" strokeWidth={1.25} />,
    label,
  }));

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
      productBadge={t("portalBadge")}
      productName={t("productName")}
      services={services}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      subtitle={t("signInSummary")}
      title={t("welcomeBack")}
    >
      <SignInForm
        forgotHref={localizeHref(locale, "forgot-password")}
        redirectTo={stay}
      />
    </SplitAuthLayout>
  );
}
