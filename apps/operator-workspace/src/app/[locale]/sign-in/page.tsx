import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Card } from "@ranza/ui";
import { messages } from "../../../messages";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const today = localizeHref(locale, "today");
  if (await currentViewer()) redirect(today);

  const copy = messages[locale];

  return (
    <main className="main-content" id="main-content">
      <header className="page-intro">
        <h1>{copy.signInTitle}</h1>
        <p>{copy.signInSummary}</p>
      </header>
      <Card>
        <SignInForm copy={copy} redirectTo={today} />
      </Card>
    </main>
  );
}
