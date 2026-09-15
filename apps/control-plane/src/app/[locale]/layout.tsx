import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@ranza/ui/tokens.css";

export const metadata: Metadata = {
  description: "Internal administration surface for the Ranza service.",
  title: "Ranza Control Plane",
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
      <body className="control-app">{children}</body>
    </html>
  );
}
