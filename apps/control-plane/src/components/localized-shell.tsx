import {
  localizeHref,
  messagesFor,
  supportedLocales,
  type SupportedLocale,
} from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import type { ReactNode } from "react";
import { leadMessagesFor } from "@ranza/i18n/leads";

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
          href: localizeHref(locale, "/operations"),
          label:
            locale === "tr"
              ? "Operasyon ve destek"
              : locale === "ar"
                ? "العمليات والدعم"
                : "Operations and support",
        },
        {
          href: localizeHref(locale, "/leads"),
          label: leadMessagesFor(locale).leads,
        },
        {
          current: true,
          href: localizeHref(locale, "/"),
          label: messages.navigation.home,
        },
        {
          href: `${localizeHref(locale, "/")}#operators`,
          label: messages.navigation.operators,
        },
        {
          href: `${localizeHref(locale, "/")}#branches`,
          label: messages.navigation.branches,
        },
        {
          href: `${localizeHref(locale, "/")}#health`,
          label: messages.navigation.serviceHealth,
        },
      ]}
      productName="Prizic · Ranza"
      skipLabel={messages.navigation.skipToContent}
      summary={messages.control.description}
      title={messages.control.title}
    >
      {children}
    </AppShell>
  );
}
