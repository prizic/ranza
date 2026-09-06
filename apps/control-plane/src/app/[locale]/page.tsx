import { formatNumber, isSupportedLocale, messagesFor } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../components/localized-shell";

export default async function ControlPlanePage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);
  return (
    <LocalizedShell locale={locale}>
      <section className="ops-list">
        <article id="operators">
          <h2>{messages.navigation.operators}</h2>
          <strong>{formatNumber(3, locale)}</strong>
        </article>
        <article id="branches">
          <h2>{messages.navigation.branches}</h2>
          <strong>{formatNumber(8, locale)}</strong>
        </article>
        <article id="health">
          <h2>{messages.navigation.serviceHealth}</h2>
          <BidiText>OK · RANZA-CP-01</BidiText>
        </article>
      </section>
      <StatusMessage tone="success">
        <BidiText>06.09.2026 · 12:15 UTC</BidiText>
      </StatusMessage>
    </LocalizedShell>
  );
}
