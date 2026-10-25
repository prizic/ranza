import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentViewer } from "../../../server/viewer";
import { PortalAuthFrame } from "../auth-frame";
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
 * Password reset by email does not exist (nothing sends mail), so the form
 * says who can help in place, once, rather than linking to a page that says it
 * again (GP-01, PORTAL-08).
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

  return (
    <PortalAuthFrame
      languageHref="/{locale}/sign-in"
      locale={locale}
      subtitle={t("signInSummary")}
      title={t("welcomeBack")}
    >
      <SignInForm redirectTo={stay} />
    </PortalAuthFrame>
  );
}
