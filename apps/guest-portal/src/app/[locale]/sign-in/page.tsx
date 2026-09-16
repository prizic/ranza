import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { messages } from "../../../messages";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * Sign-in sits outside the (portal) group because the shell above it requires a
 * viewer, and requiring one here would redirect in a loop.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const stay = localizeHref(locale, "stay");
  if (await currentViewer()) redirect(stay);

  const copy = messages[locale];

  return (
    <main className="portal-gate" id="main-content">
      <h1>{copy.signInTitle}</h1>
      <p>{copy.signInSummary}</p>
      <SignInForm copy={copy} redirectTo={stay} />
    </main>
  );
}
