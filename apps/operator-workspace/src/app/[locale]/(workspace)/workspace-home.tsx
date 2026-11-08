"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { Button } from "@ranza/ui";
import { useHome } from "../../../lib/nav";

interface HomeScope {
  defaultProperty: string | undefined;
  segmentsByProperty: Readonly<Record<string, readonly string[]>>;
}

const HomeContext = createContext<HomeScope>({
  defaultProperty: undefined,
  segmentsByProperty: {},
});

/**
 * Tells everything inside the shell which pages are open at which Property, so
 * a "Go to Today" can lead somewhere that opens at the Property in use. Without
 * it, a Property with Today switched off sent the person to another Property's
 * day (audit 2026-11-07, D-01).
 */
export function WorkspaceHomeProvider({
  children,
  defaultProperty,
  segmentsByProperty,
}: HomeScope & { children: ReactNode }) {
  return (
    <HomeContext.Provider value={{ defaultProperty, segmentsByProperty }}>
      {children}
    </HomeContext.Provider>
  );
}

export function useWorkspaceHome(locale: SupportedLocale) {
  const { defaultProperty, segmentsByProperty } = useContext(HomeContext);
  return useHome(locale, defaultProperty, segmentsByProperty);
}

/** The button that ends a refusal: back to Today, or to its stand-in. */
export function HomeButton({ locale }: { locale: SupportedLocale }) {
  const t = useTranslations();
  const { href, segment } = useWorkspaceHome(locale);
  return (
    <Button asChild>
      <Link href={href}>
        {segment === "today"
          ? t("denied.goToToday")
          : t("denied.goToPage", {
              page: t.has(`navigation.${segment}`)
                ? t(`navigation.${segment}`)
                : segment,
            })}
      </Link>
    </Button>
  );
}
