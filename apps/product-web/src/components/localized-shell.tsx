import {
  localizeHref,
  messagesFor,
  supportedLocales,
  type SupportedLocale,
} from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import type { ReactNode } from "react";

export function LocalizedShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: SupportedLocale;
}) {
  const messages = messagesFor(locale);
  return (
    <AppShell
      languageLabel={messages.language.label}
      localeLinks={supportedLocales.map((item) => ({
        current: item === locale,
        href: localizeHref(item, "/"),
        label: messages.language[item],
        locale: item,
      }))}
      navigation={[
        {
          current: true,
          href: localizeHref(locale, "/"),
          label: messages.navigation.home,
        },
        {
          href: `${localizeHref(locale, "/")}#attendance`,
          label: messages.navigation.attendance,
        },
        {
          href: `${localizeHref(locale, "/")}#meals`,
          label: messages.navigation.meals,
        },
        {
          href: `${localizeHref(locale, "/")}#announcements`,
          label: messages.navigation.announcements,
        },
        {
          href: `${localizeHref(locale, "/")}#balance`,
          label: messages.navigation.balance,
        },
        {
          href: `${localizeHref(locale, "/")}#wifi`,
          label: messages.navigation.wifi,
        },
      ]}
      productName="Ranza"
      skipLabel={messages.navigation.skipToContent}
      summary={messages.product.description}
      title={messages.product.title}
    >
      {children}
    </AppShell>
  );
}
