"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Button, EmptyState } from "@ranza/ui";

/**
 * What a route that failed to render says, with a way to try again.
 *
 * The error is recorded here and not swallowed: a boundary that only shows
 * "something went wrong" turns every failure into a message the person reads
 * and nobody else ever hears about. `event` names where it happened, and the
 * digest is the same one the server logged for the same failure
 * (`onRequestError`, in `instrumentation.ts`), so what the person is told to
 * quote finds the line that has the stack.
 *
 * A screen that has words of its own for its failure passes them as `copy`; the
 * way to try again, the reference and the log line are the same for all.
 */
export function RouteError({
  copy,
  error,
  event,
  exit = false,
  reset,
}: {
  copy?: { title: string; description: string; retry: string };
  error: Error & { digest?: string };
  /** `noun.verb`, as the other boundaries name theirs. */
  event: string;
  /**
   * Offers a way out to Today. For the boundary of the shell itself, where
   * nothing around the message leads anywhere, and trying again may fail the
   * same way (audit 2026-11-07, D-13).
   */
  exit?: boolean;
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  const router = useRouter();
  const locale = useLocale();
  const today = localizeHref(
    isSupportedLocale(locale) ? locale : "en",
    "today",
  );

  // A failure in a Server Component is not undone by drawing the same payload
  // again: the route is fetched afresh, and the boundary is cleared once it
  // has been.
  const tryAgain = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    console.error(event, { digest: error.digest, error });
  }, [error, event]);

  return (
    <EmptyState
      action={
        <div className="grid justify-items-start gap-3">
          <div className="flex flex-wrap gap-3">
            <Button onClick={tryAgain}>{copy?.retry ?? t("retry")}</Button>
            {exit ? (
              <Button asChild variant="outline">
                <a href={today}>{t("exit")}</a>
              </Button>
            ) : null}
          </div>
          {error.digest ? (
            <p className="text-step--1 text-muted-foreground">
              <bdi dir="ltr">{t("reference", { digest: error.digest })}</bdi>
            </p>
          ) : null}
        </div>
      }
      description={copy?.description ?? t("description")}
      title={copy?.title ?? t("title")}
    />
  );
}
