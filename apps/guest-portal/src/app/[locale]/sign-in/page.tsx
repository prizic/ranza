import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import {
  BrandMark,
  LanguageSwitcher,
  ServiceIconChecklist,
  ServiceIconContract,
  ServiceIconDocument,
  ServiceIconDocumentAlt,
  ServiceIconHome,
  SplitAuthLayout,
} from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * The gate. Deliberately not the Portal shell: there is no Stay and no
 * navigation yet, so showing the chrome would be showing an empty version of
 * it. It also sits outside the (portal) group, whose layout requires a viewer
 * and would otherwise redirect here in a loop.
 *
 * Composed by SplitAuthLayout, after the Leaders portal sign-in.
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
      brand={
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <BrandMark className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl leading-none font-bold tracking-tight text-foreground/80">
              {t("productName")}
            </span>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider mt-1 leading-none">
              {t("stay")}
            </span>
          </div>
        </div>
      }
      languageSwitcher={
        <LanguageSwitcher
          currentLocale={locale}
          hrefPattern="/{locale}/sign-in"
          label={t("languageLabel")}
          variant="pill"
        />
      }
      services={[
        {
          icon: <ServiceIconHome size={28} />,
          label: t("authServices.stay"),
        },
        {
          icon: <ServiceIconDocumentAlt size={28} />,
          label: t("authServices.property"),
        },
        {
          icon: <ServiceIconChecklist size={28} />,
          label: t("authServices.unit"),
        },
        {
          icon: <ServiceIconDocument size={28} />,
          label: t("authServices.records"),
        },
        {
          icon: <ServiceIconContract size={28} />,
          label: t("authServices.security"),
        },
      ]}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      welcomeSubtitle={t("signInSummary")}
      welcomeTitle={t("welcomeBack")}
    >
      <SignInForm redirectTo={stay} />
    </SplitAuthLayout>
  );
}
