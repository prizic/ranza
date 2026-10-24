import { getLocale, getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@ranza/i18n";
import { ScreenRefusal } from "./screen-denied";

/**
 * An address that is not a page, in the person's language and inside the shell,
 * with the way back to Today instead of the framework's bare 404 (SHELL-03).
 */
export default async function NotFound() {
  const locale = (await getLocale()) as SupportedLocale;
  const t = await getTranslations({ locale });
  return (
    <ScreenRefusal
      description={t("notFound.description")}
      locale={locale}
      title={t("notFound.title")}
    />
  );
}
