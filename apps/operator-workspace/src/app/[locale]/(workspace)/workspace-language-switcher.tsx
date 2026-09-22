"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { LanguageSwitcher } from "@ranza/ui";

export function WorkspaceLanguageSwitcher({
  label = "Change language",
  locale,
}: {
  label?: string;
  locale: SupportedLocale;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Strip the leading /[locale] segment to get the relative subpath
  const segments = pathname ? pathname.split("/").filter(Boolean) : [];
  const subpath = segments.length > 1 ? segments.slice(1).join("/") : "";
  const queryString = searchParams?.toString();

  const getHref = (targetLocale: string) => {
    const base = localizeHref(targetLocale as SupportedLocale, subpath);
    return queryString ? `${base}?${queryString}` : base;
  };

  return (
    <LanguageSwitcher
      currentLocale={locale}
      getHref={getHref}
      label={label}
      variant="header"
    />
  );
}
