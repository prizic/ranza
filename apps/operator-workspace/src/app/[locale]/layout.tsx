import "@ranza/ui/tokens.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import { messages } from "../../messages";

/**
 * One typeface for three scripts.
 *
 * IBM Plex Sans Arabic carries the Plex Latin alongside the Arabic, so Turkish
 * and Arabic are the same voice rather than two families bolted together — and
 * its Turkish diacritics are drawn rather than synthesised.
 */
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "600"],
  variable: "--font-plex",
  display: "swap",
});

/**
 * The root layout. It sits under [locale] because every page here is
 * locale-prefixed, which is what lets `lang` and `dir` be set on the html
 * element itself. Arabic is right to left in the first byte of the response,
 * not after a client effect.
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
  // An unsupported prefix is not found rather than quietly served in Turkish:
  // a wrong language is harder to notice than a missing page.
  if (!isSupportedLocale(locale)) notFound();

  return (
    <html
      className={plex.variable}
      // tokens.css sets `scroll-behavior: smooth`, which Next cannot tell from
      // a per-route preference; without this it skips scroll restoration.
      data-scroll-behavior="smooth"
      dir={directionFor(locale)}
      lang={locale}
    >
      <body>{children}</body>
    </html>
  );
}
