import Link from "next/link";
import { BedDouble, Building2, CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { buttonVariants, LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations } from "next-intl/server";

type Params = { params: Promise<{ locale: string }> };

export async function helpMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("helpTitle") };
}

/**
 * Where `/forgot-password` and `/reset-password` land. Resetting a password by
 * email needs mail to be sent, and nothing sends any, so rather than a bare
 * 404 the page says who can help: the front desk, who set the account up
 * (GP-01).
 */
export async function Help({ locale }: { locale: SupportedLocale }) {
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
          hrefPattern="/{locale}/forgot-password"
          label={t("languageLabel")}
          variant="pill"
        />
      }
      productBadge={t("portalBadge")}
      productName={t("productName")}
      services={services}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      subtitle={t("helpBody")}
      title={t("helpTitle")}
    >
      <Link
        className={buttonVariants({
          className: "h-13 w-full rounded-md text-[15px] font-medium",
        })}
        href={localizeHref(locale, "sign-in")}
      >
        {t("backToSignIn")}
      </Link>
    </SplitAuthLayout>
  );
}
