import { formatDate, isSupportedLocale, messagesFor } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../components/localized-shell";
import { studentCredentialCopy } from "../../lib/student-credential-copy";

export default async function ProductWebPage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);
  const today = formatDate(new Date("2026-09-06T09:00:00.000Z"), locale, {
    timeZone: "Europe/Istanbul",
  });
  const modules = [
    ["attendance", messages.navigation.attendance],
    ["meals", messages.navigation.meals],
    ["announcements", messages.navigation.announcements],
    ["balance", messages.navigation.balance],
    ["wifi", messages.navigation.wifi],
  ] as const;
  return (
    <LocalizedShell locale={locale}>
      <a href={`/${locale}/student/sign-in`}>
        {studentCredentialCopy[locale].signIn}
      </a>
      <a href={`/${locale}/activate`}>{studentCredentialCopy[locale].title}</a>
      <form action={`/${locale}/student/sign-out`} method="post">
        <button type="submit" name="operation" value="signout">
          {studentCredentialCopy[locale].signOut}
        </button>
      </form>
      <a href={`/${locale}/student/attendance`}>
        {messages.navigation.attendance}
      </a>
      <section className="dayline" aria-label={today}>
        <span>{today}</span>
        <BidiText>IST-01 · 21:15 · TRY 1,250.00</BidiText>
      </section>
      <section className="module-list">
        {modules.map(([id, label], index) => (
          <article id={id} key={id}>
            <span aria-hidden="true" className="module-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2>{label}</h2>
            <span className="module-status">—</span>
          </article>
        ))}
      </section>
      <section className="install-panel">
        <div>
          <h2>{messages.product.install.title}</h2>
          <p>{messages.product.install.description}</p>
        </div>
        <a className="button" href="#install">
          {messages.product.install.action}
        </a>
      </section>
      <StatusMessage>{messages.states.formError.description}</StatusMessage>
    </LocalizedShell>
  );
}
