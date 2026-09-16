import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { AppShell } from "@ranza/ui";
import { messages } from "../../../messages";
import { requireViewer } from "../../../server/viewer";

/**
 * The authenticated shell, and the gate that sends a signed-out visitor to sign
 * in.
 *
 * Navigation has one destination, which is the Portal's entire information
 * architecture for now. Blueprint 4.3 lists further capabilities — service
 * requests, announcements, meal choices, attendance — and none of them are
 * built, so none of them appear. A capability that is not entitled is absent
 * rather than disabled, and one that does not exist yet is absent for the same
 * reason.
 */
export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  const viewer = await requireViewer(locale);
  const stayHref = localizeHref(locale, "stay");

  return (
    <AppShell
      context={
        <p className="portal-account">
          <span>{copy.signedInAs}</span> {viewer.email}
        </p>
      }
      languageLabel={copy.languageLabel}
      localeLinks={supportedLocales.map((supported) => ({
        current: supported === locale,
        href: localizeHref(supported, "stay"),
        label: supported.toUpperCase(),
        locale: supported,
      }))}
      navigation={[{ current: true, href: stayHref, label: copy.stay }]}
      productName={copy.productName}
      skipLabel={copy.skip}
    >
      {children}
    </AppShell>
  );
}
