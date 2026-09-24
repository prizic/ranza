import { notFound, redirect } from "next/navigation";
import { BedDouble, Building2, DoorOpen, LogIn, LogOut } from "lucide-react";
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
 * Composed by SplitAuthLayout, after the Leaders portal's sign-in. Its service
 * row names what the Stay page shows — the Portal has built nothing else, and
 * the row is not a place to promise it.
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
  const services = (
    [
      [BedDouble, t("stay")],
      [Building2, t("property")],
      [DoorOpen, t("unit")],
      [LogIn, t("arrival")],
      [LogOut, t("departure")],
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
      <SignInForm redirectTo={stay} />
    </SplitAuthLayout>
  );
}
