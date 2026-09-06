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
        { href: "#contact", label: messages.navigation.contact },
      ]}
      productName="Ranza"
      skipLabel={messages.navigation.skipToContent}
      summary={messages.storefront.description}
      title={messages.storefront.title}
    >
      {children}
    </AppShell>
  );
}
