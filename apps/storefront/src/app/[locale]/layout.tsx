import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@ranza/ui/tokens.css";

export const metadata: Metadata = {
  description:
    "Operations software for independent student-dormitory Operators in Turkey.",
  title: "Ranza",
};

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  return (
    <html dir={directionFor(locale)} lang={locale}>
      <body className="storefront-app">{children}</body>
    </html>
  );
}
