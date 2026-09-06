import { isSupportedLocale } from "@ranza/i18n";
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
      <h1>{t.signIn}</h1>
      {query.error && <p role="alert">{t.signInError}</p>}
      <form
        action={`/${locale}/student/sign-in/exchange`}
        method="post"
        className="control-card"
      >
        <p id="signin-hint">{t.signInHint}</p>
        <label>
          {t.accessId}
          <input
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
          <input
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
        <button type="submit">{t.signIn}</button>
      </form>
      <a href={`/${locale}/activate`}>{t.title}</a>
    </LocalizedShell>
  );
}
