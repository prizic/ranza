import Link from "next/link";
import type { Metadata } from "next";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { buttonVariants } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { PortalAuthFrame } from "./auth-frame";

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
 *
 * One component for two routes, so the language menu is told which one it is
 * on and what the address carries: a reset link's token survives a change of
 * language instead of being dropped by a link to the other route (PORTAL-07).
 * The query is encoded, so a `{locale}` inside a value cannot be mistaken for
 * the placeholder.
 */
export async function Help({
  locale,
  query,
  route,
}: {
  locale: SupportedLocale;
  query?: URLSearchParams;
  route: "forgot-password" | "reset-password";
}) {
  const t = await getTranslations();
  const carried = query?.toString();

  return (
    <PortalAuthFrame
      languageHref={`/{locale}/${route}${carried ? `?${carried}` : ""}`}
      locale={locale}
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
    </PortalAuthFrame>
  );
}
