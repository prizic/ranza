import { directionFor, isSupportedLocale, supportedLocales } from "@ranza/i18n";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "@ranza/ui/tokens.css";

import { ServiceWorkerRegistration } from "../../components/service-worker-registration";

export const metadata: Metadata = {
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ranza" },
  description: "Ranza Student App and Operator Dashboard.",
  manifest: "/manifest.webmanifest",
  title: "Ranza Product",
};

export const viewport: Viewport = { themeColor: "#18332d" };

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
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
