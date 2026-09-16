import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref, supportedLocales } from "@ranza/i18n";
import { BrandMark } from "@ranza/ui";
import { messages } from "../../../messages";
import { currentViewer } from "../../../server/viewer";
import { SignInForm } from "./sign-in-form";

/**
 * The gate. Deliberately not the workspace shell: there is no Organization, no
 * Property and no navigation yet, so showing the chrome would be showing an
 * empty version of it.
 */
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
    <main className="grid min-h-svh place-items-center px-(--page) py-10">
      <div className="w-full max-w-sm">
        <p className="flex items-center justify-center gap-2 text-step-1 font-semibold">
          <BrandMark className="size-6 text-primary" />
          <span>{copy.productName}</span>
        </p>

        <div className="mt-6 rounded-xl bg-card p-6 shadow-low">
          <h1 className="text-step-1 font-semibold">{copy.signInTitle}</h1>

          <SignInForm copy={copy} redirectTo={today} />
        </div>

        <nav
          aria-label={copy.languageLabel}
          className="mt-6 flex items-center justify-center gap-1 text-step--1"
        >
          {supportedLocales.map((supported) => (
            <a
              aria-current={supported === locale ? "true" : undefined}
              className="rounded-sm px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-secondary aria-[current=true]:text-foreground"
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
