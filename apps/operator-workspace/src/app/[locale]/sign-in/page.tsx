import { notFound, redirect } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RETURN_PARAM, safeReturnPath } from "../../../lib/return-path";
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
 * `/{locale}/sign-in`, for the language switcher, keeping the destination: the
 * placeholder stands in for the locale in both places, and the destination's own
 * path is what is encoded, so choosing another language does not lose it.
 */
function languagePattern(
  destination: string | null,
  locale: SupportedLocale,
): string {
  if (!destination) return "/{locale}/sign-in";
  const rest = destination.slice(`/${locale}`.length);
  return `/{locale}/sign-in?${RETURN_PARAM}=/{locale}${encodeURIComponent(rest)}`;
}

/**
 * The gate. Deliberately not the workspace shell: there is no Organization, no
 * Property and no navigation yet, so showing the chrome would be showing an
 * empty version of it.
 *
 * Composed by SplitAuthLayout, after EduBoard's login.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [RETURN_PARAM]?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  // Where they were going when they were sent here, when it is somewhere this
  // page may send them (SIGN-02); Today otherwise.
  const requested = (await searchParams)[RETURN_PARAM];
  const destination = safeReturnPath(
    Array.isArray(requested) ? requested[0] : requested,
    locale,
  );
  const landing = destination ?? localizeHref(locale, "today");
  if (await currentViewer()) redirect(landing);

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
          hrefPattern={languagePattern(destination, locale)}
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
      {destination ? (
        <p
          className="mb-5 rounded-lg border border-border bg-secondary p-3 text-sm font-medium text-secondary-foreground"
          role="status"
        >
          {t("signInContinue")}
        </p>
      ) : null}
      <SignInForm redirectTo={landing} />
    </SplitAuthLayout>
  );
}
