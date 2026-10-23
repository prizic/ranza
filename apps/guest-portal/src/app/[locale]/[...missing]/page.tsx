import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";

/**
 * Any address under a language that is not a page. Without it the framework
 * answers an unmatched path with its own bare 404, because the layout that
 * knows the language is below the root; thrown from here, the not-found page
 * beside the layout is drawn instead, in the address's language (GP-04).
 */
export default async function Missing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (isSupportedLocale(locale)) setRequestLocale(locale);
  notFound();
}
