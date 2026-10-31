import "../globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, IBM_Plex_Sans_Arabic, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import { DirectionProvider, OverlayLabelsProvider } from "@ranza/ui";
import {
  getTimeZone,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { StableIntlProvider } from "../../i18n/stable-intl-provider";
import { messages } from "../../messages";
import { LOCATION_HEADER } from "../../lib/return-path";

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

/**
 * The display face of a dialog's masthead: the Guest, the booking or the day
 * it is about, set large in italic. Latin only; Arabic keeps Plex, which draws
 * no italic, so the shared theme leaves the slant off there.
 */
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
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
  const navigation = await getTranslations({ locale, namespace: "navigation" });

  // Which page this is, from the path the proxy wrote down: a layout is not
  // handed its own route, and every tab titled "Ranza" was indistinguishable
  // from the next (SIGN-10).
  const here = (await headers()).get(LOCATION_HEADER) ?? "";
  const segment = here.split("?")[0]?.split("/")[2] ?? "";
  const page =
    segment === "sign-in"
      ? t("signIn")
      : segment === "security"
        ? t("security")
        : navigation.has(segment)
          ? navigation(segment)
          : null;

  return { title: page ? `${page} · ${t("productName")}` : t("productName") };
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

  // Tells next-intl which locale this render is for. It covers this layout and
  // nothing a client navigation renders without it, so every page and layout
  // beneath sets it again for itself; a page that does not falls back to
  // Turkish on /en and /ar (tests/unit/pages-set-their-locale.test.ts).
  // Without it every page that reads a string becomes dynamic, and
  // generateStaticParams above would be prerendering nothing.
  setRequestLocale(locale);
  const t = await getTranslations();
  const timeZone = await getTimeZone();

  return (
    <html
      className={`${geist.variable} ${plex.variable} ${newsreader.variable}`}
      dir={directionFor(locale)}
      lang={locale}
    >
      <body>
        {/* The catalogue crosses to the client once, here, rather than
            being handed to each client component as a `copy` prop. Always
            the canonical words: a dormitory's are laid over them by
            `PropertyWords` for as long as the URL names one, so a client
            navigation to a hotel never keeps a dormitory's words. */}
        <StableIntlProvider
          locale={locale}
          messages={messages[locale]}
          timeZone={timeZone}
        >
          <DirectionProvider dir={directionFor(locale)}>
            <OverlayLabelsProvider labels={{ close: t("closeDialog") }}>
              {children}
            </OverlayLabelsProvider>
          </DirectionProvider>
        </StableIntlProvider>
      </body>
    </html>
  );
}
