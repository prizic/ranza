import { isSupportedLocale, messagesFor } from "@ranza/i18n";
import { leadMessagesFor } from "@ranza/i18n/leads";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../components/localized-shell";
import { LeadForm } from "../../components/lead-form";
import "../../storefront.css";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const m = messagesFor(locale);
  const origin = process.env.STOREFRONT_ORIGIN;
  return {
    title: `${m.storefront.title} | Ranza`,
    description: m.storefront.description,
    ...(origin
      ? {
          metadataBase: new URL(origin),
          alternates: {
            canonical: `/${locale}`,
            languages: { tr: "/tr", en: "/en", ar: "/ar", "x-default": "/tr" },
          },
          openGraph: {
            title: m.storefront.title,
            description: m.storefront.description,
            locale,
            url: `/${locale}`,
            type: "website",
          },
        }
      : {}),
  };
}

export default async function StorefrontPage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);
  const m = leadMessagesFor(locale);
  const modules = [
    messages.navigation.attendance,
    messages.navigation.meals,
    messages.navigation.announcements,
    messages.navigation.balance,
    messages.navigation.wifi,
  ];

  return (
    <LocalizedShell locale={locale}>
      <a className="button" href="#contact">
        {m.demo}
      </a>
      <section className="storefront-suite">
        {modules.map((title, index) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{m.suite[index]}</p>
          </article>
        ))}
      </section>
      <section className="detail-panel">
        <div>
          <h2>{m.branchesTitle}</h2>
          <p>{m.branches}</p>
        </div>
      </section>
      <p>{m.languages}</p>
      <p>{m.founding}</p>
      <section id="contact" className="contact-section">
        <h2>{m.demo}</h2>
        <p>{m.intro}</p>
        <LeadForm
          locale={locale}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        />
      </section>
    </LocalizedShell>
  );
}
