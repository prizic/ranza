import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { BrandMark } from "@ranza/ui";
import { messages } from "../../../messages";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * The gate. Deliberately not the Portal shell: there is no Stay and no
 * navigation yet, so showing the chrome would be showing an empty version of
 * it. It also sits outside the (portal) group, whose layout requires a viewer
 * and would otherwise redirect here in a loop.
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
    <main className="gate">
      <div className="gate-inner">
        <p className="brand">
          <BrandMark />
          <span>{copy.productName}</span>
        </p>

        <h1>{copy.signInTitle}</h1>
        <p>{copy.signInSummary}</p>

        <SignInForm copy={copy} redirectTo={stay} />

        <nav
          aria-label={copy.languageLabel}
          className="locale-nav gate-locales"
        >
          {supportedLocales.map((supported) => (
            <a
              aria-current={supported === locale ? "true" : undefined}
              href={localizeHref(supported, "sign-in")}
              hrefLang={supported}
              key={supported}
              lang={supported}
            >
              {supported.toUpperCase()}
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
