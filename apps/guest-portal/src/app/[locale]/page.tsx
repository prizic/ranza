import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";

/**
 * The locale root has no content of its own. Without this, `/en` would 404
 * while `/` redirected fine — a dead URL that only shows up when somebody
 * shortens a link by hand.
 */
export default async function LocaleRoot({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  redirect(localizeHref(locale, "stay"));
}
