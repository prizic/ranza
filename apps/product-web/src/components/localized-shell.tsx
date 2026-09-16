"use client";

import {
  localizeHref,
  messagesFor,
  replaceLocaleInPathname,
  supportedLocales,
  type SupportedLocale,
} from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function LocalizedShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: SupportedLocale;
}) {
  const messages = messagesFor(locale);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const querySuffix = query ? `?${query}` : "";
  const staff = pathname.startsWith(`/${locale}/staff`);
  const branch = searchParams.get("branch");
  const branchSuffix = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const home = localizeHref(locale, staff ? "/staff" : "/student");
  const navigation = [
    [home, messages.navigation.home],
    [
      `${localizeHref(locale, staff ? "/staff/attendance" : "/student/attendance")}${staff ? branchSuffix : ""}`,
      messages.navigation.attendance,
    ],
    [
      `${localizeHref(locale, staff ? "/staff/meals" : "/meals")}${staff ? branchSuffix : ""}`,
      messages.navigation.meals,
    ],
    [
      localizeHref(locale, staff ? "/staff/announcements" : "/announcements"),
      messages.navigation.announcements,
    ],
    [
      `${localizeHref(locale, staff ? "/staff/balances" : "/balance")}${staff ? branchSuffix : ""}`,
      messages.navigation.balance,
    ],
    [
      `${localizeHref(locale, staff ? "/staff/wifi" : "/wifi")}${staff ? branchSuffix : ""}`,
      messages.navigation.wifi,
    ],
  ] as const;
  return (
    <AppShell
      languageLabel={messages.language.label}
      localeLinks={supportedLocales.map((item) => ({
        current: item === locale,
        href: `${replaceLocaleInPathname(pathname, item)}${querySuffix}`,
        label: messages.language[item],
        locale: item,
      }))}
      navigation={navigation.map(([href, label]) => ({
        current: pathname === href.split("?")[0],
        href,
        label,
      }))}
      productName="Ranza"
      skipLabel={messages.navigation.skipToContent}
      summary={messages.product.description}
      title={messages.product.title}
    >
      {children}
    </AppShell>
  );
}
