"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

type Provider = ComponentProps<typeof NextIntlClientProvider>;

interface Props {
  children: ReactNode;
  locale: NonNullable<Provider["locale"]>;
  messages: NonNullable<Provider["messages"]>;
  timeZone: NonNullable<Provider["timeZone"]>;
}

/**
 * next-intl's provider, handed the same catalogue for as long as the language
 * stays the same.
 *
 * A server action that revalidates a path sends the layout again, and the
 * catalogue with it, as a new object. `useTranslations` is memoised on that
 * object, so every `t` in the page changed identity, every column definition
 * built from one was rebuilt, and every table re-created its cells. Whoever held
 * the keyboard on a button in a table lost it: checking a Guest in moved focus
 * to the next check-in and the refresh that followed put it back on the page.
 *
 * The catalogue is the same text either way: it is read from a module that does
 * not change while the page is open, so keeping the first one costs nothing and
 * a deploy is picked up by the reload that follows it.
 */
export function StableIntlProvider({
  children,
  locale,
  messages,
  timeZone,
}: Props) {
  const [kept, setKept] = useState({ locale, messages });
  if (kept.locale !== locale) setKept({ locale, messages });

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={kept.messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
