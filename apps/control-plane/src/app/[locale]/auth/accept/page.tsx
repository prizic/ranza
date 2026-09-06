import { isSupportedLocale } from "@ranza/i18n";
import { controlAuthMessagesFor } from "@ranza/i18n/control-auth";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function AcceptInvitePage({
  params,
  searchParams,
}: PageProps<"/[locale]/auth/accept">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const authMessages = controlAuthMessagesFor(locale);
  const messages =
    query.type === "recovery"
      ? authMessages.acceptRecovery
      : authMessages.acceptInvite;

  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>{messages.title}</h2>
        <p>{messages.description}</p>
        <form action={`/${locale}/auth/confirm`} method="post">
          <button className="button" type="submit">
            {messages.action}
          </button>
        </form>
      </section>
    </LocalizedShell>
  );
}
