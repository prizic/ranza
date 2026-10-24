import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { requireViewer } from "../../../../server/viewer";

/**
 * Any address under a language that is not a page. Without it the framework
 * answers an unmatched path with its own bare 404, because the layout that
 * knows the language and draws the shell is below the root; thrown from here,
 * the not-found page beside this folder is drawn instead, inside the shell and
 * in the address's language (SHELL-03). A signed-out visitor is sent to sign in
 * first, like on every page: what exists is not told to someone with no session.
 */
export default async function Missing({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);
  notFound();
}
