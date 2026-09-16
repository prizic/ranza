import "@ranza/ui/tokens.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import { messages } from "../../messages";

/**
 * The root layout. It sits under [locale] because every page in this
 * application is locale-prefixed, which is what lets `lang` and `dir` be set on
 * the html element itself rather than patched in afterwards. Arabic is right to
 * left here from the first render, not after a client effect.
 */

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  return { title: messages[locale].productName };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // An unsupported prefix is not found rather than silently served in Turkish:
  // a wrong language is harder to notice than a missing page.
  if (!isSupportedLocale(locale)) notFound();

  return (
    <html dir={directionFor(locale)} lang={locale}>
      <body>{children}</body>
    </html>
  );
}
