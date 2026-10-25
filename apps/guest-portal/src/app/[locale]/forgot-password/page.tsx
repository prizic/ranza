import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { Help, helpMetadata } from "../help-page";

export const generateMetadata = helpMetadata;

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  return <Help locale={locale} route="forgot-password" />;
}
