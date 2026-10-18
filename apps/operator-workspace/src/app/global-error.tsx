"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { defaultLocale, directionFor, isSupportedLocale } from "@ranza/i18n";
import { Button } from "@ranza/ui";
import { errorBoundary } from "../error-boundary-copy";
import "./globals.css";

/**
 * The last boundary: the root layout itself failed, so there is no language
 * provider, no theme and no shell, and this has to draw its own `<html>`.
 *
 * It reads the language from the address, because nothing else is left to ask,
 * and takes its words from the same catalogue as every other screen. The error
 * is recorded as the others are, with the digest the server logged
 * (`onRequestError`).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const segment = usePathname()?.split("/")[1];
  const locale = isSupportedLocale(segment) ? segment : defaultLocale;
  const say = errorBoundary[locale];

  useEffect(() => {
    console.error("app.root_render_failed", { digest: error.digest, error });
  }, [error]);

  return (
    <html dir={directionFor(locale)} lang={locale}>
      <body>
        <main className="mx-auto grid max-w-prose gap-3 px-6 py-16">
          <h1 className="text-step-1 font-normal">{say.title}</h1>
          <p className="text-muted-foreground">{say.description}</p>
          <div className="grid justify-items-start gap-3">
            <Button onClick={reset}>{say.retry}</Button>
            {error.digest ? (
              <p className="text-step--1 text-muted-foreground">
                <bdi dir="ltr">
                  {say.reference.replace("{digest}", error.digest)}
                </bdi>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
