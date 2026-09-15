import { isSupportedLocale } from "@ranza/i18n";
import { Button, Card, Input, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";
import { LocalizedShell } from "../../../../components/localized-shell";
import { studentCredentialCopy } from "../../../../lib/student-credential-copy";

export default async function StudentSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const t = studentCredentialCopy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{t.signIn}</h1>
        <p id="signin-hint">{t.signInHint}</p>
      </header>
      {query.error && (
        <StatusMessage tone="warning">{t.signInError}</StatusMessage>
      )}
      <Card className="auth-card">
        <form
          action={`/${locale}/student/sign-in/exchange`}
          method="post"
          className="control-form"
        >
          <label>
            {t.accessId}
            <Input
              name="accessId"
              autoComplete="username"
              dir="ltr"
              required
              maxLength={128}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            {t.currentPin}
            <Input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              minLength={6}
              maxLength={12}
              autoComplete="current-password"
              dir="ltr"
              required
              aria-describedby="signin-hint"
            />
          </label>
          <Button type="submit">{t.signIn}</Button>
        </form>
      </Card>
      <a className="text-link" href={`/${locale}/activate`}>
        {t.title}
      </a>
    </LocalizedShell>
  );
}
