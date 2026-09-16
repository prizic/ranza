import "@ranza/ui/tokens.css";
import "../../portal.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
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

// Mobile-first is a layout decision, and this is where it starts: the Portal is
// designed at 390px and allowed to grow. `viewport-fit` lets the safe-area
// insets in portal.css resolve on a notched phone.
export const viewport: Viewport = {
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

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
    // data-scroll-behavior: tokens.css sets `scroll-behavior: smooth` on html,
    // and without this Next cannot tell that from a per-route preference, so it
    // warns and skips scroll restoration on navigation.
    <html
      data-scroll-behavior="smooth"
      dir={directionFor(locale)}
      lang={locale}
    >
      <body>{children}</body>
    </html>
  );
}
