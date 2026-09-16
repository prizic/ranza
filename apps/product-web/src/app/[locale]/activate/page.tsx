import { isSupportedLocale } from "@ranza/i18n";
import { notFound } from "next/navigation";
import { LocalizedShell } from "../../../components/localized-shell";
import { studentCredentialCopy } from "../../../lib/student-credential-copy";

export default async function ActivationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    activated?: string;
    recovered?: string;
    mode?: string;
    ref?: string;
  }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const t = studentCredentialCopy[locale];
  const recovery = query.mode === "recovery" || Boolean(query.recovered);
  return (
    <LocalizedShell locale={locale}>
      <h1>{recovery ? t.recoveryTitle : t.title}</h1>
      {query.error && (
        <p role="alert">
          {recovery ? t.recoveryError : t.error}
          {query.ref ? (
            <>
              {" "}
              {t.supportReference}: <bdi>{query.ref}</bdi>
            </>
          ) : null}
        </p>
      )}
      {query.activated || query.recovered ? (
        <>
          <p role="status">{recovery ? t.recoveryDone : t.done}</p>
          <a href={`/${locale}/student`}>{t.back}</a>
        </>
      ) : (
        <form
          action={`/${locale}/activate/exchange${recovery ? "?mode=recovery" : ""}`}
          method="post"
          autoComplete="off"
          className="control-card control-form"
        >
          <p id="activation-hint">{recovery ? t.recoveryHint : t.hint}</p>
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
            {recovery ? t.recoveryCode : t.code}
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
          <button type="submit">
            {recovery ? t.recoverySubmit : t.activate}
          </button>
        </form>
      )}
    </LocalizedShell>
  );
}
