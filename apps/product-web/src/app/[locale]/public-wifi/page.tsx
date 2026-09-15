import { isSupportedLocale } from "@ranza/i18n";
import { notFound } from "next/navigation";
import { PublicWifiViewer } from "../../../components/public-wifi-viewer";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function PublicWifiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return (
    <main className="public-wifi-page">
      <PublicWifiViewer locale={locale} />
    </main>
  );
}
