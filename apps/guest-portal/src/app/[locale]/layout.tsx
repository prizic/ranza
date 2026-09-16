import "../globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import { messages } from "../../messages";

/**
 * One typeface for three scripts — the same choice the Workspace makes, for the
 * same reason: IBM Plex Sans Arabic carries the Plex Latin alongside the
 * Arabic, so Turkish and Arabic are the same voice. The shared theme reads it
 * from --font-plex, so a Portal that did not load it would quietly fall back to
 * a system font and stop looking like the rest of the product.
 */
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "600"],
  variable: "--font-plex",
  display: "swap",
});

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
// insets on the work surface resolve on a notched phone.
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
    <html className={plex.variable} dir={directionFor(locale)} lang={locale}>
      <body>{children}</body>
    </html>
  );
}
