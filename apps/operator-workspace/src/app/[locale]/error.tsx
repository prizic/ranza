"use client";

import { RouteError } from "./route-error";

/**
 * What is outside the workspace shell — sign-in, and the shell itself when it
 * is the shell that failed. Inside the language provider, so it speaks the
 * page's language; a failure of the layout above is `global-error.tsx`.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} event="app.render_failed" reset={reset} />;
}
