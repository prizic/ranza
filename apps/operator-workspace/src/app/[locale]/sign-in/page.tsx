import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { screenFor } from "../../../lib/screens";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * What the sign-in screen's service row names: screens that are built, with the
 * icon and the name the rail gives them, so the row cannot promise a
 * destination the workspace does not have.
 */
const SERVICES = [
  "reservations",
  "rooms",
  "arrivals",
  "departures",
  "finance",
] as const;

/**
 * The gate. Deliberately not the workspace shell: there is no Organization, no
 * Property and no navigation yet, so showing the chrome would be showing an
 * empty version of it.
 *
 * Composed by SplitAuthLayout, after the Leaders portal's sign-in.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const today = localizeHref(locale, "today");
  if (await currentViewer()) redirect(today);

  const t = await getTranslations();
  const nav = await getTranslations("navigation");

  const services = SERVICES.flatMap((segment) => {
    const screen = screenFor(segment);
    return screen?.built
      ? [
          {
            icon: <screen.icon aria-hidden="true" strokeWidth={1.25} />,
            label: nav(segment),
          },
        ]
      : [];
  });

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
      productBadge={t("workspaceBadge")}
      productName={t("productName")}
      services={services}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      subtitle={t("signInSummary")}
      title={t("welcomeBack")}
    >
      <SignInForm redirectTo={today} />
    </SplitAuthLayout>
  );
}
