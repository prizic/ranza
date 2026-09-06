import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { controlAuthMessagesFor } from "@ranza/i18n/control-auth";
import { FormField, StatusMessage } from "@ranza/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { requestPasswordRecoveryAction } from "./actions";

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/forgot-password">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const messages = controlAuthMessagesFor(locale).forgotPassword;

  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>{messages.title}</h2>
        <p>{messages.description}</p>
        {query.sent ? (
          <StatusMessage tone="success">{messages.sent}</StatusMessage>
        ) : (
          <form action={requestPasswordRecoveryAction} className="control-form">
            <input name="locale" type="hidden" value={locale} />
            <FormField
              autoComplete="email"
              id="email"
              label={messages.emailLabel}
              name="email"
              required
              type="email"
            />
            <button className="button" type="submit">
              {messages.action}
            </button>
          </form>
        )}
        <p>
          <Link href={localizeHref(locale, "/sign-in")}>
            {messages.backToSignIn}
          </Link>
        </p>
      </section>
    </LocalizedShell>
  );
}
