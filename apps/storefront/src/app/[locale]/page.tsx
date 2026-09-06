import { isSupportedLocale, messagesFor } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../components/localized-shell";

export default async function StorefrontPage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);

  return (
    <LocalizedShell locale={locale}>
      <section className="outcome-band" aria-label={messages.storefront.title}>
        <p>{messages.navigation.attendance}</p>
        <p>{messages.navigation.meals}</p>
        <p>{messages.navigation.announcements}</p>
        <p>{messages.navigation.balance}</p>
        <p>{messages.navigation.wifi}</p>
      </section>
      <section className="detail-panel" id="contact">
        <div>
          <h2>{messages.navigation.contact}</h2>
          <p>{messages.storefront.description}</p>
        </div>
        <p className="identity-line">
          {messages.common.branchCode}: <BidiText>IST-01 · 06.09.2026</BidiText>
        </p>
      </section>
      <StatusMessage>{messages.product.install.description}</StatusMessage>
    </LocalizedShell>
  );
}
