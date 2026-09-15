import { isSupportedLocale } from "@ranza/i18n";
import { Button, Card, Input, StatusMessage } from "@ranza/ui";
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
      <header className="page-intro page-intro-compact">
        <h1>{t.title}</h1>
        <p id="activation-hint">{t.hint}</p>
      </header>
      {query.error && <StatusMessage tone="warning">{t.error}</StatusMessage>}
      {query.activated ? (
        <Card className="auth-card" tone="quiet">
          <StatusMessage tone="success">{t.done}</StatusMessage>
          <a className="button" href={`/${locale}`}>
            {t.back}
          </a>
        </Card>
      ) : (
        <Card className="auth-card">
          <form
            action={`/${locale}/activate/exchange`}
            method="post"
            autoComplete="off"
            className="control-form"
          >
            <label>
              {t.accessId}
              <Input
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
              <Input
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
              <Input
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
            <Button type="submit">{t.activate}</Button>
          </form>
        </Card>
      )}
    </LocalizedShell>
  );
}
