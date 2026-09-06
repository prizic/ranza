import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { controlAuthMessagesFor } from "@ranza/i18n/control-auth";
import { FormField, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";
import Link from "next/link";

import { LocalizedShell } from "../../../components/localized-shell";
import { signInAction } from "../actions";

export default async function SignInPage({
  params,
  searchParams,
}: PageProps<"/[locale]/sign-in">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const authMessages = controlAuthMessagesFor(locale);
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>Prizic access</h2>
        <p>Sign in with a provisioned platform identity.</p>
        {query.error ? (
          <StatusMessage tone="warning">
            {query.error === "invalid-invite"
              ? authMessages.signIn.invalidInvite
              : "The credentials or platform access could not be verified."}
          </StatusMessage>
        ) : null}
        <form action={signInAction} className="control-form">
          <input name="locale" type="hidden" value={locale} />
          <FormField id="email" label="Email" name="email" type="email" />
          <FormField
            id="password"
            label="Password"
            name="password"
            type="password"
          />
          <button className="button" type="submit">
            Sign in
          </button>
        </form>
        <p>
          <Link href={localizeHref(locale, "/forgot-password")}>
            {authMessages.signIn.forgotPassword}
          </Link>
        </p>
      </section>
    </LocalizedShell>
  );
}
