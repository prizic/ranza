import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { Help, helpMetadata } from "../help-page";

export const generateMetadata = helpMetadata;

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const each of [value ?? []].flat()) query.append(name, each);
  }
  return <Help locale={locale} query={query} route="reset-password" />;
}
