import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { localizeHref } from "@ranza/i18n";
import { buttonVariants, EmptyState } from "@ranza/ui";

/**
 * A Portal address that is nothing, in the visitor's language and with a way
 * back, instead of the framework's bare 404 (GP-04).
 */
export default async function NotFound() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center p-6">
      <EmptyState
        action={
          <Link
            className={buttonVariants()}
            href={localizeHref(locale as "tr" | "en" | "ar", "stay")}
          >
            {t("goToStay")}
          </Link>
        }
        description={t("notFoundBody")}
        title={t("notFoundTitle")}
      />
    </main>
  );
}
