"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";
import { retryOperationAction } from "../../../server/integrations";

interface RetryButtonProps {
  locale: string;
  propertyId: string;
  operationId: string;
}

export function RetryButton({
  locale,
  propertyId,
  operationId,
}: RetryButtonProps) {
  const t = useTranslations("integrations");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleRetry() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await retryOperationAction(
        locale,
        propertyId,
        operationId,
      );
      if (result.status === "error" || result.status === "refused") {
        setErrorMessage(result.message || t("retryFailed"));
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        aria-label={t("retry")}
        disabled={isPending}
        onClick={handleRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${isPending ? "animate-spin" : ""}`}
        />
        <span>{isPending ? t("retrying") : t("retry")}</span>
      </Button>
      {errorMessage ? (
        <span
          className="text-step--2 text-destructive font-medium"
          role="alert"
        >
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
