"use client";

import { localeFromPathname, messagesFor } from "@ranza/i18n";
import { FeedbackState } from "@ranza/ui";
import { usePathname } from "next/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = localeFromPathname(usePathname());
  const messages = messagesFor(locale);
  return (
    <main className="state-page">
      <FeedbackState
        actionLabel={messages.states.unexpected.action}
        description={messages.states.unexpected.description}
        onAction={reset}
        reference={error.digest ?? "RANZA-CONTROL"}
        referenceLabel={messages.common.supportReference}
        title={messages.states.unexpected.title}
        tone="error"
      />
    </main>
  );
}
