import "../globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

/**
 * Geist for Turkish and English, as in the Leaders portal the interface is
 * matched to; IBM Plex Sans Arabic for Arabic, which Geist does not draw. The
 * shared theme orders the two — see packages/ui's globals.css.
 */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist",
  display: "swap",
});

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
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
  const t = await getTranslations({ locale });
  return { title: t("productName") };
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

  // Tells next-intl which locale this render is for, so the pages beneath stay
  // static. Without it every page that reads a string becomes dynamic, and
  // generateStaticParams above would be prerendering nothing.
  setRequestLocale(locale);

  return (
    <html
      className={`${geist.variable} ${plex.variable}`}
      dir={directionFor(locale)}
      lang={locale}
    >
      <body>
        {/* The catalogue crosses to the client once, here, rather than
            being handed to each client component as a `copy` prop. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
