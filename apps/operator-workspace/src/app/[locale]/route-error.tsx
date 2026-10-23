"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
 */
export function RouteError({
  error,
  event,
  reset,
}: {
  error: Error & { digest?: string };
  /** `noun.verb`, as the other boundaries name theirs. */
  event: string;
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  const router = useRouter();

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
          <Button onClick={tryAgain}>{t("retry")}</Button>
          {error.digest ? (
            <p className="text-step--1 text-muted-foreground">
              <bdi dir="ltr">{t("reference", { digest: error.digest })}</bdi>
            </p>
          ) : null}
        </div>
      }
      description={t("description")}
      title={t("title")}
    />
  );
}
