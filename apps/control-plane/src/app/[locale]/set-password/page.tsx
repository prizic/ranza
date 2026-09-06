import { isSupportedLocale } from "@ranza/i18n";
import { controlAuthMessagesFor } from "@ranza/i18n/control-auth";
import { FormField, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createControlPlaneClient } from "../../../lib/supabase/server";
import { setInvitePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/set-password">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const messages = controlAuthMessagesFor(locale).setPassword;

  const client = await createControlPlaneClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect(`/${locale}/sign-in?error=invalid-invite`);

  const access = await client
    .from("platform_access")
    .select("status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (access.data?.status !== "active") redirect(`/${locale}/forbidden`);

  const error = typeof query.error === "string" ? query.error : "";
  const errorMessages: Record<string, string> = {
    "password-mismatch": messages.errors.mismatch,
    "password-too-long": messages.errors.tooLong,
    "password-too-short": messages.errors.tooShort,
    "update-failed": messages.errors.updateFailed,
  };
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>{messages.title}</h2>
        <p>{messages.description}</p>
        {error ? (
          <StatusMessage tone="warning">
            {errorMessages[error] ?? messages.errors.generic}
          </StatusMessage>
        ) : null}
        <form action={setInvitePasswordAction} className="control-form">
          <input name="locale" type="hidden" value={locale} />
          <FormField
            autoComplete="new-password"
            hint={messages.hint}
            id="password"
            label={messages.passwordLabel}
            maxLength={72}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <FormField
            autoComplete="new-password"
            id="passwordConfirmation"
            label={messages.confirmationLabel}
            maxLength={72}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
          <button className="button" type="submit">
            {messages.action}
          </button>
        </form>
      </section>
    </LocalizedShell>
  );
}
