import { isSupportedLocale } from "@ranza/i18n";
import { notFound } from "next/navigation";
import { LocalizedShell } from "../../../components/localized-shell";
import { studentCredentialCopy } from "../../../lib/student-credential-copy";

export default async function ActivationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; activated?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const t = studentCredentialCopy[locale];
  return (
    <LocalizedShell locale={locale}>
      <h1>{t.title}</h1>
      {query.error && <p role="alert">{t.error}</p>}
      {query.activated ? (
        <>
          <p role="status">{t.done}</p>
          <a href={`/${locale}`}>{t.back}</a>
        </>
      ) : (
        <form
          action={`/${locale}/activate/exchange`}
          method="post"
          autoComplete="off"
          className="control-card"
        >
          <p id="activation-hint">{t.hint}</p>
          <label>
            {t.accessId}
            <input
              name="accessId"
              autoComplete="off"
              dir="ltr"
              required
              maxLength={128}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            {t.code}
            <input
              name="code"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              maxLength={64}
            />
          </label>
          <label>
            {t.pin}
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              minLength={6}
              maxLength={12}
              autoComplete="new-password"
              dir="ltr"
              required
              aria-describedby="activation-hint"
            />
          </label>
          <button type="submit">{t.activate}</button>
        </form>
      )}
    </LocalizedShell>
  );
}
