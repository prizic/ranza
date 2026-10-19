"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@ranza/ui";

/**
 * What a runtime failure on any Portal page shows: a sentence in the visitor's
 * language and a way to try again, not the framework's blank error. The
 * failure is logged with its digest, which the server logs under the same
 * number, because this application has no client error reporter yet and
 * nothing else records that a guest met this page.
 */
export default function PortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations();
  useEffect(() => {
    console.error("portal page failed", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center p-6">
      <EmptyState
        action={
          <Button onClick={() => unstable_retry()}>{t("tryAgain")}</Button>
        }
        description={t("errorBody")}
        title={t("errorTitle")}
      />
    </main>
  );
}
