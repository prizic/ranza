import type { ReactNode } from "react";
import { BedDouble, Building2, CalendarDays } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import { LanguageSwitcher, SplitAuthLayout } from "@ranza/ui";
import { getTranslations } from "next-intl/server";

/**
 * The frame every page outside the signed-in shell is drawn in: sign-in, the
 * pages that say how to get back in, and an address that is not a page. One
 * place for the wordmark, the language menu and the service row, so a visitor
 * who lands on any of them is on the same product.
 *
 * Its service row names what the Stay page shows — the Portal has built
 * nothing else, and the row is not a place to promise it.
 *
 * `languageHref` is the page's own address with `{locale}` where the language
 * goes, so choosing another language keeps the page (and anything it carries).
 */
export async function PortalAuthFrame({
  children,
  languageHref,
  locale,
  subtitle,
  title,
}: {
  children: ReactNode;
  languageHref: string;
  locale: SupportedLocale;
  subtitle: string;
  title: string;
}) {
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
          hrefPattern={languageHref}
          label={t("languageLabel")}
          variant="pill"
        />
      }
      productBadge={t("portalBadge")}
      productName={t("productName")}
      services={services}
      slogan={t("authSlogan")}
      subSlogan={t("authSubSlogan")}
      subtitle={subtitle}
      title={title}
    >
      {children}
    </SplitAuthLayout>
  );
}
